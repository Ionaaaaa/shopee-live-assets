/* ══════════════════════════════════════
   js/index.js
   MCN代播版位清單
   新增版位：在陣列加入 html 檔名即可
══════════════════════════════════════ */
var BN_LAYOUTS = [
  "02_lpbn.html",
  "03_fl.html",
  "04_fl_a1.html",
];

if (typeof window._bn_scan_cb === 'function') window._bn_scan_cb(BN_LAYOUTS);
