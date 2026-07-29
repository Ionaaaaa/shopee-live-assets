/*
  ground-shadow-defaults.js
  地平線陰影的「形狀」參數（顏色不在這裡，顏色是 color-theme-engine.js 依背景色自動算的）。

  來源：阿謙的公版工單系統裡，跟我們 02_lpbn 完全同尺寸（1125×360）的
  LPBN 版位本來就調好的一組參數，直接沿用過來當預設值。

  ── 每個數字的意思（都是佔畫布寬/高的百分比）──
    topY        地平線高度：陰影區塊的上緣，也是整個效果的「地平線」在哪裡
    leftX       陰影左上角 X
    slantX      陰影左下角 X（跟 leftX 不同才會是斜的，往右斜就要比 leftX 大）
    gradFrom    水平漸層起點 X（從這裡開始從透明漸變到有顏色，越靠右陰影越濃）
    bottomY     陰影區塊下緣（可以超過100，代表延伸到畫布外，底部看不到裁切線）
    blur        整體模糊強度（px），0 = 完全銳利
    bottomFade  下緣往下淡出的範圍（%），0 = 不淡出，直接硬邊
    leftFade    左邊斜邊往內羽化的範圍（px），0 = 不羽化，斜邊是硬邊

  想幫別的版位加地平線效果：複製一組、改對應的版位id即可；
  沒列出來的版位不會有這個效果（沒有 _default 是刻意的——這是視覺效果，
  不像顏色/縮放那樣每個版位都該有，沒特別調過形狀寧可不顯示，也不要套錯比例）。
*/
window.GroundShadowDefaults = {

  '02_lpbn': {
    topY: 45,
    leftX: 60,
    slantX: 80,
    gradFrom: 65,
    bottomY: 100,
    blur: 3,
    bottomFade: 80,
    leftFade: 40
  }

};
