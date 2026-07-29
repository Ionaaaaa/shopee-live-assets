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
    label:    'fashion',
    cSub:     '#1d7457',   /* 主標小字 — 深玫紅 */
    cMain:    '#0a402e',   /* 副標大字 — 玫紅 */
    cDate:    '#ffffff',   /* 日期時間 */
    sepColor: '#ffffff',   /* LOGO 分隔線 */
    barColor: '#157f5c',   /* 主持人 bar */
    preview:  'backgrounds/fashion/02_lpbn.jpg',
  },
  {
    key:      'F&B',
    label:    'F&B',
    cSub:     '#983130',
    cMain:    '#5e1b1a',
    cDate:    '#ffffff',
    sepColor: '#ffffff',
    barColor: '#862f2e',
    preview:  'backgrounds/F&B/02_lpbn.jpg',
  },
  {
    key:      'H&B',
    label:    'H&B',
    cSub:     '#a1221e',
    cMain:    '#61201e',
    cDate:    '#ffffff',
    sepColor: '#ffffff',
    barColor: '#993330',
    preview:  'backgrounds/H&B/02_lpbn.jpg',
  },
  {
    key:      'EL_家電',
    label:    'EL_家電',
    cSub:     '#005b5e',
    cMain:    '#004547',
    cDate:    '#ffffff',
    sepColor: '#ffffff',
    barColor: '#026265',
    preview:  'backgrounds/EL_家電/02_lpbn.jpg',
  },
  {
    key:      'EL_手機3C',
    label:    'EL_手機3C',
    cSub:     '#0063a2',
    cMain:    '#004774',
    cDate:    '#ffffff',
    sepColor: '#ffffff',
    barColor: '#0070b7',
    preview:  'backgrounds/EL_手機3C/02_lpbn.jpg',
  },
  {
    key:      'Lifestyle',
    label:    'Lifestyle',
    cSub:     '#82001c',
    cMain:    '#950000',
    cDate:    '#ffffff',
    sepColor: '#ffffff',
    barColor: '#a81a1a',
    preview:  'backgrounds/Lifestyle/02_lpbn.jpg',
  },
  {
    key:      'Lifestyle_Entertainment',
    label:    'Lifestyle_Entertainment',
    cSub:     '#007c4e',
    cMain:    '#00462c',
    cDate:    '#ffffff',
    sepColor: '#ffffff',
    barColor: '#007c4e',
    preview:  'backgrounds/Lifestyle_Entertainment/02_lpbn.jpg',
  },
  {
    key:      'PET',
    label:    'PET',
    cSub:     '#a12302',
    cMain:    '#741e07',
    cDate:    '#ffffff',
    sepColor: '#ffffff',
    barColor: '#a12302',
    preview:  'backgrounds/PET/02_lpbn.jpg',
  },
  {
    key:      'Lifestyle_遊戲',
    label:    'Lifestyle_遊戲',
    cSub:     '#8c73e7',
    cMain:    '#c0afff',
    cDate:    '#ffffff',
    sepColor: '#ffffff',
    barColor: '#6e57c5',
    preview:  'backgrounds/Lifestyle_遊戲/02_lpbn.jpg',
  },  
  {
    key:      'H&L',
    label:    'H&L',
    cSub:     '#1e6c08',
    cMain:    '#113f04',
    cDate:    '#ffffff',
    sepColor: '#ffffff',
    barColor: '#287612',
    preview:  'backgrounds/H&L/02_lpbn.jpg',
  }, 
  {
    key:      'fashion_WA',
    label:    'fashion_WA',
    cSub:     '#b84726',
    cMain:    '#982808',
    cDate:    '#ffffff',
    sepColor: '#ffffff',
    barColor: '#b34121',
    preview:  'backgrounds/fashion_WA/02_lpbn.jpg',
  }, 
  {
    key:      'fashion_包款',
    label:    'fashion_包款',
    cSub:     '#911289',
    cMain:    '#7e1577',
    cDate:    '#ffffff',
    sepColor: '#ffffff',
    barColor: '#9c2a95',
    preview:  'backgrounds/fashion_包款/02_lpbn.jpg',
  },
  {
    key:      'fashion_sport',
    label:    'fashion_sport',
    cSub:     '#835a00',
    cMain:    '#402c00',
    cDate:    '#ffffff',
    sepColor: '#ffffff',
    barColor: '#704f08',
    preview:  'backgrounds/fashion_sport/02_lpbn.jpg',
  },
  {
    key:      'fashion_shoes',
    label:    'fashion_shoes',
    cSub:     '#6f4e04',
    cMain:    '#402c00',
    cDate:    '#ffffff',
    sepColor: '#ffffff',
    barColor: '#6f4e04',
    preview:  'backgrounds/fashion_shoes/02_lpbn.jpg',
  },
  {
    key:      'TKB(母嬰)',
    label:    'TKB(母嬰)',
    cSub:     '#9a1b18',
    cMain:    '#61201e',
    cDate:    '#ffffff',
    sepColor: '#ffffff',
    barColor: '#8d2c29',
    preview:  'backgrounds/TKB(母嬰)/02_lpbn.jpg',
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
