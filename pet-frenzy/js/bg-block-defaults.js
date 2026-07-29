/*
  bg-block-defaults.js
  「底色吸取」斜切色塊＋刷不透明度 的形狀參數（顏色不在這裡，顏色是 bg-block-render.js
  依 S.seedHex 用 color-theme-engine.js 同一套規則自動算的：深色＝背景色本身，
  淺色＝背景色混 15% 白色）。

  ── 座標量測來源 ──
  由「直播大廳_CTA.jpg」「直播時縮圖_不限kb.jpg」「開播字卡_直式_1080x1920.JPG」三張
  乾淨版參考圖用像素分析量出來，數字都是佔畫布寬/高的百分比，換了畫布尺寸也不用重量。

  ── 每個版位的參數 ──
    line: 斜線的兩個端點（百分比座標），連起來就是切分深/淺色的那條線
    darkSide: 'left' | 'right' | 'top' | 'bottom' —— 深色（背景原色）在斜線的哪一側
              （沒列出來的那一側＝淺色，背景色混15%白）
    wash: 額外疊加的漸層不透明度刷色（用深色本身當疊加色，疊在淺色區上）
      from / to：刷色的起訖位置（百分比），from＝0%不透明，to＝maxOpacity
      axis: 'x' | 'y' —— 沿哪個方向刷（x＝橫向、y＝直向）
      maxOpacity：刷到最深處的不透明度（0~1）

  09_tab／07_fl 不在這份清單裡——這兩個版位是「底色吸取但不做斜切／不放圓柱」，
  直接用 S.seedHex 純色填底就好，見 bg-block-render.js 的 fallback 邏輯。
*/
window.BgBlockDefaults = {

  '02_lpbn': {
    /* 左深右淺，斜線從上緣66%斜到下緣55% */
    line: { x1: 66, y1: 0, x2: 55, y2: 100 },
    darkSide: 'left',
    /* 下往上刷：下緣約70~75%不透明，往上到30%高度左右淡出 */
    wash: { axis: 'y', from: 30, to: 100, maxOpacity: 0.72 }
  },

  '01_thumbnail': {
    /* 左淺右深，斜線從左緣37%斜到右緣78% */
    line: { x1: 0, y1: 37, x2: 100, y2: 78 },
    darkSide: 'right',
    /* 右往左刷一點：從62%寬度開始，刷到最右緣約90%不透明 */
    wash: { axis: 'x', from: 62, to: 100, maxOpacity: 0.90 }
  },

  '05_opening': {
    /* 左淺右深，斜線從左緣50%斜到右緣80% */
    line: { x1: 0, y1: 50, x2: 100, y2: 80 },
    darkSide: 'right',
    /* 參考圖裡量不到這個效果，先比照縮圖版參數套用，之後看截圖再調
       （2026-07-28：Iona 確認先這樣套用，之後再視覺微調） */
    wash: { axis: 'x', from: 62, to: 100, maxOpacity: 0.90 }
  }

};
