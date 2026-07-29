/*
  shadow-layout-defaults.js
  只放「素材第一次被加進來時」的預設位置／大小數字，不含邏輯。
  之後想調整預設位置，直接改這裡的數字就好，不用去 shadow-layout-receiver.js 裡找。

  ── 主持人（host1 / host2）：頭寬固定＋頭部座標固定 ──
  程式會自動偵測每張照片頭部的實際寬度跟位置，用「目標頭寬 ÷ 這張照片實際頭寬」
  算出縮放倍率，讓兩位主持人的頭「一樣大、一樣高」，不會因為身材比例不同跑掉。

  注意：這個模式完全不管腳在哪裡——身材較長的人身體可能會超出畫布下緣（直接裁掉），
  身材較短的人腳可能貼不到畫布底部（下面留白）。這是你選過的取捨（頭一致優先），
  如果之後想換成「腳一定貼底、頭大小可以不一樣」，把 host1/host2 的 headWidthPct
  拿掉、改回 feetAtBottom:true 即可（下面保留舊寫法在註解裡）。

  下面 4 個數字調頭部的大小／位置／距離：
    HEAD_WIDTH_PCT     兩位主持人頭部的寬度，佔畫布寬度的比例（0~1，主持人2用這個原始值）
    HEAD_DISTANCE_PCT  兩位主持人頭部的水平距離，佔畫布寬度的比例（0~1）
    HEAD_CENTER_X_PCT  兩顆頭中心點的「中點」在畫布上的水平位置比例（0~1）
    HEAD_Y_PCT         兩位主持人頭部的垂直位置比例（0~1，兩人一樣高，由上往下量）
    HOST1_SCALE        主持人1（右側）在 HEAD_WIDTH_PCT 基礎上再放大的倍率
                        例：1.08 代表主持人1的頭（跟著整個人）比主持人2大 8%

  改完存檔、重新整理頁面即可，不用動下面 host1/host2 裡的 headXPct/headYPct
  （那兩個是自動算出來的，不用手動改）。

  ── 商品（product1/2/3）：沒有「頭」，維持用整張圖錨點（底部置中）定位 ──
    xPct / yPct：圖片錨點（底部置中的那個點）在畫布上的位置比例
    hPct       ：圖片要佔畫布高度的比例
    product1 目前設定是「左側、靠近人物、貼近臉部高度」，是手動微調過的位置：
      xPct 越大越靠右，yPct 越大越靠下，hPct 決定大小。

  這組數字只有在「素材第一次被加進來、還沒有任何位置資料」時才會套用；
  只要使用者在畫布上拖曳/縮放調整過，就會照使用者調整的結果，不會再被這裡的預設值蓋掉。
*/
(function(){

  // ── 頭部大小／位置／距離：只需要調這幾個數字 ──
  var HEAD_WIDTH_PCT    = 0.16; // 主持人2 的頭寬（佔畫布寬度比例）
  var HEAD_DISTANCE_PCT = 0.26; // 兩顆頭的水平距離（佔畫布寬度比例）
  var HEAD_CENTER_X_PCT = 0.59; // 兩顆頭中心點的中點（水平位置比例）
  var HEAD_Y_PCT        = 0.30; // 兩顆頭的垂直位置（由上往下，比例）
  var HOST1_SCALE       = 1.08; // 主持人1（右側）在 HEAD_WIDTH_PCT 基礎上再放大的倍率

  window.ShadowLayoutDefaults = {
    host1: { // 主持人1：頭部偏右，頭寬比主持人2大 HOST1_SCALE 倍，腳不管（可能超出畫布或懸空）
      headWidthPct: HEAD_WIDTH_PCT * HOST1_SCALE,
      headXPct: HEAD_CENTER_X_PCT + HEAD_DISTANCE_PCT/2,
      headYPct: HEAD_Y_PCT
      // 想改回「腳貼底優先」：拿掉 headWidthPct，改加 feetAtBottom:true, bottomMarginPct:0, minHPct:0.5, maxHPct:1.3
    },
    host2: { // 主持人2：頭部偏左，頭寬/頭部座標固定，腳不管（可能超出畫布或懸空）
      headWidthPct: HEAD_WIDTH_PCT,
      headXPct: HEAD_CENTER_X_PCT - HEAD_DISTANCE_PCT/2,
      headYPct: HEAD_Y_PCT
    },
    product1: { xPct: 0.24, yPct: 0.54, hPct: 0.28 }, // 商品1：左側，跟臉同高，靠近人物
    product2: { xPct: 0.18, yPct: 0.44, hPct: 0.30 }, // 商品2：左側偏上（C/D 組合用）
    product3: { xPct: 0.18, yPct: 0.14, hPct: 0.28 }  // 商品3：左側最上方（D 組合用）
  };

})();
