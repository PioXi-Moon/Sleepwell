// 夜喵专属 SVG 图标：24 视框、1.6 圆头描边、每枚带一点星屑细节，呼应星穹主题。
// 以 data-URI 内联，避免包内文件格式兼容问题，源码可读可改。

const MUTED = '#8a9b9b';
const GOLD = '#e8c887';
const RED = '#c98a8a';

function uri(color, body) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function star(color) {
  return `<path d="M18.7 3.1l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6Z" fill="${color}" stroke="none"/>`;
}

const THUMB = '<path d="M7.2 10.4v9.4H5a1.9 1.9 0 0 1-1.9-1.9v-5.6A1.9 1.9 0 0 1 5 10.4h2.2Z"/><path d="M7.2 10.4 10.7 4a2.3 2.3 0 0 1 2.2 2.9l-.8 3h6.2a2 2 0 0 1 2 2.5l-1.4 5.9a2 2 0 0 1-2 1.5H7.2"/>';

const like = uri(MUTED, THUMB + star(MUTED));
const likeActive = uri(GOLD, THUMB + star(GOLD));
const dislike = uri(MUTED, `<g transform="rotate(180 12 12)">${THUMB}</g>` + star(MUTED));
const dislikeActive = uri(RED, `<g transform="rotate(180 12 12)">${THUMB}</g>` + star(RED));

const copy = (color) => uri(color, '<rect x="8.6" y="8.6" width="10.8" height="10.8" rx="3"/><path d="M15.4 5.4H8a3 3 0 0 0-3 3v7.4"/>' + star(color));
const regenerate = (color) => uri(color, '<path d="M19.8 12a7.8 7.8 0 1 1-2.3-5.5"/><path d="M19.8 4.2v4.2h-4.2"/>' + star(color));
const stop = uri(GOLD, '<rect x="7.2" y="7.2" width="9.6" height="9.6" rx="3"/>' + star(GOLD));

module.exports = {
  like,
  likeActive,
  dislike,
  dislikeActive,
  copy: copy(MUTED),
  regenerate: regenerate(MUTED),
  stop
};
