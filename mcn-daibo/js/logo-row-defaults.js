/*
  logo-row-defaults.js
  只放「logo1/logo2 高度、分隔線長度/粗細/前後間距」的比例係數與數字，不含邏輯。
  之後要調整這些，直接改這裡的數字就好，不用跑進 5 個版位檔案裡各改一次。

  ── 欄位 ──
    logo1HeightRatio        : logo1 的高度 = LOGO.h × 這個值（1 = 滿版高度，不縮小）
    logo2HeightRatioSquare  : logo2 是「方形」素材時的高度比例（Logo2 編輯面板判斷出來的形狀）
    logo2HeightRatioWide    : logo2 是「長型」素材時的高度比例——目前故意縮小，
                              看起來不要滿版
    dividerHeightRatio      : 分隔線的長度 = LOGO.h × 這個值（0.5 = 只有一半高度、垂直置中）
    dividerLineWidthPx      : 分隔線的粗細，直接填 px（螢幕縮放時 1px 容易看不清楚，
                              這裡拉高即可，不受畫布尺寸影響）
    gapBeforeDividerPx      : logo1 到分隔線的間距，直接填 px
    gapAfterDividerPx       : 分隔線到 logo2 的間距，直接填 px（注意：各版位檔案裡原本
                              另外還有一個 GAP 變數，是給文字排版用的，跟這裡無關，不要搞混）

  ── 用法 ──
    _default：所有版位預設共用這組，沒有另外覆蓋的版位都吃這裡的值，
              改這裡＝一個地方改、全部版位一起變。
    個別版位：想讓某個版位不一樣，比照下面被註解掉的例子，加一組同名 id 的設定，
              會蓋掉 _default，其他版位不受影響。

  版位 id 怎麼來：自動抓網址檔名（例如 01_thumbnail.html → '01_thumbnail'），
  不用在每個版位檔案裡手動宣告。

  形狀（方形／長型）資訊怎麼來：使用者在 Logo2 編輯面板調整素材時，面板會自動判斷
  形狀存進 S.logo2Shape，editor 廣播時會把這個值一起送給版位（見 editor-canvas-ui.js
  的 logo2Shape 欄位），版位收到後存進 D.logo2Shape，drawLogos() 依這個值挑對應比例。
*/
window.LogoRowDefaults = {

  _default: {
    logo1HeightRatio: 0.6,
    logo2HeightRatioSquare: 1,
    logo2HeightRatioWide: 0.8,
    dividerHeightRatio: 0.5,
    dividerLineWidthPx: 2,
    gapBeforeDividerPx: 15,
    gapAfterDividerPx: 19
  },

  /* ↓ 想讓某個版位不一樣，比照這樣加一組覆蓋 _default，例如：
  '02_lpbn': { logo1HeightRatio: 1, logo2HeightRatioSquare: 1, logo2HeightRatioWide: 0.8,
               dividerHeightRatio: 0.5, dividerLineWidthPx: 2,
               gapBeforeDividerPx: 15, gapAfterDividerPx: 19 },
  */

  /* MSBN：logo1／分隔線沿用原本已經調好的樣子（logo1 縮小、分隔線細且短、前後間距15px），
     這次只補上 logo2 的方形／橫型比例支援（原本 logo2 是寫死滿版高度，沒有形狀判斷）。 */
  '07_msbn': {
    logo1HeightRatio: 0.81,
    logo2HeightRatioSquare: 1,
    logo2HeightRatioWide: 0.8,
    dividerHeightRatio: 0.778,
    dividerLineWidthPx: 1,
    gapBeforeDividerPx: 15,
    gapAfterDividerPx: 15
  },

};
