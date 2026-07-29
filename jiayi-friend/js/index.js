/* ══════════════════════════════════════
   js/index.js
   明星直播間版位清單
   新增版位：在陣列加入 html 檔名即可
══════════════════════════════════════ */
var BN_LAYOUTS = [
  "01_thumbnail.html",
  "02_lpbn.html",
  "04_ig.html",
  "05_opening.html",
  "06_msbn.html",
  "07_fl.html",
  "08_sky.html",
];

if (typeof window._bn_scan_cb === 'function') window._bn_scan_cb(BN_LAYOUTS);
