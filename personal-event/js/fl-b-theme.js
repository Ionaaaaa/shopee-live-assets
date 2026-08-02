/*
  fl-b-theme.js
  B級專場 FL Icon（03_fl.html）純文案／商品版型（T／P，不含LOGO版型L）專用的
  背景色＋文字色設定，跟公版款式（themes.js）共用的 flBgColor／cMain 脫鉤——
  之前B級FL Icon是直接借用公版款式（跟LPBN等其他版位共用）的顏色，現在改成
  這裡獨立一份，B級FL Icon的顏色要跟A級／LPBN不一樣，只改這個檔案就好，
  不會牽動到其他版位。

  LOGO版型（L）不受這裡影響——LOGO版型的「白底／吸色」邏輯（flLogoBgMode／
  flLogoSampledColor）維持原本共用的那一套，跟這裡是兩件事。

  ── 欄位 ──
    bgColor   : 純文案／商品版型的膠囊底色
    textColor : 文字顏色

  key 對應公版款式（跟 themes.js 的 key 同一組字母），換公版款式時會自動
  跟著切換這裡對應的顏色；沒有列出來的款式會退回 _default。
*/
window.FlBThemeColors = {

  _default: {
    bgColor:   '#b92c15',
    textColor: '#ffffff'
  },

  A: {
    bgColor:   '#1a9b9f',
    textColor: '#ffffff'
  },
  B: {
    bgColor:   '#ed8907',
    textColor: '#ffffff'
  },
  C: {
    bgColor:   '#e63f92',
    textColor: '#ffffff'
  },
  D: {
    bgColor:   '#794bb2',
    textColor: '#ffffff'
  },
  E: {
    bgColor:   '#ee4d2e',
    textColor: '#ffffff'
  },
  F: {
    bgColor:   '#0d87b5',
    textColor: '#ffffff'
  },
  G: {
    bgColor:   '#3ec0c2',
    textColor: '#ffffff'
  },
  H: {
    bgColor:   '#d71d46',
    textColor: '#ffffff'
  },
  I: {
    bgColor:   '#e03c3d',
    textColor: '#ffffff'
  },
  J: {
    bgColor:   '#9c1130',
    textColor: '#ffffff'
  },
  K: {
    bgColor:   '#a54b2a',
    textColor: '#ffffff'
  },
  L: {
    bgColor:   '#342d94',
    textColor: '#ffffff'
  },
  M: {
    bgColor:   '#dd9c00',
    textColor: '#ffffff'
  },
  O: {
    bgColor:   '#732786',
    textColor: '#ffffff'
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
