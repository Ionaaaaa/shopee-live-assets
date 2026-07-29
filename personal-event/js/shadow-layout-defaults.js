/*
  shadow-layout-defaults.js
  只放「素材第一次被加進來時」的預設位置／大小數字，不含邏輯。
  之後想調整某個版型的擺法，直接改這裡對應版型底下的數字就好，
  不用去 shadow-layout-receiver.js 裡找，也不用擔心改到別的版型。

  ── 結構：完全照版型（A/B/C）分開，互不影響 ──
  window.ShadowLayoutDefaults = {
    A: { host1:{...}, host2:{...} },                       // 2人
    B: { host1:{...}, product1:{...}, product2:{...} },    // 1人+2品
    C: { product1:{...}, product2:{...}, product3:{...} }  // 3品
  };
  每個版型只列出「這個版型實際會用到」的代號（例如 B 沒有 host2、C 完全沒有 host），
  一個版型的數字只會影響那個版型，改 B 不會動到 A/C，之後要加新版型／新內容，
  直接照這個格式在最外層加一組新的版型代號即可，其他版型完全不受影響。

  （2026-07 更新：拿掉了「2人+1品」這個版型，因為Excel工單「商品組合」欄位
  本來就只有2人／1人+2品／3品這3個選項，「2人+1品」從來沒被用過。字母跟著
  往前遞補：原本 C(1人+2品) 改成 B、原本 D(3品) 改成 C，現在跟Excel欄位
  A/B/C字母意義完全一致。）

  ── 主持人／來賓（host1 / host2）：頭寬固定＋頭部座標固定 ──
  程式會自動偵測每張照片頭部的實際寬度跟位置，用「目標頭寬 ÷ 這張照片實際頭寬」
  算出縮放倍率，讓主持人跟來賓的頭「一樣大、一樣高」，不會因為身材比例不同跑掉。
  headWidthPct／headXPct／headYPct 這三個數字就是控制這件事：
    headWidthPct  頭寬，佔畫布寬度的比例（0~1）
    headXPct      頭部中心點的水平位置比例（0~1）
    headYPct      頭部中心點的垂直位置比例（0~1，由上往下量）

  注意：這個模式完全不管腳在哪裡——身材較長的人身體可能會超出畫布下緣（直接裁掉），
  身材較短的人腳可能貼不到畫布底部（下面留白）。這是你選過的取捨（頭一致優先），
  如果之後想換成「腳一定貼底、頭大小可以不一樣」，把某個版型的 headWidthPct
  拿掉、改加 feetAtBottom:true, bottomMarginPct:0, minHPct:0.5, maxHPct:1.3 即可。

  下面這組共用常數只是「用來算出上面 headWidthPct/headXPct 數字」的輔助工具，
  不是給程式在執行時讀取的（執行時只認版型底下寫死的最終數字）。
  想同時微調「所有版型的頭距離／大小」這種共通比例時，改這幾個數字最快；
  只想改單一版型時，直接改該版型物件裡的數字即可，不影響這幾個共用常數。
    HEAD_WIDTH_PCT       頭寬（佔畫布寬度比例，來賓用這個原始值）
    HEAD_DISTANCE_PCT    A 版型（2人）左右兩顆頭的水平距離（佔畫布寬度比例）
    CENTER_A             A 版型（只有2人，無商品）：兩顆頭中心點的中點——整組置中
    HEAD_Y_PCT           頭部垂直位置（由上往下，比例）
    HOST1_SCALE          主持人（右側）在 HEAD_WIDTH_PCT 基礎上再放大的倍率
                          例：1.08 代表主持人的頭（跟著整個人）比來賓大 8%

  ── 商品（product1/2/3）：沒有「頭」，維持用整張圖錨點（底部置中）定位 ──
    xPct / yPct：圖片錨點（底部置中的那個點）在畫布上的位置比例
    hPct       ：圖片要佔畫布高度的比例（100% 比例時的大小，實際大小還會再乘上 Excel 填的比例）
    xPct 越大越靠右，yPct 越大越靠下，hPct 決定大小。

  這組數字只有在「素材第一次被加進來、還沒有任何位置資料」時才會套用；
  只要使用者在畫布上拖曳/縮放調整過，就會照使用者調整的結果，不會再被這裡的預設值蓋掉。
*/
(function(){

  // ── 共用常數：只是用來算數字，不是執行時讀取的欄位（見上方說明）──
  var HEAD_WIDTH_PCT      = 0.16; // 來賓的頭寬（佔畫布寬度比例）
  var HEAD_DISTANCE_PCT   = 0.26; // 兩顆頭的水平距離（佔畫布寬度比例）
  var CENTER_A             = 0.5;  // A：整組置中
  var HEAD_Y_PCT           = 0.30; // 頭部垂直位置（由上往下，比例）
  var HOST1_SCALE          = 1.08; // 主持人在 HEAD_WIDTH_PCT 基礎上再放大的倍率
  var PRODUCT_SCALE_UP     = 2;  // 商品整體再放大的倍率（2026-07新增：商品在1200畫布裡偏小，
                                    // 廣播到各版位後畫質會被拉伸變差，統一放大這裡即可套用到
                                    // B/C/_fallback全部版型的商品，不用每個版型分別改一次；
                                    // xPct/yPct錨點位置不動，只放大 hPct，避免放大後彼此重疊過多。

  window.ShadowLayoutDefaults = {

    // ── A：2人，無商品，整組置中 ──
    A: {
      host1: { // 主持人：偏右
        headWidthPct: HEAD_WIDTH_PCT * HOST1_SCALE,
        headXPct: CENTER_A + HEAD_DISTANCE_PCT/2,
        headYPct: HEAD_Y_PCT
      },
      host2: { // 來賓：偏左
        headWidthPct: HEAD_WIDTH_PCT,
        headXPct: CENTER_A - HEAD_DISTANCE_PCT/2,
        headYPct: HEAD_Y_PCT
      }
    },

    // ── B：1人＋2品，三角形擺放：人偏左、商品1置中、商品2偏右下（原本的C組合，
    //     只是改叫B，數字完全沒動） ──
    B: {
      host1: { // 只有主持人，沒有來賓，整個人偏左，但再靠近商品一點
        headWidthPct: 0.17,
        headXPct: 0.31,
        headYPct: HEAD_Y_PCT
      },
      product1: { xPct: 0.58, yPct: 0.62, hPct: 0.36 * PRODUCT_SCALE_UP }, // 置中偏右、往下移，避開人物手臂也不會高過主持人，三角形擺放的主商品
      product2: { xPct: 0.74, yPct: 0.70, hPct: 0.28 * PRODUCT_SCALE_UP }  // 偏右下，疊在商品1前面
    },

    // ── C：3品，完全沒有人物，三角形擺放：商品3取代B組合裡主持人的位置（左側），
    //     商品1／商品2 直接沿用 B 組合已經調好的中心／右下位置（原本的D組合，
    //     只是改叫C，數字完全沒動） ──
    C: {
      product1: { xPct: 0.58, yPct: 0.62, hPct: 0.36 * PRODUCT_SCALE_UP }, // 置中，跟B組合商品1同位置
      product2: { xPct: 0.74, yPct: 0.70, hPct: 0.28 * PRODUCT_SCALE_UP }, // 偏右下，跟B組合商品2同位置
      product3: { xPct: 0.34, yPct: 0.70, hPct: 0.28 * PRODUCT_SCALE_UP }  // 左側，取代B組合裡主持人的位置，大小跟商品2一樣
    },

    /* 備援：理論上不會用到——只有在收不到目前版型資訊時（例如訊息順序異常）才會退回這裡，
       避免完全沒有位置可用。 */
    _fallback: {
      host1: { headWidthPct: HEAD_WIDTH_PCT * HOST1_SCALE, headXPct: CENTER_A + HEAD_DISTANCE_PCT/2, headYPct: HEAD_Y_PCT },
      host2: { headWidthPct: HEAD_WIDTH_PCT, headXPct: CENTER_A - HEAD_DISTANCE_PCT/2, headYPct: HEAD_Y_PCT },
      product1: { xPct: 0.76, yPct: 0.54, hPct: 0.28 * PRODUCT_SCALE_UP },
      product2: { xPct: 0.82, yPct: 0.44, hPct: 0.30 * PRODUCT_SCALE_UP },
      product3: { xPct: 0.82, yPct: 0.14, hPct: 0.28 * PRODUCT_SCALE_UP }
    }

  };

})();
