const navigation = require('../../utils/navigation');
const { getNavigationMetrics } = require('../../utils/layout');
const nightPreferences = require('../../services/night-preferences');
const guide = require('../../utils/agent-guide');
const agentContext = require('../../utils/agent-context');
const agentMemory = require('../../services/agent-memory');
const agentClient = require('../../services/agent-client');
const skillRegistry = require('../../skills/registry');

const RENDER_THROTTLE_MS = 80;

Page({
  data: {
    nav: getNavigationMetrics(),
    topics: [
      { id: 'exam', label: '考试焦虑', icon: 'graduation-cap', prompt: '最近考试让我有点焦虑。' },
      { id: 'research', label: '论文 / 科研压力', icon: 'file-text', prompt: '论文和科研的压力让我难以放松。' },
      { id: 'dorm', label: '宿舍难以放松', icon: 'bed-double', prompt: '在宿舍里，我总是很难放松。' },
      { id: 'thoughts', label: '脑子停不下来', icon: 'brain', prompt: '到了晚上，我的脑子还是停不下来。' }
    ],
    showChat: false,
    homeState: 'initial', messages: [], answers: [], recommendation: null, activeTopic: '', scrollAnchor: '',
    showRecords: false,
    draft: '',
    canSend: false,
    awaitingFirst: false,
    message: '',
    chatState: 'idle',
    recording: false,
    voiceReady: false,
    keyboardHeight: 0,
    inputFocus: false,
    recentSessions: [],
    totalBreaths: 0,
    sevenDay: { activeDays: 0, completedSessions: 0, outcomes: { relieved: 0, same: 0, tense: 0 } }
  },
  onLoad() {
    this.recorder = wx.getRecorderManager ? wx.getRecorderManager() : null;
    if (this.recorder && this.recorder.onStop) this.recorder.onStop((result) => this.setData({ recording: false, voiceReady: Boolean(result && result.tempFilePath) }));
    this.keyboardListener = (event) => {
      this.setData({ keyboardHeight: this.data.showChat ? Math.max(0, event.height || 0) : 0 });
    };
    if (wx.onKeyboardHeightChange) wx.onKeyboardHeightChange(this.keyboardListener);
  },
  onShow() {
    const preferences = nightPreferences.read();
    this.setData({ nav: getNavigationMetrics(), preferences, welcomeQuestion: preferences.question, displayMode: preferences.display, fontMode: preferences.fontSize });
    wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
  },
  onHide() {
    this.cancelPending();
    this.setData({ inputFocus: false, keyboardHeight: 0 });
  },
  onUnload() {
    this.cancelPending();
    if (wx.offKeyboardHeightChange && this.keyboardListener) wx.offKeyboardHeightChange(this.keyboardListener);
  },
  onShareAppMessage() { return { title: '夜喵，你的 AI 睡前陪伴助手', path: '/pages/agent/index' }; },
  onShareTimeline() { return { title: '夜喵，你的 AI 睡前陪伴助手' }; },
  noop() {},
  openSettings() { wx.navigateTo({ url: '/pages/night-settings/index' }); },
  goBreathe() { wx.reLaunch({ url: '/pages/breathe/index' }); },
  startGuide() { wx.navigateTo({ url: '/pages/focus/index' }); },
  goPage(event) {
    this.setData({ showRecords: false });
    wx.navigateTo({ url: event.currentTarget.dataset.url });
  },
  openRecords() { wx.reLaunch({ url: '/pages/record/index' }); },
  closeRecords() { this.setData({ showRecords: false }); },
  openChat() { if (this.data.homeState === 'initial') this.beginConversation(''); this.setData({ inputFocus: true }); },
  buildOpening(topic) {
    if (topic && guide.openings[topic]) return guide.openings[topic];
    const last = agentMemory.lastMemory();
    if (last && last.summary) return `上次你和我聊到「${last.summary}」。今晚还是这件事，还是有新的心事？`;
    return this.data.welcomeQuestion || '今晚有什么让你难以放松？';
  },
  beginConversation(topic) {
    this.setData({ homeState: 'chat', showChat: true, activeTopic: topic, answers: [], recommendation: null, messages: [{ id: 'intro', role: 'agent', text: this.buildOpening(topic) }], draft: '', canSend: false, awaitingFirst: false, inputFocus: false, scrollAnchor: 'conversation-end' });
  },
  playRecommendation() {
    const item = this.data.recommendation;
    if (item) wx.navigateTo({ url: `/pages/sound/index?sound=${item.sound}&minutes=${item.minutes}` });
  },
  openChatSettings() { wx.navigateTo({ url: '/pages/night-settings/index?from=chat' }); },
  startVoice() {
    if (!this.recorder || this.data.recording) return;
    this.setData({ recording: true, voiceReady: false });
    try { this.recorder.start({ format: 'mp3', duration: 60000 }); } catch (error) { this.setData({ recording: false }); }
  },
  stopVoice() { if (this.recorder && this.data.recording) this.recorder.stop(); },
  cancelVoice() { if (this.recorder && this.data.recording) this.recorder.stop(); this.setData({ recording: false, voiceReady: false }); },
  chooseTopic(event) {
    const topic = this.data.topics.find((item) => item.id === event.currentTarget.dataset.id);
    if (!topic) return;
    this.beginConversation(topic.id);
  },
  closeChat() {
    this.cancelPending();
    if (this.data.messages.length > 1) {
      // 后台生成对话摘要供下次开场使用；失败静默跳过，不阻塞返回首页。
      agentMemory.summarizeConversation(this.data.messages, this.data.activeTopic);
    }
    if (wx.hideKeyboard) wx.hideKeyboard();
    this.setData({ homeState: 'initial', showChat: false, messages: [], answers: [], recommendation: null, draft: '', canSend: false, awaitingFirst: false, chatState: 'idle', inputFocus: false, keyboardHeight: 0 });
  },
  onDraftChange(event) { this.setData({ draft: event.detail.value, canSend: Boolean(event.detail.value.trim()) }); },
  onInputFocus() { this.setData({ inputFocus: true }); },
  onInputBlur() { this.setData({ inputFocus: false }); },
  cancelPending() {
    if (this.renderTimer) { clearTimeout(this.renderTimer); this.renderTimer = null; }
    if (this.pendingAgent) {
      this.pendingAgent.abort();
      this.pendingAgent = null;
    }
    if (this.data.chatState === 'sending') this.setData({ chatState: 'error' });
  },
  // 执行一轮对话请求（发送与重试共用）：agentId 对应气泡已存在于 messages 中。
  runAgentTurn(turn) {
    const { agentId, history, answers } = turn;
    if (this.pendingAgent) this.pendingAgent.abort();
    this.renderedAgentText = null;
    this.renderTimer = null;
    this.updateAgentText = (text) => {
      if (!text || text === this.renderedAgentText) return;
      if (this.data.awaitingFirst) this.setData({ awaitingFirst: false });
      if (this.renderTimer) return; // 已有排期，等节流窗口到期后统一渲染
      this.renderTimer = setTimeout(() => {
        this.renderTimer = null;
        this.flushAgentText(text);
      }, RENDER_THROTTLE_MS);
    };
    this.flushAgentText = (text) => {
      this.renderedAgentText = text;
      const index = this.data.messages.findIndex((item) => item.id === agentId);
      if (index === -1) return;
      const messages = this.data.messages.slice();
      messages[index] = Object.assign({}, messages[index], { text });
      this.setData({ messages, scrollAnchor: '' });
      this.setData({ scrollAnchor: 'conversation-end' });
    };
    this.pendingAgent = agentClient.chat({
      topic: this.data.activeTopic,
      history,
      answers,
      context: agentContext.buildUserContext(),
      onDelta: (text) => this.updateAgentText(text),
      onComplete: (result) => {
        this.pendingAgent = null;
        if (this.data.homeState === 'initial') return; // 对话已被关闭，丢弃迟到的回复
        if (this.renderTimer) { clearTimeout(this.renderTimer); this.renderTimer = null; }
        this.flushAgentText(result.text);
        this.setData({
          chatState: 'idle',
          awaitingFirst: false,
          recommendation: result.recommendation || null,
          homeState: result.recommendation ? 'recommendation' : 'chat'
        });
        if (result.skillCall && !result.skillCall.invalid) this.handleSkillCall(result.skillCall);
      },
      onError: () => {
        this.pendingAgent = null;
        this.setData({ chatState: 'error', awaitingFirst: false });
      }
    });
  },
  sendMessage() {
    const message = this.data.draft.trim();
    if (!message || this.data.chatState === 'sending') return;
    const answers = this.data.answers.concat(message);
    const history = this.data.messages.concat([{ id: `user-${answers.length}`, role: 'user', text: message }]);
    const agentId = `agent-${answers.length}`;
    this.setData({
      message,
      answers,
      messages: history.concat([{ id: agentId, role: 'agent', text: '' }]),
      recommendation: null,
      homeState: 'chat',
      draft: '',
      canSend: false,
      chatState: 'sending',
      awaitingFirst: true,
      inputFocus: false,
      scrollAnchor: ''
    });
    this.setData({ scrollAnchor: 'conversation-end' });
    if (wx.hideKeyboard) wx.hideKeyboard();
    this.lastTurn = { agentId, history, answers };
    this.runAgentTurn(this.lastTurn);
  },
  // 失败重试：复用同一轮的历史与气泡，不在消息列表中重复用户发言。
  retryTurn() {
    const turn = this.lastTurn;
    if (!turn || this.data.chatState === 'sending') return;
    const index = this.data.messages.findIndex((item) => item.id === turn.agentId);
    if (index === -1) return;
    const messages = this.data.messages.slice();
    messages[index] = Object.assign({}, messages[index], { text: '' });
    this.setData({ messages, chatState: 'sending', awaitingFirst: true, recommendation: null, homeState: 'chat' });
    this.runAgentTurn(turn);
  },
  // 模型发起技能调用：按个性化权限分流。
  handleSkillCall(call) {
    const permission = skillRegistry.getPermission(call.skill);
    if (permission === 'confirm') {
      const messages = this.data.messages.concat([{
        id: `skill-confirm-${Date.now()}`,
        role: 'skill-confirm',
        text: skillRegistry.confirmText(call),
        call
      }]);
      this.setData({ messages, scrollAnchor: '' });
      this.setData({ scrollAnchor: 'conversation-end' });
      return;
    }
    const outcome = skillRegistry.run(call);
    this.appendSkillOutcome(call, outcome);
  },
  appendSkillOutcome(call, outcome) {
    const messages = this.data.messages.concat([{
      id: `skill-${Date.now()}`,
      role: 'skill',
      text: outcome.message || '操作已完成',
      skill: call.skill
    }]);
    this.setData({ messages, scrollAnchor: '' });
    this.setData({ scrollAnchor: 'conversation-end' });
  },
  goSoundPage() { wx.navigateTo({ url: '/pages/sound/index' }); },
  // 确认卡：用户点「执行」。
  confirmSkill(event) {
    const id = event.currentTarget.dataset.id;
    const index = this.data.messages.findIndex((item) => item.id === id);
    if (index === -1 || this.data.messages[index].role !== 'skill-confirm') return;
    const call = this.data.messages[index].call;
    const outcome = skillRegistry.executeNow(call);
    const messages = this.data.messages.slice();
    messages[index] = { id, role: 'skill', text: outcome.message || '操作已完成', skill: call.skill };
    this.setData({ messages, scrollAnchor: '' });
    this.setData({ scrollAnchor: 'conversation-end' });
  },
  // 确认卡：用户点「取消」。
  cancelSkill(event) {
    const id = event.currentTarget.dataset.id;
    const index = this.data.messages.findIndex((item) => item.id === id);
    if (index === -1 || this.data.messages[index].role !== 'skill-confirm') return;
    const messages = this.data.messages.slice();
    messages[index] = { id, role: 'skill', text: '已取消，今晚先不做这个' };
    this.setData({ messages });
  }
});
