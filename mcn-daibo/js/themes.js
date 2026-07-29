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
