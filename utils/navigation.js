function backOrHome() {
  const pages = getCurrentPages();
  if (pages.length > 1) {
    wx.navigateBack({ delta: 1 });
    return;
  }
  // 已在首页时不再 reLaunch 到自身：启动/转场期重复 reLaunch 会触发
  // 「appLaunch with non-empty page stack」路由错误（开发者工具尤甚）。
  const current = pages[0] && pages[0].route;
  if (current === 'pages/agent/index') return;
  wx.reLaunch({ url: '/pages/agent/index' });
}

function exitMiniProgram() {
  if (typeof wx.exitMiniProgram === 'function') {
    wx.exitMiniProgram();
    return;
  }
  wx.showToast({ title: '请点击右上角关闭小程序', icon: 'none' });
}

module.exports = {
  backOrHome,
  exitMiniProgram
};
