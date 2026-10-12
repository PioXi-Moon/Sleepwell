const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const storage = require('../services/storage');

// 页面级测试沙箱：可配置 wx.request 行为（流式任务 / 直接抛错）。
function harness({ request } = {}) {
  let page;
  let timer;
  const store = {};
  const clipboard = [];
  const wx = {
    getWindowInfo: () => ({ windowWidth: 375, statusBarHeight: 24 }),
    getMenuButtonBoundingClientRect: () => ({ top: 32, bottom: 64, left: 279 }),
    getStorageSync: (key) => store[key] || '',
    setStorageSync: (key, value) => { store[key] = value; return true; },
    showShareMenu() {}, hideKeyboard() {},
    onKeyboardHeightChange() {}, offKeyboardHeightChange() {},
    setClipboardData: ({ data }) => clipboard.push(data),
    navigateTo() {}, reLaunch() {},
    request: request || (() => { throw new Error('network down'); })
  };
  const script = path.resolve(__dirname, '../pages/agent/index.js');
  global.wx = wx; // 服务模块（agent-client/storage）从 Node global 读取 wx
  const context = {
    wx,
    Page: (definition) => { page = definition; },
    require: (name) => require(path.resolve(path.dirname(script), name)),
    setTimeout: (fn) => { timer = fn; return 1; },
    clearTimeout: () => { timer = null; }
  };
  vm.runInNewContext(fs.readFileSync(script, 'utf8'), context);
  page.setData = (values) => Object.assign(page.data, values);
  page.onLoad();
  return { page, store, clipboard, finish: () => { const fn = timer; timer = null; if (fn) fn(); } };
}

function startChat(page, text) {
  page.openChat();
  page.onDraftChange({ detail: { value: text } });
  page.sendMessage();
}

test('like and dislike toggle exclusively and aggregate counts persist', () => {
  const { page, store } = harness();
  startChat(page, '最近睡不着');
  const agentMsg = page.data.messages.find((item) => item.role === 'agent' && item.done);
  assert.ok(agentMsg, 'agent reply should be marked done');
  page.setFeedback({ currentTarget: { dataset: { id: agentMsg.id, value: 'like' } } });
  assert.equal(page.data.messages.find((item) => item.id === agentMsg.id).feedback, 'like');
  page.setFeedback({ currentTarget: { dataset: { id: agentMsg.id, value: 'dislike' } } });
  assert.equal(page.data.messages.find((item) => item.id === agentMsg.id).feedback, 'dislike');
  page.setFeedback({ currentTarget: { dataset: { id: agentMsg.id, value: 'dislike' } } });
  assert.equal(page.data.messages.find((item) => item.id === agentMsg.id).feedback, '');
  const counts = store[storage.KEYS.agentFeedback];
  assert.equal(counts.like, 1);
  assert.equal(counts.dislike, 1);
});

test('copy sends the message text to the clipboard', () => {
  const { page, clipboard } = harness();
  startChat(page, '你好');
  const agentMsg = page.data.messages.find((item) => item.role === 'agent' && item.done);
  page.copyMessage({ currentTarget: { dataset: { id: agentMsg.id } } });
  assert.deepEqual(clipboard, [agentMsg.text]);
});

test('regenerate reruns the last turn without duplicating the user message', () => {
  const { page } = harness();
  startChat(page, '考试让我焦虑');
  const before = page.data.messages.length;
  page.regenerate();
  assert.equal(page.data.messages.length, before);
  assert.equal(page.data.messages.filter((item) => item.role === 'user').length, 1);
  const agentMsg = page.data.messages.find((item) => item.role === 'agent' && item.id !== 'intro');
  assert.ok(agentMsg.text.length > 0);
  assert.equal(agentMsg.done, true);
});

test('stop generation keeps streamed text and settles to idle', () => {
  let chunkHandler = null;
  const { page } = harness({
    request: () => ({ onChunkReceived: (cb) => { chunkHandler = cb; }, abort() {} })
  });
  startChat(page, '陪我聊一会');
  assert.equal(page.data.chatState, 'sending');
  chunkHandler({ data: Buffer.from('data: {"choices":[{"delta":{"content":"我在，慢慢说。"}}]}\n\n', 'utf8') });
  page.stopGeneration();
  const agentMsg = page.data.messages.find((item) => item.role === 'agent' && item.id !== 'intro');
  assert.equal(agentMsg.text, '我在，慢慢说。');
  assert.equal(agentMsg.done, true);
  assert.equal(page.data.chatState, 'idle');
  assert.equal(page.data.awaitingFirst, false);
});

test('message action icons are exposed to the view layer', () => {
  const { page } = harness();
  assert.ok(page.data.icons.like.indexOf('data:image/svg+xml') === 0);
  assert.ok(page.data.icons.stop.indexOf('data:image/svg+xml') === 0);
  assert.notEqual(page.data.icons.like, page.data.icons.likeActive);
});
