/*
  fl-b-theme.js
  直播間FL(07_fl.html) 純文案／商品版型（T／P，不含LOGO版型L）專用的
  背景色＋文字色設定，跟公版款式（S.cSub/cMain等）脫鉤——這樣以後要單獨調整
  FL Icon的顏色，只改這個檔案就好，不會牽動到LPBN等其他版位。

  LOGO版型（L）不受這裡影響——LOGO版型的「白底／吸色」邏輯（flLogoBgMode／
  flLogoSampledColor）是另一套，見 editor-logo2-canvas.js。

  ── 欄位 ──
    bgColor   : 純文案／商品版型的膠囊底色
    textColor : 文字顏色

  key 對應公版款式A/B/C（跟theme-btn同一組字母）；沒有列出來的款式會退回 _default。
  目前先沿用舊版FL的深藍底/黃字配色當三個款式共用的預設值，
  之後如果想依款式分開配色，比照 _default 格式各自補一組即可。
*/
window.FlBThemeColors = {

  _default: {
    bgColor:   '#ffdecd',
    textColor: '#dd447d'
  },

};

function flBBgColorFor(t){
  var def = window.FlBThemeColors[t];
  return (def && def.bgColor) || window.FlBThemeColors._default.bgColor;
}
function flBTextColorFor(t){
  var def = window.FlBThemeColors[t];
  return (def && def.textColor) || window.FlBThemeColors._default.textColor;
}
