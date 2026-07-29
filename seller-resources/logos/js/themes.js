/**
 * ╔══════════════════════════════════════════════════════════════════
 * ║  themes.js  —  公版設定檔（賣家資源專案）
 * ║
 * ║  【如何新增公版】
 * ║  在 BN_THEMES 陣列加一筆，填寫以下欄位：
 * ║
 * ║    key      : 唯一識別碼，對應 backgrounds/ 資料夾名稱、也對應 Excel
 * ║               工單「檔名」表頭那一列的「版型」欄位（M12/N12）填的值
 * ║    label    : 下拉選單顯示名稱
 * ║    seedHex  : 種子色（唯一需要手動決定的顏色）。
 * ║               主標／副標／日期文字色、購物專家名條顏色、LOGO分隔線顏色、
 * ║               LOGO／CTA 該用橘色版還是白色版，全部由 js/color-theme-engine.js
 * ║               依這顆種子色自動推算，不用再逐一手填。
 * ║               → 側欄「公版款式」旁邊的色票可以直接調整目前這個款式的種子色，
 * ║                 調整後全套顏色即時重算；Excel 工單「指定色號」欄位填了色碼，
 * ║                 也會用同一套邏輯覆蓋這裡的預設值。
 * ║    barOpacity   : 購物專家名條透明度，0（全透明）～1（不透明），選填，預設 0.7
 * ║               （透明度是純美術判斷，非顏色深淺可推算，所以保留手動欄位）
 * ║    preview  : editor 縮圖預覽圖路徑（相對於 editor.html，選填）
 * ║
 * ║  【背景圖規則】
 * ║  每個 key 對應 backgrounds/{key}/ 資料夾，放 LPBN 版位的背景圖：
 * ║    02_lpbn.jpg
 * ║
 * ║  【下面列出的 seedHex 是遷移時的預設值，對應原本手動調好的效果，
 * ║   如果套色後跟你原本印象對不上，直接用側欄色票微調種子色即可，
 * ║   不用改這個檔案。】
 * ╚══════════════════════════════════════════════════════════════════
 */

var BN_THEMES = [

  { key: 'A', label: 'A', seedHex: '#1E6EB4', barOpacity: 0.7, preview: 'backgrounds/A/02_lpbn.jpg' },
  { key: 'B', label: 'B', seedHex: '#006180', barOpacity: 0.7, preview: 'backgrounds/B/02_lpbn.jpg' },
  { key: 'C', label: 'C', seedHex: '#0EABF4', barOpacity: 0.7, preview: 'backgrounds/C/02_lpbn.jpg' },
  { key: 'D', label: 'D', seedHex: '#000000', barOpacity: 0.7, preview: 'backgrounds/D/02_lpbn.jpg' },
  { key: 'N', label: 'N', seedHex: '#E8D2A0', barOpacity: 0.8, preview: 'backgrounds/N/02_lpbn.jpg' },

  /* ════════════════════════════════════════════
     ↓↓↓  在這裡新增你的公版  ↓↓↓
     複製上方任一筆，改 key/label/seedHex 即可，
     seedHex 大概抓背景圖給人的主要色感（深/淺、偏什麼色相）就好，
     實際效果不滿意的話開啟畫布後用色票再微調一次。

  { key: '新公版key', label: '下拉顯示名稱', seedHex: '#000000', barOpacity: 0.7,
    preview: 'backgrounds/新公版key/02_lpbn.jpg' },
     ════════════════════════════════════════════ */

];

/* ── 建立快速查詢 Map（key → theme 物件）── */
var BN_THEME_MAP = {};
BN_THEMES.forEach(function(t){ BN_THEME_MAP[t.key] = t; });
