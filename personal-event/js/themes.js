/**
 * ╔══════════════════════════════════════════════════════════════════
 * ║  themes.js  —  公版設定檔（個人專場專案）
 * ║
 * ║  跟賣家資源那套「種子色自動配色」不一樣，這裡完全比照 MCN代播 的做法：
 * ║  每個公版款式（key）直接指定固定色票＋背景圖，不用色彩引擎現算，
 * ║  背景改成真正的版型美術圖（放在 backgrounds/{key}/ 底下），不是純色塊。
 * ║
 * ║  【如何新增公版】
 * ║  在 BN_THEMES 陣列加一筆：
 * ║
 * ║    key      : 唯一識別碼，對應 backgrounds/ 資料夾名稱，也對應 Excel
 * ║               公版工單裡A級專場「A級專場」欄(H欄)／B級專場「B級專場」欄(U欄)
 * ║               填的字母
 * ║    label    : 下拉選單顯示名稱
 * ║    cSub     : 主標（小字）顏色
 * ║    cMain    : 副標（大字）顏色
 * ║    cDate    : 日期時間顏色
 * ║    sepColor : LOGO 分隔線顏色
 * ║    logo1    : 左上角LOGO圖檔路徑（相對於 editor.html），選填，
 * ║               預設 'logos/logo_shopee_live.png'
 * ║    cta      : CTA 按鈕圖檔路徑（相對於 editor.html），選填，
 * ║               預設 'logos/cta_btn.png'
 * ║    preview  : editor 縮圖預覽圖路徑（相對於 editor.html，選填）
 * ║
 * ║  【背景圖規則】
 * ║  每個 key 對應 backgrounds/{key}/ 資料夾，裡面放各版位的背景圖，
 * ║  命名對應版位檔名，例如 02_lpbn.jpg。真正的美術圖之後由 Iona 陸續放進去，
 * ║  放進去之前找不到圖檔會自動退回 BG_FALLBACK 純色（見各 layout 檔），
 * ║  不會整張空白或報錯，可以先用文字/組合排版確認沒問題，之後美術圖一到位、
 * ║  資料夾放對位置就會自動生效，不用再改任何程式。
 * ║
 * ║  下面 A/B/C 三組是先用工單裡實際出現過的字母佔位，顏色是暫定的識別色，
 * ║  不是最終美術色票——等 Iona 提供真正的公版設計後，直接覆蓋這幾組的
 * ║  cSub/cMain/cDate/sepColor/logo1/cta 就好，key 不用改，Excel 也不用重填。
 * ╚══════════════════════════════════════════════════════════════════
 */

var BN_THEMES = [
  {
    key:      'A',
    label:    'A',
    cSub:     '#165AA5',
    cMain:    '#ffffff',
    cDate:    '#165AA5',
    sepColor: '#ffffff',
    shadowRgba: 'rgba(38, 93, 135, 0.53)',
    flBgColor: '#7bc5d5',
    logo1:    'logos/logo_shopee_live_white.png',
    cta:      'logos/cta_btn_white.png',
    preview:  'backgrounds/A/02_lpbn.jpg',
  },
  {
    key:      'B',
    label:    'B',
    cSub:     '#335705',
    cMain:    '#ffffff',
    cDate:    '#335705',
    sepColor: '#ffffff',
    shadowRgba: 'rgba(39, 111, 54, 0.55)',
    flBgColor: '#abc48c',
    logo1:    'logos/logo_shopee_live_white.png',
    cta:      'logos/cta_btn_white.png',
    preview:  'backgrounds/B/02_lpbn.jpg',
  },
  {
    key:      'C',
    label:    'C',
    cSub:     '#2B638F',
    cMain:    '#fFFFFF',
    cDate:    '#2B638F',
    sepColor: '#ffffff',
    shadowRgba: 'rgba(36, 97, 125, 0.56)',
    flBgColor: '#aac3d6',
    logo1:    'logos/logo_shopee_live.png',
    cta:      'logos/cta_btn_white.png',
    preview:  'backgrounds/C/02_lpbn.jpg',
  },
  /* 之後要加 D、N…等公版，比照上面格式複製一組，key改成對應字母即可，
     Excel那邊H欄/U欄填同一個字母就會自動吃到這組設定，不用再改程式碼。 */
];

var BN_THEME_MAP = {};
BN_THEMES.forEach(function(t){ BN_THEME_MAP[t.key] = t; });
