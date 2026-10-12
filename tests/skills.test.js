const test = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../skills/registry');
const playSound = require('../skills/play-sound');
const journal = require('../skills/journal');
const storage = require('../services/storage');

function withWx(store, fn) {
  const originalWx = global.wx;
  const originalGetApp = global.getApp;
  global.wx = {
    getStorageSync: (key) => (key in store ? store[key] : ''),
    setStorageSync: (key, value) => { store[key] = value; return true; }
  };
  global.getApp = () => null; // storage.saveSettings 会调用 getApp，测试环境无 App 实例
  try {
    return fn();
  } finally {
    if (originalWx) global.wx = originalWx; else delete global.wx;
    if (originalGetApp) global.getApp = originalGetApp; else delete global.getApp;
  }
}

test('registry defaults grant all skills auto permission and persists changes', () => {
  withWx({}, () => {
    assert.equal(registry.getPermission('play_sound'), 'auto');
    assert.equal(registry.getPermission('stop_sound'), 'auto');
    assert.equal(registry.getPermission('journal'), 'auto');
    assert.equal(registry.getPermission('unknown_skill'), 'off');
    registry.setPermission('journal', 'confirm');
    assert.equal(registry.getPermission('journal'), 'confirm');
    registry.setPermission('journal', 'off');
    assert.equal(registry.getPermission('journal'), 'off');
    assert.equal(registry.setPermission('nope', 'auto'), null);
  });
});

test('skill prompt section forbids pretending to act and includes the no-skill fallback', () => {
  withWx({}, () => {
    const all = registry.buildSkillPromptSection();
    assert.ok(all.indexOf('play_sound') !== -1);
    assert.ok(all.indexOf('stop_sound') !== -1);
    assert.ok(all.indexOf('绝对禁止口头假装执行') !== -1);
    registry.setPermission('play_sound', 'off');
    registry.setPermission('stop_sound', 'off');
    registry.setPermission('journal', 'off');
    assert.ok(registry.buildSkillPromptSection().indexOf('不要假装执行') !== -1);
  });
});

test('stop_sound pauses playback through the app audio api', () => {
  withWx({}, () => {
    const calls = [];
    global.getApp = () => ({ pauseSound: () => calls.push('pause') });
    const outcome = registry.run({ skill: 'stop_sound', args: {} });
    assert.equal(outcome.status, 'executed');
    assert.deepEqual(calls, ['pause']);
    assert.ok(outcome.message.indexOf('已停止') !== -1);
    delete global.getApp;
    global.getApp = () => null;
    assert.equal(registry.executeNow({ skill: 'stop_sound', args: {} }).status, 'failed');
  });
});

test('parseSkillCall waits for closed json and rejects malformed payloads', () => {
  assert.equal(registry.parseSkillCall('正文'), null);
  assert.equal(registry.parseSkillCall('正文\n@@DO@@{"skill":"play_sound"'), null); // 未闭合
  assert.deepEqual(
    registry.parseSkillCall('@@DO@@{"skill":"play_sound","args":{"sound":"rain","minutes":15}}'),
    { skill: 'play_sound', args: { sound: 'rain', minutes: 15 } }
  );
  // 没有花括号：视为尚未闭合，继续等待（流式期间可能只收到标记的一半）
  assert.equal(registry.parseSkillCall('@@DO@@not json'), null);
  // JSON 完整但缺 skill 字段：invalid
  assert.equal(registry.parseSkillCall('@@DO@@{"args":{}}').invalid, true);
  // JSON 闭合但语法错误：invalid
  assert.equal(registry.parseSkillCall('@@DO@@{"skill":oops}').invalid, true);
});

test('run respects permissions: auto executes, confirm asks, off refuses', () => {
  withWx({}, () => {
    const calls = [];
    global.getApp = () => ({ playSound: (...args) => calls.push(args) });
    const outcome = registry.run({ skill: 'play_sound', args: { sound: 'rain', minutes: 15 } });
    assert.equal(outcome.status, 'executed');
    assert.deepEqual(calls, [['rain', undefined, 15]]);

    registry.setPermission('play_sound', 'confirm');
    assert.equal(registry.run({ skill: 'play_sound', args: {} }).status, 'needConfirm');

    registry.setPermission('play_sound', 'off');
    assert.equal(registry.run({ skill: 'play_sound', args: {} }).status, 'off');
    assert.equal(registry.run({ skill: 'unknown' }).status, 'unknown');
  });
});

test('play_sound clamps sound and minutes to supported values', () => {
  withWx({}, () => {
    const calls = [];
    global.getApp = () => ({ playSound: (...args) => calls.push(args) });
    const outcome = playSound.execute({ sound: 'disco', minutes: 99 });
    assert.equal(outcome.ok, true);
    assert.deepEqual(calls, [['breeze', undefined, 30]]);
    assert.ok(outcome.message.indexOf('微风') !== -1);
    const missing = playSound.execute({});
    assert.equal(missing.ok, true);
    delete global.getApp;
    assert.equal(playSound.execute({}).ok, false);
  });
});

test('journal writes spoken items using the journal storage contract', () => {
  withWx({}, () => {
    const outcome = journal.execute({ items: ['室友帮我带了饭', '', '晚霞很好看', '多余的一条'] });
    assert.equal(outcome.ok, true);
    const entries = storage.read(storage.KEYS.journal, []);
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0].items, ['室友帮我带了饭', '晚霞很好看', '多余的一条']);
    assert.ok(journal.execute({ items: ['x'.repeat(60)] }).ok);
    assert.equal(storage.read(storage.KEYS.journal, [])[0].items[0].length, 24);
    assert.equal(journal.execute({ items: [] }).ok, false);
    assert.equal(journal.execute(null).ok, false);
  });
});

test('confirm text names the skill and summarizes its arguments', () => {
  assert.ok(registry.confirmText({ skill: 'play_sound', args: { sound: 'rain' } }).indexOf('播放环境声') !== -1);
  assert.ok(registry.confirmText({ skill: 'journal', args: { items: ['晚饭'] } }).indexOf('items') !== -1);
});
