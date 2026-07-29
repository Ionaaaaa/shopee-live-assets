/*
  mask-defaults.js
  「主持人身體太短、貼不到版位最底部」時，用來補在最底部的裝飾色塊。

  形狀：左右貼齊畫布邊緣，頂部邊緣是中間往下凹的弧形（不是直線），
  往下一路延伸到畫布最底部。顏色是橢圓放射狀漸層——弧形邊（頂部正中央）
  最淺，往下、往左右邊緣擴散變深，貼齊畫布左右邊緣的地方只會是純深色。
  畫的順序在「商品/主持人陰影疊層」之後，所以會蓋在主持人/商品上面。

  ── 要不要顯示：由 editor 的開關控制，不是這裡 ──
  這份檔案只決定「每個版位長什麼樣子」（形狀、顏色、大小）。
  「現在要不要顯示」是 editor 右側「商品／主持人 陰影」底下的開關
  （一鍵套用到所有版位），預設關閉，跟 S.maskOn 一起被廣播出去、
  存在各版位的 D.maskOn。獨立打開單一版位檔案測試、還沒收到 editor
  廣播時，才會退回用下面這個 window.MaskEnabled 當預設值。

  ── 每個版位的參數 ──
    enabled          這個版位有沒有配置遮罩（沒有的話，就算開關開著也不會畫）
    height           色塊「最深處」的高度（從畫布最底部往上量），只微調高度改這個數字就好
    dip              中間凹下去的弧形，控制點比兩側邊緣再往下多少 px；
                     因為是二次貝茲曲線，正中間實際視覺凹陷深度大約是這個數字的一半
                     （例如 dip:130，正中間大概往下凹 65px，兩側邊緣仍是原本的高度）
    color            深色（左右邊緣、離弧形較遠的地方看到的顏色）
    lightColor       弧形邊正中央最淺的顏色
    glowWidthRatio   淺色橫向擴散範圍，占畫布寬度的比例（預設 0.32，數字越大擴散越寬）
    glowHeightRatio  淺色縱向擴散範圍，倍數對應 height（預設 1.6，數字越大往下擴散越多）

  版位 id 怎麼來：自動抓網址檔名，跟專案裡其他設定檔用同一套規則。

  ── 目前狀態 ──
  01_thumbnail 已經有實際數字（height:184，弧形凹陷約65px視覺深度，深藍 #364c82）。
  04_ig / 06_opening 先套用跟 01 一樣的起始數字——這兩個版位畫布比較高，
  建議實際預覽後再依畫面調整 height / dip，不用改其他程式，改這裡的數字就好。
*/
window.MaskEnabled = false; // 獨立測試單一版位檔案、還沒收到editor廣播時的預設值

window.MaskDefaults = {

  _default: { enabled: false },

  '01_thumbnail': {
    enabled: true,
    height: 90,
    dip: 70,
    color: '#1f305c',
    lightColor: '#364c82',
    glowWidthRatio: 0.6,
    glowHeightRatio: 0.9
  },

  '04_ig': {
    enabled: true, // 先用跟01一樣的起始數字，04畫布比較高，建議預覽後再調整 height/dip
    height: 284,
    dip: 100,
    color: '#1f305c',
    lightColor: '#364c82',
    glowWidthRatio: 0.6,
    glowHeightRatio: 0.9
    },

  '05_fb_post': {
    enabled: true,
    x: 500,             // 畫布寬1200的一半，貼齊右邊緣
    width: 700,
    height: 130,        // 加長（原本114）
    leftDrop: 50,
    dip: 90,
    color: '#1f305c',
    lightColor: '#364c82',
    glowWidthRatio: 0.6,
    glowHeightRatio: 0.9,
    fade: {
      enabled: true,
      type: 'linear',    // 直線漸層，跟顏色的深藍/淺藍漸層完全獨立、無關
      cx: 500,           // 淡化起點（0%不透明），貼齊色塊左邊界
      cy: 400,           // 水平方向淡化時，這個值不影響效果
      extentPx: 30,      // 左邊界0%不透明，往右15px漸變到100%不透明
      angle: 0           // 0度＝水平朝右
    }
  },
 

  '06_opening': {
    enabled: true, // 先用跟01一樣的起始數字，06畫布比較高，建議預覽後再調整 height/dip
    height: 234,
    dip: 100,
    color: '#1f305c',
    lightColor: '#364c82',
    glowWidthRatio: 0.6,
    glowHeightRatio: 0.9
  },

};
