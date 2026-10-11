const focusMode = require('../../services/focus-mode');
const navigation = require('../../utils/navigation');
const { getNavigationMetrics } = require('../../utils/layout');

Page({
  data: { steps: focusMode.getGuideSteps(), started: false, message: '', nav: getNavigationMetrics() },
  onShow() { this.setData({ nav: getNavigationMetrics() }); },
  goBack() { navigation.backOrHome(); },
  startFocus() {
    focusMode.start().then((result) => this.setData({ started: true, message: result.message }));
  },
  returnToBreathe() { wx.reLaunch({ url: '/pages/breathe/index' }); }
});
