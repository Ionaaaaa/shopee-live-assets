/**
 * ╔══════════════════════════════════════════════════════════════════
 * ║  themes.js  —  公版設定檔
 * ║
 * ║  【如何新增公版】
 * ║  在 BN_THEMES 陣列加一筆，填寫以下欄位：
 * ║
 * ║    key      : 唯一識別碼，對應 backgrounds/ 資料夾名稱
 * ║    label    : 下拉選單顯示名稱
 * ║    cSub     : 主標（小字）顏色
 * ║    cMain    : 副標（大字）顏色
 * ║    cDate    : 日期時間顏色
 * ║    sepColor : LOGO 分隔線顏色（lpbn 用）
 * ║    barColor : 主持人 bar 背景色（lpbn 用）
 * ║    preview  : editor 縮圖預覽圖路徑（選填）
 * ║
 * ║  【背景圖規則】
 * ║  每個 key 對應 backgrounds/{key}/ 資料夾，
 * ║  裡面放各版位的背景圖，命名對應版位：
 * ║    01_thumbnail.jpg
 * ║    02_lpbn.jpg
 * ║    ...
 * ║
 * ║  【同一分頁的所有版位】
 * ║  同一筆工單匯入後，同一分頁的所有製作物（thumbnail、lpbn 等）
 * ║  共用同一個 theme，所以色碼自動一致。
 * ╚══════════════════════════════════════════════════════════════════
 */

var BN_THEMES = [

  /* ── 現有公版 ── */
  {
    key:      'fashion',
    label:    'Fashion',
    cSub:     '#0a402e',   /* 主標小字 — 深玫紅 */
    cMain:    '#0a402e',   /* 副標大字 — 玫紅 */
    cDate:    '#ffffff',   /* 日期時間 */
    sepColor: '#ffffff',   /* LOGO 分隔線 */
    barColor: '#11684b',   /* 主持人 bar */
    preview:  'backgrounds/fashion/02_lpbn.jpg',
  },
  {
    key:      'F&B',
    label:    'F&B',
    cSub:     '#5e1b1a',
    cMain:    '#5e1b1a',
    cDate:    '#ffffff',
    sepColor: '#ffffff',
    barColor: '#5e1b1a',
    preview:  'backgrounds/F&B/02_lpbn.jpg',
  },
  {
    key:      'H&B',
    label:    'H&B',
    cSub:     '#2a46a1',
    cMain:    '#477dd9',
    cDate:    '#2a46a1',
    sepColor: '#477dd9',
    barColor: '#1a2e6b',
    preview:  'backgrounds/H&B/02_lpbn.jpg',
  },
  {
    key:      'EL_家電',
    label:    'EL_家電',
    cSub:     '#1a3a5c',
    cMain:    '#2563a8',
    cDate:    '#1a3a5c',
    sepColor: '#2563a8',
    barColor: '#0f2540',
    preview:  'backgrounds/EL(家電)/02_lpbn.jpg',
  },
  {
    key:      'EL_手機3C',
    label:    'EL_手機3C',
    cSub:     '#004774',
    cMain:    '#004774',
    cDate:    '#ffffff',
    sepColor: '#ffffff',
    barColor: '#004774',
    preview:  'backgrounds/EL_手機3C/02_lpbn.jpg',
  },
  {
    key:      'Lifestyle',
    label:    'Lifestyle',
    cSub:     '#1a4a2e',
    cMain:    '#2d8a4e',
    cDate:    '#1a4a2e',
    sepColor: '#2d8a4e',
    barColor: '#0f2e1c',
    preview:  'backgrounds/Lifestyle/02_lpbn.jpg',
  },



  /* ════════════════════════════════════════════
     ↓↓↓  在這裡新增你的公版  ↓↓↓
     複製上方任一筆，修改 key/label 和色碼即可

  {
    key:      '新公版key',
    label:    '下拉顯示名稱',
    cSub:     '#000000',
    cMain:    '#000000',
    cDate:    '#000000',
    sepColor: '#EE4D2D',
    barColor: '#000000',
    preview:  'backgrounds/新公版key/02_lpbn.jpg',
  },
     ════════════════════════════════════════════ */

];

/* ── 建立快速查詢 Map（key → theme 物件）── */
var BN_THEME_MAP = {};
BN_THEMES.forEach(function(t){ BN_THEME_MAP[t.key] = t; });
