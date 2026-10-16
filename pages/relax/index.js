const content = require('../../data/nightcat-content');
const { getNavigationMetrics } = require('../../utils/layout');

Page({
  data: {
    nav: getNavigationMetrics(),
    assets: content.assets,
    entries: content.relaxEntries
  },

  onShow() {
    this.setData({ nav: getNavigationMetrics() });
  },

  openEntry(event) {
    const id = event.currentTarget.dataset.id;
    const entry = this.data.entries.find((item) => item.id === id);
    if (!entry) return;
    if (entry.mode === 'reLaunch') {
      wx.reLaunch({ url: entry.url });
      return;
    }
    wx.navigateTo({ url: entry.url });
  }
});
