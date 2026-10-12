// 夜喵的跨会话记忆：每次对话结束后，在后台调用网关生成一句话摘要并保存。
// 下次对话时注入上下文并个性化开场白。摘要属于个人记录，随「清除个人记录」一起删除。

const storage = require('./storage');

let secrets;
try {
  secrets = require('./secrets');
} catch (error) {
  secrets = require('./secrets.example.js');
}

const MEMORY_LIMIT = 3;
const SUMMARY_MAX_CHARS = 40;
const REQUEST_TIMEOUT_MS = 15000;

function recall() {
  try {
    const list = storage.read(storage.KEYS.agentMemory, []);
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
}

function lastMemory() {
  return recall()[0] || null;
}

function remember(entry) {
  const summary = entry && typeof entry.summary === 'string' ? entry.summary.trim().slice(0, SUMMARY_MAX_CHARS) : '';
  if (!summary) return false;
  const list = recall();
  list.unshift({ at: entry.at || Date.now(), topic: entry.topic || '', summary });
  return storage.write(storage.KEYS.agentMemory, list.slice(0, MEMORY_LIMIT));
}

function formatWhen(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '上次';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

const FEELING_LABELS = { 1: '很差', 2: '较差', 3: '一般', 4: '不错', 5: '很好' };

function memoryFilePath() {
  return `${wx.env.USER_DATA_PATH}/memory.md`;
}

// 把夜喵的全部记忆渲染为人类可读的 markdown 档案。
function renderMemoryMarkdown() {
  const lines = ['# 夜喵的记忆', '', '> 这些内容只保存在你的手机上，你可以随时查看或清除。', ''];
  const sessions = Array.isArray(storage.getSessions()) ? storage.getSessions() : [];
  const totalCycles = sessions.reduce((sum, item) => sum + (Number(item.cycles) || 0), 0);
  if (totalCycles > 0) {
    const summary = storage.getSevenDaySummary(Date.now(), sessions);
    lines.push('## 练习近况', '', `- 累计完成 ${totalCycles} 轮呼吸`);
    lines.push(`- 近 7 天练习 ${summary.completedSessions} 次（${summary.activeDays} 天有练习），练后感到放松 ${summary.outcomes.relieved} 次、差不多 ${summary.outcomes.same} 次、还紧绷 ${summary.outcomes.tense} 次`, '');
  }
  const sleepRecords = Array.isArray(storage.read(storage.KEYS.sleep, [])) ? storage.read(storage.KEYS.sleep, []) : [];
  if (sleepRecords.length) {
    lines.push('## 最近几晚的睡眠', '');
    sleepRecords.slice(0, 3).forEach((item) => {
      const feeling = FEELING_LABELS[item.feeling] || item.feeling || '未记录';
      lines.push(`- ${item.nightDate || item.date || '最近'}：${item.bedTime || '—'} 上床，${item.wakeTime || '—'} 起床，${item.duration || '时长未记录'}，感受「${feeling}」`);
    });
    lines.push('');
  }
  const journals = Array.isArray(storage.read(storage.KEYS.journal, [])) ? storage.read(storage.KEYS.journal, []) : [];
  if (journals.length) {
    lines.push('## 最近的感恩日记', '');
    journals.slice(0, 3).forEach((entry) => {
      const items = (Array.isArray(entry.items) ? entry.items : []).filter(Boolean);
      if (items.length) lines.push(`- ${entry.date || '某天'}：${items.join('；')}`);
    });
    lines.push('');
  }
  const memories = recall();
  if (memories.length) {
    lines.push('## 我们聊过', '');
    memories.forEach((item) => lines.push(`- ${formatWhen(item.at)}：${item.summary}`));
    lines.push('');
  }
  if (lines.length <= 5) lines.push('夜喵还没有记住什么。多聊几次、多做几次练习，这里会慢慢丰富起来。');
  lines.push('---', '', `更新于 ${new Date().toLocaleString('zh-CN')}`);
  return lines.join('\n');
}

// 把档案写入用户文件目录；失败静默（档案页每次打开都会重新渲染）。
function writeMemoryFile() {
  if (typeof wx === 'undefined' || !wx.getFileSystemManager) return false;
  try {
    wx.getFileSystemManager().writeFileSync(memoryFilePath(), renderMemoryMarkdown(), 'utf8');
    return true;
  } catch (error) {
    return false;
  }
}

function readMemoryFile() {
  if (typeof wx === 'undefined' || !wx.getFileSystemManager) return '';
  try {
    return wx.getFileSystemManager().readFileSync(memoryFilePath(), 'utf8');
  } catch (error) {
    return '';
  }
}

// 仅清除对话记忆并重写档案（用户的练习/睡眠/日记记录不受影响）。
function clearConversationMemory() {
  const cleared = storage.write(storage.KEYS.agentMemory, []);
  writeMemoryFile();
  return cleared;
}

// 把一次对话的消息列表压缩成给摘要模型的输入。
function buildTranscript(messages) {
  return (Array.isArray(messages) ? messages : [])
    .filter((item) => item && typeof item.text === 'string' && item.text.trim())
    .slice(-8)
    .map((item) => `${item.role === 'user' ? '用户' : '夜喵'}：${item.text.trim()}`)
    .join('\n');
}

// 对话结束后台摘要：done(summary|null) 可选；wx 不可用或请求失败时静默跳过。
function summarizeConversation(messages, topic, done) {
  const transcript = buildTranscript(messages);
  const hasUserTurn = transcript.split('\n').some((line) => line.indexOf('用户：') === 0);
  if (!transcript || !hasUserTurn) {
    if (done) done(null);
    return;
  }
  if (typeof wx === 'undefined' || !wx.request) {
    if (done) done(null);
    return;
  }
  try {
    wx.request({
      url: secrets.modelGateway.baseUrl,
      method: 'POST',
      timeout: REQUEST_TIMEOUT_MS,
      header: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secrets.modelGateway.apiKey}`
      },
      data: {
        model: secrets.modelGateway.model,
        stream: false,
        temperature: 0.3,
        max_tokens: 80,
        messages: [
          { role: 'system', content: `你在为睡前陪伴应用生成对话记忆。用不超过30个字概括这位大学生用户倾诉的主要困扰和情绪。只输出概括本身，不要引号、标点结尾或任何解释。` },
          { role: 'user', content: transcript }
        ]
      },
      success(res) {
        const content = res && res.data && res.data.choices && res.data.choices[0]
          && res.data.choices[0].message && res.data.choices[0].message.content;
        const summary = typeof content === 'string' ? content.trim().slice(0, SUMMARY_MAX_CHARS) : '';
        if (summary) {
          remember({ at: Date.now(), topic, summary });
          writeMemoryFile(); // 记忆更新后同步刷新档案
        }
        if (done) done(summary || null);
      },
      fail() {
        if (done) done(null);
      }
    });
  } catch (error) {
    if (done) done(null);
  }
}

module.exports = { recall, lastMemory, remember, summarizeConversation, buildTranscript, formatWhen, renderMemoryMarkdown, writeMemoryFile, readMemoryFile, clearConversationMemory };
