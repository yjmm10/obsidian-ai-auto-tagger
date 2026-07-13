/**
 * 插件品牌标识（AI Auto Tagger）。
 * 渐变圆角方形 + 标签图形 + 闪光，象征「AI 自动打标签」。
 * 以 data URI 内嵌，便于在设置面板与关于页面渲染，无需额外图片文件。
 */
const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
  <defs>
    <linearGradient id="a" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8b5cf6"/>
      <stop offset="0.55" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#06b6d4"/>
    </linearGradient>
  </defs>
  <rect x="6" y="6" width="84" height="84" rx="24" fill="url(#a)"/>
  <path d="M27 30 h31 a5 5 0 0 1 5 5 v20 l-19 19 a5 5 0 0 1 -7 0 L27 62 a5 5 0 0 1 0 -7 Z" fill="#ffffff"/>
  <circle cx="36" cy="40" r="4.6" fill="#6366f1"/>
  <path d="M70 20 l2.6 8.4 l8.4 2.6 l-8.4 2.6 l-2.6 8.4 l-2.6 -8.4 l-8.4 -2.6 l8.4 -2.6 Z" fill="#ffffff"/>
</svg>`;

export const PLUGIN_LOGO_DATA_URI = `data:image/svg+xml,${encodeURIComponent(SVG)}`;
