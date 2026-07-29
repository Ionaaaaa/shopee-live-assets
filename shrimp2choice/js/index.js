/* ══════════════════════════════════════
   js/index.js
   蝦殺二選一 版位清單
   新增版位：在陣列加入 html 檔名即可

   編號對齊工單：01縮圖 / 02+03 LPBN / 04開播字卡 / 05直播間FL
   06_案型字卡（文字結構已定案，視覺稿待補）尚未加入，等版面稿到位後再掛進來，
   且案型字卡一包可能有多張，加入方式會跟其他版位不一樣（不是單純加一行檔名）。
══════════════════════════════════════ */
var BN_LAYOUTS = [
  "01_thumbnail.html",
  "02_lpbn.html",
  "04_opening.html",
  "05_fl.html",
];

if (typeof window._bn_scan_cb === 'function') window._bn_scan_cb(BN_LAYOUTS);
