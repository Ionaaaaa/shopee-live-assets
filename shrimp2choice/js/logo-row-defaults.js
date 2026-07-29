/*
  logo-row-defaults.js
  只放「logo1/logo2 高度、分隔線長度/粗細/前後間距」的比例係數與數字，不含邏輯。
  之後要調整這些，直接改這裡的數字就好，不用跑進 5 個版位檔案裡各改一次。

  ── 欄位 ──
    logo1HeightRatio        : logo1 的高度 = LOGO.h × 這個值（1 = 滿版高度，不縮小）
    logo2HeightRatioSquare  : logo2 是「方形」素材時的高度比例（Logo2 編輯面板判斷出來的形狀）
    logo2HeightRatioWide    : logo2 是「長型」素材時的高度比例——目前故意縮小，
                              看起來不要滿版
    logo2HeightRatioDouble  : logo2 是「雙logo（共播）」時的高度比例——這種情況下
                              logo2 合成圖本身更寬（兩個logo並排），高度通常要比
                              單一長型logo再縮小一點，才不會整排看起來太巨大。
                              沒設定的話會自動退回 logo2HeightRatioWide。
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
    logo1HeightRatio: 0.7, // 2026-07-22：logo1整體縮小到約70%大小（原本1＝滿版高度）
    logo2HeightRatioSquare: 1,
    logo2HeightRatioWide: 0.8,
    logo2HeightRatioDouble: 0.65, // 2026-07-22新增：雙logo（共播）比例，先給0.65，可依實際畫面再調整
    dividerHeightRatio: 0.5,
    dividerLineWidthPx: 2,
    gapBeforeDividerPx: 14, // 2026-07-22：15→14（兩側各減1px）。目前只有01/04還在用分隔線
    gapAfterDividerPx: 18   // 2026-07-22：19→18（兩側各減1px）
  },

  /* 2026-07-22：三個版位在共用0.7的基礎上還要各自再縮一次，所以分開覆蓋：
     - 02_lpbn 沒有logo2，只放logo1，再縮小5%（0.7×0.95）
     - 01_thumbnail／04_opening 有logo2（logo1+logo2同一排），再縮小10%（0.7×0.9）
     只填logo1HeightRatio，其他欄位（分隔線／logo2比例等）沒列出的話會自動退回_default，
     不用整組欄位都複製一份。

     2026-07-22（第二次調整）：
     - 01_thumbnail 的logo1再縮小2%（0.63×0.98）；04_opening這次不動，維持0.63
     - 01/04 中間的分隔線都加長2px——dividerHeightRatio是「比例」不是px，兩個版位
       LOGO區高度不一樣（01是49.5、04是111），同樣加2px換算出來的比例也不一樣，
       所以分開列出實際算出來的比例（垂直置中是動態算的，加長後還是自動置中，不用額外處理）：
         01：原本24.75px(49.5×0.5) +2px = 26.75px → 26.75/49.5 ≈ 0.5404
         04：原本55.5px(111×0.5)  +2px = 57.5px → 57.5/111  ≈ 0.5180 */
  '02_lpbn': {
    logo1HeightRatio: 0.665 // 0.7 × 0.95
  },
  '01_thumbnail': {
    logo1HeightRatio: 0.6174, // 0.63 × 0.98
    dividerHeightRatio: 0.5404, // 24.75px+2px＝26.75px
    gapBeforeDividerPx: 12, // 2026-07-22：14→12，只改01，04不動
    gapAfterDividerPx: 15   // 2026-07-22：18→15，只改01，04不動
  },
  '04_opening': {
    logo1HeightRatio: 0.55062, // 2026-07-22（第四次調整）：0.5985 × 0.92，logo再縮小8%
    dividerHeightRatio: 0.5180, // 55.5px+2px＝57.5px
    gapBeforeDividerPx: 16, // 2026-07-22：只改04，01不動
    gapAfterDividerPx: 17   // 2026-07-22：只改04，01不動
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
