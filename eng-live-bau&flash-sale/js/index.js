/* ══════════════════════════════════════
   js/index.js
   明星直播間版位清單
   新增版位：在陣列加入 html 檔名即可
══════════════════════════════════════ */
var BN_LAYOUTS = [
  "01_skinny_pc.html",
  "02_skinny_app.html",
  "03_c2c_bn.html",
  "04_c2c_popup.html",
  "05_c2c_dd_card.html",
  "06_live_hall_bn.html",
  "07_live_popup.html",
  "08_coin_bn.html",
  "09_game_header.html",
  "10_game_bn.html",
  "11_lpbn_app.html",
  "12_lpbn_pc.html",
];

if (typeof window._bn_scan_cb === 'function') window._bn_scan_cb(BN_LAYOUTS);
