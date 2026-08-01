/**
 * ╔══════════════════════════════════════════════════════════════════
 * ║  themes.js  —  公版設定檔（MCN代播專案）
 * ║
 * ║  【如何新增公版】
 * ║  在 BN_THEMES 陣列加一筆，填寫以下欄位：
 * ║
 * ║    key      : 唯一識別碼，對應 backgrounds/ 資料夾名稱、也對應 Excel
 * ║               工單「檔名」表頭那一列的「版型」欄位（M12/N12）填的值
 * ║    label    : 下拉選單／背景選擇 popup 顯示名稱
 * ║    cSub     : 主標（小字）顏色
 * ║    cMain    : 副標（大字）顏色
 * ║    cDate    : 日期時間顏色
 * ║    sepColor : LOGO 分隔線顏色（02_lpbn 用）
 * ║    barColor : 購物專家名條背景色（02_lpbn 用）
 * ║    barOpacity   : 購物專家名條透明度，0（全透明）～1（不透明），選填，預設 1
 * ║    barTextColor : 購物專家名條文字顏色（「購物專家 | 姓名」那行字），選填，預設 #1f305d
 * ║    logo1    : 左上角第一顆 LOGO 圖檔路徑（相對於 editor.html），選填，
 * ║               預設 'logos/logo_shopee_live.png'
 * ║    cta      : CTA 按鈕圖檔路徑（相對於 editor.html），選填，
 * ║               預設 'logos/cta_btn.png'
 * ║    preview  : editor 縮圖預覽圖路徑（相對於 editor.html，選填）
 * ║
 * ║  【背景圖規則】
 * ║  每個 key 對應 backgrounds/{key}/ 資料夾，
 * ║  裡面放各版位的背景圖，命名對應版位：
 * ║    01_thumbnail.jpg
 * ║    02_lpbn.jpg
 * ║
 * ║  【同一分頁的所有版位】
 * ║  同一筆工單匯入後，同一分頁的所有製作物（thumbnail、lpbn）
 * ║  共用同一個 theme，所以色碼、背景自動一致。
 * ╚══════════════════════════════════════════════════════════════════
 */

var BN_THEMES = [

  {
    key:      'A',
    label:    'A',
    cSub:     '#1e6eb4',
    cMain:    '#6944d7',
    cDate:    '#1e6eb4',
    sepColor: '#ffffff',
    barColor: '#1e6eb4',
    barOpacity: 0.7,
    barTextColor: '#ffffff',
    logo1:    'logos/logo_shopee_live_white.png',
    cta:      'logos/cta_btn_white.png',
    preview:  'backgrounds/A/02_lpbn.jpg',
  },
  {
    key:      'B',
    label:    'B',
    cSub:     '#027b9f',
    cMain:    '#e4ffb4',
    cDate:    '#027b9f',
    sepColor: '#ffffff',
    barColor: '#006180',
    barOpacity: 0.7,
    barTextColor: '#ffffff',
    logo1:    'logos/logo_shopee_live_white.png',
    cta:      'logos/cta_btn_white.png',
    preview:  'backgrounds/B/02_lpbn.jpg',
  },
  {
    key:      'C',
    label:    'C',
    cSub:     '#0eabf4',
    cMain:    '#c37dff',
    cDate:    '#0eabf4',
    sepColor: '#ffffff',
    barColor: '#0eabf4',
    barOpacity: 0.7,
    barTextColor: '#ffffff',
    logo1:    'logos/logo_shopee_live_white.png',
    cta:      'logos/cta_btn_white.png',
    preview:  'backgrounds/C/02_lpbn.jpg',
  },
  {
    key:      'D',
    label:    'D',
    cSub:     '#7AB3E8',
    cMain:    '#f5d29f',
    cDate:    '#7AB3E8',
    sepColor: '#ffffff',
    barColor: '#000000',
    barOpacity: 0.7,
    barTextColor: '#bfb597',
    logo1:    'logos/logo_shopee_live_white.png',
    cta:      'logos/cta_btn_white.png',
    preview:  'backgrounds/D/02_lpbn.jpg',
  },
  {
    key:      'E',
    label:    'E',
    cSub:     '#84ae1e',
    cMain:    '#348146',
    cDate:    '#84ae1e',
    sepColor: '#EE4D2D',
    barColor: '#84ae1e',
    barOpacity: 0.7,
    barTextColor: '#ffffff',
    logo1:    'logos/logo_shopee_live.png',
    cta:      'logos/cta_btn.png',
    preview:  'backgrounds/E/02_lpbn.jpg',
  },
  {
    key:      'F',
    label:    'F',
    cSub:     '#37a18c',
    cMain:    '#fffaab',
    cDate:    '#37a18c',
    sepColor: '#ffffff',
    barColor: '#37a18c',
    barOpacity: 0.7,
    barTextColor: '#fafbb4',
    logo1:    'logos/logo_shopee_live_white.png',
    cta:      'logos/cta_btn_white.png',
    preview:  'backgrounds/F/02_lpbn.jpg',
  },
  {
    key:      'G',
    label:    'G',
    cSub:     '#3cc278',
    cMain:    '#fffda1',
    cDate:    '#3cc278',
    sepColor: '#ffffff',
    barColor: '#3cc278',
    barOpacity: 0.7,
    barTextColor: '#fafbb4',
    logo1:    'logos/logo_shopee_live_white.png',
    cta:      'logos/cta_btn_white.png',
    preview:  'backgrounds/G/02_lpbn.jpg',
  },
  {
    key:      'H',
    label:    'H',
    cSub:     '#00b699',
    cMain:    '#a0ffbf',
    cDate:    '#00b699',
    sepColor: '#ffffff',
    barColor: '#00b699',
    barOpacity: 0.7,
    barTextColor: '#afffc9',
    logo1:    'logos/logo_shopee_live_white.png',
    cta:      'logos/cta_btn_white.png',
    preview:  'backgrounds/H/02_lpbn.jpg',
  },
  {
    key:      'I',
    label:    'I',
    cSub:     '#ea7aa1',
    cMain:    '#b4426a',
    cDate:    '#ea7aa1',
    sepColor: '#EE4D2D',
    barColor: '#e76190',
    barOpacity: 0.7,
    barTextColor: '#ffffff',
    logo1:    'logos/logo_shopee_live.png',
    cta:      'logos/cta_btn_white.png',
    preview:  'backgrounds/I/02_lpbn.jpg',
  },
  {
    key:      'J',
    label:    'J',
    cSub:     '#c76fd4',
    cMain:    '#8b3084',
    cDate:    '#c76fd4',
    sepColor: '#ffffff',
    barColor: '#c76fd4',
    barOpacity: 0.7,
    barTextColor: '#ffffff',
    logo1:    'logos/logo_shopee_live_white.png',
    cta:      'logos/cta_btn_white.png',
    preview:  'backgrounds/J/02_lpbn.jpg',
  },
  {
    key:      'K',
    label:    'K',
    cSub:     '#ffaba0',
    cMain:    '#f7de78',
    cDate:    '#ffaba0',
    sepColor: '#ffffff',
    barColor: '#ffaba0',
    barOpacity: 0.7,
    barTextColor: '#b30b16',
    logo1:    'logos/logo_shopee_live_white.png',
    cta:      'logos/cta_btn_white.png',
    preview:  'backgrounds/K/02_lpbn.jpg',
  },
  {
    key:      'L',
    label:    'L',
    cSub:     '#e2a4a2',
    cMain:    '#ffd6bb',
    cDate:    '#e2a4a2',
    sepColor: '#ffffff',
    barColor: '#53201e',
    barOpacity: 0.7,
    barTextColor: '#e2a4a2',
    logo1:    'logos/logo_shopee_live_white.png',
    cta:      'logos/cta_btn_white.png',
    preview:  'backgrounds/L/02_lpbn.jpg',
  },
  {
    key:      'M',
    label:    'M',
    cSub:     '#ffffe5',
    cMain:    '#9c5a35',
    cDate:    '#ffffe5',
    sepColor: '#EE4D2D',
    barColor: '#9c5a35',
    barOpacity: 0.7,
    barTextColor: '#ffffd3',
    logo1:    'logos/logo_shopee_live.png',
    cta:      'logos/cta_btn_white.png',
    preview:  'backgrounds/M/02_lpbn.jpg',
  },
  {
    key:      'N',
    label:    'N',
    cSub:     '#9D7A60',
    cMain:    '#FFFAB2',
    cDate:    '#9D7A60',
    sepColor: '#ee4d2d',
    barColor: '#9D7A60',
    barOpacity: 0.8,
    barTextColor: '#f2dcb7',
    logo1:    'logos/logo_shopee_live.png',
    cta:      'logos/cta_btn.png',
    preview:  'backgrounds/N/02_lpbn.jpg',
  },
  {
    key:      'O',
    label:    'O',
    cSub:     '#c69672',
    cMain:    '#f2d19e',
    cDate:    '#c69672',
    sepColor: '#ffffff',
    barColor: '#2f1912',
    barOpacity: 0.7,
    barTextColor: '#c7ab92',
    logo1:    'logos/logo_shopee_live_white.png',
    cta:      'logos/cta_btn_white.png',
    preview:  'backgrounds/O/02_lpbn.jpg',
  },
  {
    key:      'P',
    label:    'P',
    cSub:     '#cead89',
    cMain:    '#eaf5a5',
    cDate:    '#cead89',
    sepColor: '#ffffff',
    barColor: '#0d0e12',
    barOpacity: 0.7,
    barTextColor: '#ccb99d',
    logo1:    'logos/logo_shopee_live_white.png',
    cta:      'logos/cta_btn_white.png',
    preview:  'backgrounds/P/02_lpbn.jpg',
  },

  /* ════════════════════════════════════════════
     ↓↓↓  在這裡新增你的公版  ↓↓↓
     複製上方任一筆，修改 key/label 和色碼即可。
     key 記得跟 backgrounds/ 底下的資料夾名稱、
     Excel 工單「版型」欄位（M12/N12）填的值保持一致。

  {
    key:      '新公版key',
    label:    '下拉顯示名稱',
    cSub:     '#000000',
    cMain:    '#000000',
    cDate:    '#000000',
    sepColor: '#ffffff',
    barColor: '#ffffff',
    barOpacity: 1,
    barTextColor: '#1f305d',
    logo1:    'logos/logo_shopee_live.png',
    cta:      'logos/cta_btn.png',
    preview:  'backgrounds/新公版key/02_lpbn.jpg',
  },
     ════════════════════════════════════════════ */

];

/* ── 建立快速查詢 Map（key → theme 物件）── */
var BN_THEME_MAP = {};
BN_THEMES.forEach(function(t){ BN_THEME_MAP[t.key] = t; });
