const prefs = require('../../services/night-preferences');
const storage = require('../../services/storage');
const navigation = require('../../utils/navigation');
const { getNavigationMetrics } = require('../../utils/layout');
const options = {
  personality: ['温柔陪伴','安静倾听','鼓励提醒','简洁高效'],
  voice: ['温柔女声','沉稳男声','自然环境声'],
  companion: ['温柔陪伴','安静倾听','喜欢短时间练习'],
  question: ['今天过得怎么样？','什么让你难以放松？','想开始今晚的睡前练习吗？'],
  display: ['沉浸模式','简洁模式','完整模式'],
  fontSize: ['小','标准','大']
};
Page({
  onLoad() {},
  data: { nav: getNavigationMetrics(), prefs: prefs.read(), panel: '', panelTitle: '', panelText: '', advanced: false, concerns: ['睡前容易焦虑','脑子停不下来','喜欢短时间练习'], selectedConcerns: [], version: '开发版' },
  onLoad(options = {}) { this.setData({ fromChat: options.from === 'chat' }); },
  onShow() {
    let version = '开发版';
    try { const info = wx.getAccountInfoSync(); version = info.miniProgram.version || info.miniProgram.envVersion || version; } catch (error) {}
    this.setData({ nav: getNavigationMetrics(), prefs: prefs.read(), version });
    this.syncConcerns();
  },
  syncConcerns() { this.setData({ selectedConcerns: this.data.concerns.map((label) => ({ label, checked: this.data.prefs.concerns.indexOf(label) >= 0 })) }); },
  goBack() { navigation.backOrHome(); },
  update(changes) { const next = prefs.save(changes); if (!next) { wx.showToast({ title:'保存失败，请重试',icon:'none' }); return; } this.setData({ prefs: next }); this.syncConcerns(); },
  choose(event) {
    const key = event.currentTarget.dataset.key;
    if (!options[key]) return;
    wx.showActionSheet({ itemList: options[key], success: ({ tapIndex }) => this.update({ [key]: options[key][tapIndex] }) });
  },
  toggle(event) { this.update({ [event.currentTarget.dataset.key]: event.detail.value }); },
  changeBedtime(event) { this.update({ bedtime: event.detail.value }); },
  changeConcerns(event) { this.update({ concerns: event.detail.value }); },
  openPreferences() { this.setData({ panel:'preferences',panelTitle:'我的睡前偏好' }); },
  manageMemory() { this.setData({ panel:'memory',panelTitle:'夜喵记忆' }); },
  deleteMemory() { wx.showModal({ title:'删除夜喵记忆？',content:'删除本机保存的睡前时间、陪伴偏好和困扰，并关闭记忆。日记与睡眠记录会保留。', confirmText:'删除', success: ({ confirm }) => { if (!confirm) return; const next = prefs.clearMemory(); if (next) { this.setData({ prefs:next }); this.syncConcerns(); wx.showToast({ title:'记忆已删除',icon:'none' }); } else wx.showToast({ title:'删除失败，请重试',icon:'none' }); } }); },
  closePanel() { this.setData({ panel:'' }); },
  advanced() { this.setData({ advanced: !this.data.advanced }); },
  info(event) {
    const key = event.currentTarget.dataset.key;
    const content = {
      model: ['默认对话模型','夜喵智能模型尚未接入，当前对话为界面预览。'],
      api: ['自定义 API','高级接口尚未接入。正式接入需由服务端代理请求，避免把 API 密钥保存在小程序客户端。'],
      reminder: ['提醒设置','尚未配置微信订阅消息模板与发送服务，当前不能开启真实通知。睡前提醒、早睡打卡提醒和感恩日记提醒将在接入后提供。'],
      login: ['微信账号','微信账号登录服务尚未接入，当前使用本地数据。'],
      guide: ['重新认识好眠猫','夜喵是你的睡前陪伴入口。选择话题或输入今晚的心情开始对话预览。\n\n呼吸：沿用轻柔呼吸练习。\n记录：查看上床时间月历，写下感恩日记。\n\n睡前仪式：放下手边的事，做一次短练习，记录今晚的温暖。'],
      privacy: ['隐私政策','当前版本的睡眠记录、感恩日记和夜喵偏好保存在本机。夜喵尚未接入聊天服务或云端记忆。清理微信缓存或卸载可能导致本地数据丢失。\n\n正式隐私政策尚待运营方提供。'],
      terms: ['用户协议','正式用户协议尚待运营方提供。当前睡前陪伴与呼吸练习用于日常放松。'],
      contact: ['联系我们','联系邮箱或客服渠道尚未配置。'],
      voice: ['夜喵声音','所选声音已作为偏好保存；语音播放服务尚未接入。自然环境声可在原有呼吸设置中使用。']
    };
    if (!content[key]) return;
    this.setData({ panel:'info',panelTitle:content[key][0],panelText:content[key][1] });
  },
  openData() { this.setData({ panel:'data',panelTitle:'数据管理', sleepCount:storage.read(storage.KEYS.sleep,[]).length, journalCount:storage.read(storage.KEYS.journal,[]).length }); },
  goRecords() { wx.navigateTo({ url:'/pages/record/index' }); },
  clearData(event) {
    const kind = event.currentTarget.dataset.key;
    const key = kind === 'sleep' ? storage.KEYS.sleep : kind === 'journal' ? storage.KEYS.journal : null;
    if (!key) return;
    wx.showModal({ title:kind === 'sleep' ? '删除全部睡眠记录？' : '删除全部感恩日记？',content:'仅删除对应的本地数据，删除后无法恢复。',confirmText:'删除',success:({ confirm }) => { if (!confirm) return; if (storage.write(key,[])) this.openData(); else wx.showToast({title:'删除失败，请重试',icon:'none'}); } });
  },
  noop() {}
});
