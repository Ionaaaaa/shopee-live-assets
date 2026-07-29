'use strict';

/*
  editor-logo2-canvas.js
  Logo2 編輯面板——比照 editor-shadow-canvas.js 的做法：獨立 popup、獨立大畫布，
  使用者在這裡把 logo2 素材擺好（自動判斷方形/長型、自動吸底色、固定圓角、
  手動拖曳/縮放），按「下一步」把畫面合成成一張 PNG，套進 S.imgs.logo2，
  接著自動跳轉開啟陰影面板。

  這裡取代了原本放在每個版位 iframe 裡即時運算的 layout-logo2.js——
  現在圓角/底色/位置全部在這個面板裡「烤」進同一張圖，版位端只要單純
  把這張現成的圖用 logo1 那種「固定高度、依比例算寬度」的方式畫上去就好，
  不用再自己判斷形狀、自己裁切、自己算底色。

  重新編輯：面板重開時要能接續使用者上次的縮放/位移，所以除了合成好的
  最終 PNG（存在 S.imgs.logo2），另外存一份「原始素材（未合成的原圖）＋
  當時的縮放位移」（S.logo2Raw / S.logo2Scale / S.logo2OffX / S.logo2OffY /
  S.logo2Shape），重開面板時用這份還原，不是每次都要重新上傳重新調。
  S.logo2Raw 存的是「使用者上傳的原圖」，不是合成後的死圖——合成後的圖沒辦法
  反推回「原本怎麼縮放/擺放」，所以務必用原圖＋數值分開存。
*/

/* 工作畫布尺寸：用 PS 原始尺寸（長型 400×180／方形 245×270）的 3 倍，
   操作空間比較寬裕，匯出品質只會更好不會變差（之後套到版位一律是往小縮）。 */
var LOGO2_WORK_DIM = {
  wide:   { w: 1200, h: 540 },
  square: { w: 735,  h: 810 },
  double: { w: 1340, h: 540 } // 雙logo（共播）：跟長型單張共用同一個範圍，寬度多拉寬140px給兩個logo多一點擺放空間；05_fl.html／FL示意圖換算位移比例時要用同一組數字
};
var LOGO2_RADIUS_PX = 12; // 固定圓角（在工作畫布尺度下），全域只有這一個數字

var _logo2BigCanvas = null, _logo2BigCtx = null, _logo2BigInited = false;
var _logo2Img = null, _logo2Bounds = null, _logo2BgColor = '#ffffff';
var _logo2SampledBgColor = '#ffffff'; // Logo素材本身的底色（直播間FL「以Logo底色填滿」模式用）
var _logo2RawSrc = null;   // 使用者上傳的原圖（未合成），用來存 S.logo2Raw / 重新編輯還原
var _logo2Shape = 'wide';
var _logo2Scale = 1, _logo2OffX = 0, _logo2OffY = 0;
var _logo2Box = null;      // 目前渲染範圍（給滑鼠命中判斷用）
var _logo2Selected = false;
var _logo2DragData = null, _logo2ResizeData = null;

/* ── 雙logo（共播）模式的「第二格」：欄位命名比照上面單張版本加B後綴，
   兩格資料完全獨立（各自的原圖/框選範圍/縮放/位移/選取狀態），
   _logo2Shape==='double' 時才會用到這一組，切回單張模式就不畫也不參與命中判斷。 ── */
var _logo2ImgB = null, _logo2BoundsB = null, _logo2RawSrcB = null;
var _logo2ScaleB = 1, _logo2OffXB = 0, _logo2OffYB = 0;
var _logo2BoxB = null;
var _logo2SelectedB = false;
var _logo2DragDataB = null, _logo2ResizeDataB = null;

/* 兩個logo都選取（多選）時的群組拖曳/縮放互動資料，見 logo2GroupBounds()。 */
var _logo2GroupDragData = null, _logo2GroupResizeData = null;

/* ── 復原（Ctrl+Z）：只記錄「位置/縮放/疊放順序」這幾個欄位的微調，
   不含上傳/刪除素材、單張↔雙logo模式切換——範圍刻意縮小，復原/回推
   都只牽涉這幾個數字欄位，不會有「復原到一半資料兜不起來」的風險。
   最多存5步，見 logo2PushUndo()／logo2Undo()，註冊給 editor-canvas-ui.js
   的通用復原分派器 window.BNUndo。 */
var _logo2UndoStack = [];
var LOGO2_UNDO_MAX = 5;

/* 雙logo（共播）模式：兩個logo共用同一塊範圍，可自由擺放/縮放/重疊，
   用這個值決定「誰畫在上面」（'A'或'B'），預設後加入的B在上面。
   交換位置/更換/移除這幾個動作現在是畫布下方的懸浮bar（DOM），不再畫在canvas上，
   所以不需要再存icon的命中範圍。 */
var _logo2TopSlot = 'B';

/* 透明底、只有logo本身的離屏畫布——專門給直播間FL的LOGO版型用（示意圖即時預覽＋
   確認並套用時烤成PNG廣播），跟 _logo2BigCanvas 最大的差別是「不畫白底」，
   這樣FL版位自己選的白底＋橘框／吸色底才不會被蓋掉。每次 drawLogo2BigCanvas()
   都會同步刷新，所以示意圖可以跟著Logo2的調整即時變動，不用等按確認。 */
var _logo2FlCleanCanvas = null, _logo2FlCleanCtx = null;

/* ── 形狀判斷／底色採樣／有色範圍——邏輯搬自原本的 layout-logo2.js ── */

function logo2DetectShape(bw, bh){
  var ratio = bw / bh;
  return (ratio >= 0.8 && ratio <= 1.25) ? 'square' : 'wide';
}

function logo2CalcTightBounds(im){
  try{
    var c = document.createElement('canvas');
    c.width = im.naturalWidth; c.height = im.naturalHeight;
    var cx = c.getContext('2d');
    cx.drawImage(im, 0, 0);
    var data = cx.getImageData(0, 0, c.width, c.height).data;
    var minX=c.width, minY=c.height, maxX=0, maxY=0, found=false;
    for(var y=0; y<c.height; y+=2){
      for(var x=0; x<c.width; x+=2){
        var a = data[(y*c.width+x)*4+3];
        if(a>10){
          found=true;
          if(x<minX)minX=x; if(x>maxX)maxX=x;
          if(y<minY)minY=y; if(y>maxY)maxY=y;
        }
      }
    }
    if(!found) return {x:0,y:0,w:im.naturalWidth,h:im.naturalHeight};
    return {x:minX,y:minY,w:(maxX-minX)||1,h:(maxY-minY)||1};
  }catch(e){
    return {x:0,y:0,w:im.naturalWidth,h:im.naturalHeight};
  }
}

/* 原本這裡會自動吸取 logo 圖片裡最常見的顏色當底色，
   但遇到黑色文字的 logo，黑色文字常常會變成「最常見的顏色」，
   吸出來的底色也是黑的，字就跟底色融在一起看不見了。
   改成固定回傳白色，不用再猜——白底套用在任何顏色的文字/圖案上都安全，
   不會有文字被底色蓋住的問題。 */
function logo2SampleBgColor(im){
  return '#ffffff';
}

/* 給直播間FL「以Logo底色填滿」模式專用──真的去吸Logo素材本身的底色，
   跟上面那支 logo2SampleBgColor()（故意固定回傳白色，給Logo2小卡本身的白底用）
   是兩回事，不要共用，避免黑字Logo又被誤判成黑底的老問題重演。

   做法：取原圖四個角落＋四邊中點共8個取樣點，忽略太透明的像素（純去背
   Logo通常四個角都是全透明），其餘用出現次數最多的顏色當作素材本身的
   底色；如果8個點全部太透明（抓不到底色），退回白色。 */
function logo2SampleAssetBgColor(im){
  try{
    var w = im.naturalWidth, h = im.naturalHeight;
    if(!w || !h) return '#ffffff';
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var cx = c.getContext('2d');
    cx.drawImage(im, 0, 0);

    var pts = [
      [1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2],
      [Math.floor(w / 2), 1], [Math.floor(w / 2), h - 2],
      [1, Math.floor(h / 2)], [w - 2, Math.floor(h / 2)]
    ];
    var counts = {};
    pts.forEach(function(pt){
      var x = Math.max(0, Math.min(w - 1, pt[0]));
      var y = Math.max(0, Math.min(h - 1, pt[1]));
      var d = cx.getImageData(x, y, 1, 1).data;
      if(d[3] < 200) return; // 太透明就不算候選（純去背Logo會全部被跳過）
      var key = d[0] + ',' + d[1] + ',' + d[2];
      counts[key] = (counts[key] || 0) + 1;
    });

    var best = null, bestCount = 0;
    Object.keys(counts).forEach(function(key){
      if(counts[key] > bestCount){ bestCount = counts[key]; best = key; }
    });
    if(!best) return '#ffffff'; // 四周都透明，沒有底色可吸，退回白色

    var parts = best.split(',').map(Number);
    function hex2(v){ return v.toString(16).padStart(2, '0'); }
    return '#' + hex2(parts[0]) + hex2(parts[1]) + hex2(parts[2]);
  }catch(e){
    return '#ffffff';
  }
}

/* ── 初始化 ── */

function initLogo2BigCanvasOnce(){
  if(_logo2BigInited) return;
  _logo2BigCanvas = document.getElementById('logo2-compose-canvas');
  if(!_logo2BigCanvas) return;
  _logo2BigCtx = _logo2BigCanvas.getContext('2d');

  var upInput = document.getElementById('logo2-compose-upload');
  if(upInput){
    upInput.addEventListener('change', function(e){
      var f = e.target.files[0]; if(!f) return;
      var reader = new FileReader();
      reader.onload = function(ev){ logo2LoadImageFromSrc(ev.target.result); };
      reader.readAsDataURL(f);
    });
  }

  var upInputB = document.getElementById('logo2-compose-upload-b');
  if(upInputB){
    upInputB.addEventListener('change', function(e){
      var f = e.target.files[0]; if(!f) return;
      var reader = new FileReader();
      reader.onload = function(ev){ logo2LoadImageFromSrc(ev.target.result, 'B'); };
      reader.readAsDataURL(f);
    });
  }

  _logo2BigCanvas.addEventListener('mousedown', logo2CanvasMouseDown);
  document.addEventListener('mousemove', logo2CanvasMouseMove);
  document.addEventListener('mouseup', function(){
    _logo2DragData = null; _logo2ResizeData = null;
    _logo2DragDataB = null; _logo2ResizeDataB = null;
    _logo2GroupDragData = null; _logo2GroupResizeData = null;
  });

  document.addEventListener('keydown', function(e){
    if(!(_logo2Selected && _logo2Img) && !(_logo2SelectedB && _logo2ImgB)) return;
    var tag = (e.target && e.target.tagName) || '';
    if(tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
    var step = e.shiftKey ? 10 : 1;
    var moved = true;
    var b = _logo2SelectedB; // 目前選取的是雙logo模式的第二格，方向鍵要動B那組座標
    if(e.key === 'ArrowLeft')       { if(b) _logo2OffXB -= step; else _logo2OffX -= step; }
    else if(e.key === 'ArrowRight') { if(b) _logo2OffXB += step; else _logo2OffX += step; }
    else if(e.key === 'ArrowUp')    { if(b) _logo2OffYB -= step; else _logo2OffY -= step; }
    else if(e.key === 'ArrowDown')  { if(b) _logo2OffYB += step; else _logo2OffY += step; }
    else moved = false;
    if(moved){ e.preventDefault(); drawLogo2BigCanvas(); }
  });

  _logo2BigInited = true;
}

/* ── 載入素材（使用者手動上傳新圖時呼叫，會重設縮放位移） ── */

function logo2LoadImageFromSrc(src, slot){
  var im = new Image();
  im.onload = function(){
    if(slot === 'B'){
      _logo2ImgB = im;
      _logo2RawSrcB = src;
      _logo2BoundsB = logo2CalcTightBounds(im);
      _logo2ScaleB = 1; _logo2OffXB = 0; _logo2OffYB = 0; _logo2SelectedB = false;
      if(_logo2Shape !== 'double'){ _logo2Shape = 'double'; } // 上傳第二張的當下自動切換成雙logo模式
      logo2ResizeCanvasToShape();
      drawLogo2BigCanvas();
      logo2SyncDoubleControlsUI();
      return;
    }
    _logo2Img = im;
    _logo2RawSrc = src;
    _logo2Bounds = logo2CalcTightBounds(im);
    /* 雙logo模式下形狀已經固定是'double'（兩格並排的合成圖），
       不能被這張圖自己的長寬比蓋掉，不然畫布尺寸會被錯誤地縮回單張模式 */
    if(_logo2Shape !== 'double'){
      _logo2Shape = logo2DetectShape(_logo2Bounds.w, _logo2Bounds.h);
    }
    _logo2BgColor = logo2SampleBgColor(im);
    _logo2SampledBgColor = logo2SampleAssetBgColor(im);
    /* 如果直播間FL底色模式已經是「以Logo底色填滿」，換一張新Logo時要立刻
       把廣播用的顏色也更新──不然畫面會停在「上一張Logo」吸出來的舊顏色，
       看起來像是「這張新Logo沒有吸到底色」，其實是廣播值沒跟著換圖同步。 */
    if(S.flLogoBgMode === 'sampled'){
      S.flLogoSampledColor = _logo2SampledBgColor;
    }
    _logo2Scale = 1; _logo2OffX = 0; _logo2OffY = 0; _logo2Selected = false;
    S.flLogoExtraScale = 1; S.flLogoExtraOffX = 0; S.flLogoExtraOffY = 0;
    logo2ResizeCanvasToShape();
    drawLogo2BigCanvas();
    if(S.flLogoBgMode === 'sampled' && typeof broadcast === 'function') broadcast();
  };
  im.src = src;
}

/* ── 雙logo（共播）模式：加入第二格／移除第二格／左右對調 ──
   目前沒有固定的「誰在左誰在右」規則（不管是工單資料夾比對到2張，還是
   使用者自己手動上傳2張），一律先左右並排帶入，使用者自己在畫布裡用
   「左右對調」按鈕決定順序即可。 */
function logo2AddSecondSlot(){
  if(_logo2Shape === 'double') return;
  _logo2Shape = 'double';
  logo2ResizeCanvasToShape();
  drawLogo2BigCanvas();
  logo2SyncDoubleControlsUI();
}

/* 舊版「移除第二個」：固定移除B格（目前沒有UI在用，保留是因為之後如果需要
   「不用挑，直接移除B」的捷徑還能用得上）。實際的「移除」操作現在走
   logo2RemoveSlotByName()，是側邊清單每個項目右上角的小×在用。 */
function logo2RemoveSecondSlot(){
  _logo2ImgB = null; _logo2BoundsB = null; _logo2RawSrcB = null;
  _logo2ScaleB = 1; _logo2OffXB = 0; _logo2OffYB = 0; _logo2SelectedB = false;
  _logo2TopSlot = 'B';
  _logo2Shape = _logo2Img ? logo2DetectShape(_logo2Bounds.w, _logo2Bounds.h) : 'wide';
  logo2ResizeCanvasToShape();
  drawLogo2BigCanvas();
  logo2SyncDoubleControlsUI();
}

/* 側邊清單每個項目右上角的小×：移除指定的那一個（'A'或'B'），不需要先在
   畫布上選取——跟商品清單每張縮圖右上角的刪除×是同一種做法。移除A的話，
   把B的資料搬到A（單張模式的資料都存在A這組變數裡），移除後只剩一個
   就自動退回單張模式。 */
function logo2RemoveSlotByName(slot){
  if(slot === 'A'){
    if(_logo2ImgB){
      // 搬B到A（單張模式的資料都存在A這組變數裡）
      _logo2Img = _logo2ImgB; _logo2Bounds = _logo2BoundsB; _logo2RawSrc = _logo2RawSrcB;
      _logo2Scale = _logo2ScaleB; _logo2OffX = _logo2OffXB; _logo2OffY = _logo2OffYB;
    } else {
      if(!_logo2Img) return; // A本來就是空的，沒事做
      _logo2Img = null; _logo2Bounds = null; _logo2RawSrc = null;
      _logo2Scale = 1; _logo2OffX = 0; _logo2OffY = 0;
    }
  } else if(slot === 'B'){
    if(!_logo2ImgB) return; // B本來就是空的，沒事做
  } else {
    return;
  }
  _logo2ImgB = null; _logo2BoundsB = null; _logo2RawSrcB = null;
  _logo2ScaleB = 1; _logo2OffXB = 0; _logo2OffYB = 0;
  _logo2Selected = false; _logo2SelectedB = false;
  _logo2TopSlot = 'B';

  _logo2Shape = _logo2Img ? logo2DetectShape(_logo2Bounds.w, _logo2Bounds.h) : 'wide';
  logo2ResizeCanvasToShape();
  drawLogo2BigCanvas();
  logo2SyncDoubleControlsUI();
}

/* 側邊清單裡點空的「+」：觸發對應的隱藏上傳欄位（A/B各自一個），
   選檔之後走原本的 logo2LoadImageFromSrc()，上傳B會自動切成雙logo模式。 */
function logo2TriggerUpload(slot){
  var inp = document.getElementById(slot === 'B' ? 'logo2-compose-upload-b' : 'logo2-compose-upload');
  if(inp) inp.click();
}

/* 點懸浮bar的「交換」：A、B兩個logo的位置整個對調、大小不變（AB變成BA），
   跟兩個logo本身放的是哪張圖無關。刻意不取消選取——這樣懸浮bar會留著、
   選取框也會跟著移到新位置，才能明確看到「真的對調了」，不會誤以為
   點下去沒反應。 */
function logo2SwapSlots(){
  if(_logo2Shape !== 'double') return;
  logo2PushUndo();
  /* 只交換「位置」，大小(scale)留在原本的logo身上不動——使用者明確要求
     交換不要連大小一起換，只要換位置。 */
  var tmpOffX=_logo2OffX, tmpOffY=_logo2OffY;
  _logo2OffX=_logo2OffXB; _logo2OffY=_logo2OffYB;
  _logo2OffXB=tmpOffX; _logo2OffYB=tmpOffY;
  drawLogo2BigCanvas();
}

/* ── 畫布下方的懸浮 action bar（DOM，比照主持人素材的 .sel-bar 風格）：
   只有雙logo模式、且點選了其中一個logo時才顯示，只有一個「交換」按鈕
   （更換素材用原本的上傳欄位重新選檔即可，移除改到側邊清單的小×）。 ── */
function logo2SyncFloatBarUI(){
  var bar = document.getElementById('logo2-float-bar');
  if(!bar) return;
  var oneSelected = _logo2Selected !== _logo2SelectedB; // 剛好一個true一個false＝只選了一個
  var showing = (_logo2Shape === 'double') && oneSelected;
  bar.style.display = showing ? 'flex' : 'none';
}

function logo2FloatBarSwap(){
  logo2SwapSlots();
}

/* ── 疊放順序：側邊拖曳排序清單（比照商品/主持人清單的做法），
   拖曳清單項目上下移動＝改變 _logo2TopSlot（清單最上面＝最前景）。 ── */
function logo2SyncOrderListUI(){
  var list = document.getElementById('logo2-order-list');
  if(!list) return;
  var order = (_logo2TopSlot === 'A') ? ['A', 'B'] : ['B', 'A']; // 陣列第一個＝清單最上面＝最前景
  order.forEach(function(slot){
    var item = list.querySelector('.logo2-order-item[data-slot="'+slot+'"]');
    if(item) list.appendChild(item); // 依序重新append，DOM順序就會對
  });
}

/* 清單項目的選取樣式：跟商品/主持人清單(.lc-slot)同一套規則——
   只選一個＝accent色框(.active)，兩個都選＝多選的橘色框(.multi)。 */
function logo2SyncOrderListSelectionUI(){
  var itemA = document.querySelector('.logo2-order-item[data-slot="A"]');
  var itemB = document.querySelector('.logo2-order-item[data-slot="B"]');
  var multi = _logo2Selected && _logo2SelectedB;
  if(itemA){
    itemA.classList.toggle('multi', !!multi);
    itemA.classList.toggle('active', _logo2Selected && !multi);
  }
  if(itemB){
    itemB.classList.toggle('multi', !!multi);
    itemB.classList.toggle('active', _logo2SelectedB && !multi);
  }
}

var _logo2OrderDragSlot = null;
function logo2InitOrderListOnce(){
  var list = document.getElementById('logo2-order-list');
  if(!list || list._bnOrderBound) return;
  list._bnOrderBound = true;
  list.querySelectorAll('.logo2-order-item').forEach(function(item){
    item.addEventListener('dragstart', function(){
      _logo2OrderDragSlot = item.dataset.slot;
      item.classList.add('dragging');
    });
    item.addEventListener('dragend', function(){
      item.classList.remove('dragging');
      _logo2OrderDragSlot = null;
    });
  });
  list.addEventListener('dragover', function(e){ e.preventDefault(); });
  list.addEventListener('drop', function(e){
    e.preventDefault();
    if(!_logo2OrderDragSlot || _logo2Shape !== 'double') return;
    if(_logo2TopSlot !== _logo2OrderDragSlot) logo2PushUndo(); // 真的有改變順序才記一筆
    // 只有兩個項目，拖曳放開＝直接把被拖曳的那個變成最前景（最上面）
    _logo2TopSlot = _logo2OrderDragSlot;
    drawLogo2BigCanvas();
    logo2SyncOrderListUI();
  });
}

/* 側欄按鈕用：只切換「誰畫在上面」的疊放順序，不動位置/大小，
   跟浮動icon的「整個對調」是兩回事。 */
function logo2ToggleOrder(){
  if(_logo2Shape !== 'double') return;
  logo2PushUndo();
  _logo2TopSlot = (_logo2TopSlot === 'A') ? 'B' : 'A';
  drawLogo2BigCanvas();
}

/* 依目前是不是雙logo模式，切換「＋加入第二個logo」按鈕 vs 「上傳第二格／對調／移除」
   這組控制項的顯示，兩顆按鈕是互斥的（沒有第二格的時候只顯示新增，有的時候只顯示管理選項）。 */
function logo2SyncDoubleControlsUI(){
  logo2InitOrderListOnce();

  function buildFilledHTML(slot, rawSrc){
    var delFn = (slot === 'A') ? "logo2RemoveSlotByName('A')" : "logo2RemoveSlotByName('B')";
    return '<span class="logo2-order-drag">⠿</span>' +
      '<div class="logo2-order-thumb"><img src="' + rawSrc + '"></div>' +
      '<span class="logo2-order-label">Logo ' + slot + '</span>' +
      '<span class="logo2-order-del" onclick="event.stopPropagation();' + delFn + '" title="移除">×</span>';
  }
  function buildEmptyHTML(slot){
    var upFn = (slot === 'A') ? "logo2TriggerUpload('A')" : "logo2TriggerUpload('B')";
    return '<span class="logo2-order-drag">⠿</span>' +
      '<div class="logo2-order-thumb logo2-order-add" onclick="' + upFn + '" title="上傳"><span class="logo2-order-plus">+</span></div>' +
      '<span class="logo2-order-label">Logo ' + slot + '</span>';
  }

  var itemA = document.querySelector('.logo2-order-item[data-slot="A"]');
  if(itemA){
    itemA.innerHTML = _logo2RawSrc ? buildFilledHTML('A', _logo2RawSrc) : buildEmptyHTML('A');
    itemA.draggable = !!_logo2RawSrc; // 空的先不給拖，避免誤會
  }
  var itemB = document.querySelector('.logo2-order-item[data-slot="B"]');
  if(itemB){
    itemB.innerHTML = _logo2RawSrcB ? buildFilledHTML('B', _logo2RawSrcB) : buildEmptyHTML('B');
    itemB.draggable = !!_logo2RawSrcB;
  }

  logo2SyncOrderListUI(); // 依疊放順序把DOM重新排一次
  logo2SyncOrderListSelectionUI();
  logo2SyncFloatBarUI();
}

function logo2ResizeCanvasToShape(){
  if(!_logo2BigCanvas) return;
  var dim = LOGO2_WORK_DIM[_logo2Shape] || LOGO2_WORK_DIM.wide;
  _logo2BigCanvas.width = dim.w;
  _logo2BigCanvas.height = dim.h;
  _logo2BigCanvas.style.aspectRatio = dim.w + '/' + dim.h;
}

/* ── 繪製 ── */

/* 刷新透明底的FL專用離屏畫布：跟目前畫面上的Logo2內容（單張或雙logo共用範圍）
   完全同步，但不畫白底、不畫選取框/把手/交換icon——單純只有logo本身，
   相對位置/大小/間距（雙logo模式）都跟畫面上看到的一致。 */
function logo2RenderFlCleanCanvas(){
  if(!_logo2BigCanvas) return;
  var W = _logo2BigCanvas.width, H = _logo2BigCanvas.height;
  if(!_logo2FlCleanCanvas){
    _logo2FlCleanCanvas = document.createElement('canvas');
    _logo2FlCleanCtx = _logo2FlCleanCanvas.getContext('2d');
  }
  if(_logo2FlCleanCanvas.width !== W) _logo2FlCleanCanvas.width = W;
  if(_logo2FlCleanCanvas.height !== H) _logo2FlCleanCanvas.height = H;
  var ctx = _logo2FlCleanCtx;
  ctx.clearRect(0, 0, W, H);

  if(_logo2Shape === 'double'){
    var bottomSlot = (_logo2TopSlot === 'A') ? 'B' : 'A';
    [bottomSlot, _logo2TopSlot].forEach(function(slot){
      if(slot === 'A' && _logo2Img && _logo2Bounds){
        drawLogo2SharedOne(ctx, W, H, _logo2Img, _logo2Bounds, _logo2Scale, _logo2OffX, _logo2OffY);
      } else if(slot === 'B' && _logo2ImgB && _logo2BoundsB){
        drawLogo2SharedOne(ctx, W, H, _logo2ImgB, _logo2BoundsB, _logo2ScaleB, _logo2OffXB, _logo2OffYB);
      }
    });
    return;
  }

  if(!_logo2Img || !_logo2Bounds) return;
  var bw=_logo2Bounds.w, bh=_logo2Bounds.h, bx=_logo2Bounds.x, by=_logo2Bounds.y;
  var sclBase = Math.min(W/bw, H/bh);
  var scl = sclBase * _logo2Scale;
  var dw = bw*scl, dh = bh*scl;
  var dx = (W-dw)/2 + _logo2OffX;
  var dy = (H-dh)/2 + _logo2OffY;
  ctx.drawImage(_logo2Img, bx, by, bw, bh, dx, dy, dw, dh);
}

function drawLogo2BigCanvas(){
  if(!_logo2BigCtx || !_logo2BigCanvas) return;
  var W = _logo2BigCanvas.width, H = _logo2BigCanvas.height;
  _logo2BigCtx.clearRect(0,0,W,H);

  /* 這一步要在刷新FL清透明畫布之前做——不然「兩個logo都剛上傳好、還沒排版」
     的那一瞬間，FL清透明畫布會先抓到「還沒套用預設排版」的重疊畫面，
     示意圖就會先顯示重疊，等下一次隨便什麼互動觸發重繪才會「跳成」排好版的樣子。 */
  if(_logo2Shape === 'double') logo2MaybeApplyDefaultDoubleLayout();

  logo2RenderFlCleanCanvas(); // 跟畫面同步更新，FL示意圖才能即時反映Logo2的調整

  if(_logo2Shape === 'double'){
    drawLogo2Shared();
    logo2UpdateHint();
    logo2UpdateFlPreview();
    return;
  }

  if(!_logo2Img){
    _logo2Box = null;
    logo2UpdateHint();
    logo2UpdateFlPreview();
    return;
  }

  var r = LOGO2_RADIUS_PX;
  _logo2BigCtx.save();
  _logo2BigCtx.beginPath();
  _logo2BigCtx.moveTo(r, 0);
  _logo2BigCtx.arcTo(W, 0, W, H, r);
  _logo2BigCtx.arcTo(W, H, 0, H, r);
  _logo2BigCtx.arcTo(0, H, 0, 0, r);
  _logo2BigCtx.arcTo(0, 0, W, 0, r);
  _logo2BigCtx.closePath();
  _logo2BigCtx.clip();

  _logo2BigCtx.fillStyle = _logo2BgColor;
  _logo2BigCtx.fillRect(0, 0, W, H);

  var bw = _logo2Bounds.w, bh = _logo2Bounds.h, bx = _logo2Bounds.x, by = _logo2Bounds.y;
  var sclBase = Math.min(W/bw, H/bh);
  var scl = sclBase * _logo2Scale;
  var dw = bw*scl, dh = bh*scl;
  var dx = (W-dw)/2 + _logo2OffX;
  var dy = (H-dh)/2 + _logo2OffY;
  _logo2BigCtx.drawImage(_logo2Img, bx, by, bw, bh, dx, dy, dw, dh);
  _logo2BigCtx.restore(); // 先把裁切範圍還原，選取框/把手才不會被圓角裁掉、才看得到

  _logo2Box = { x:dx, y:dy, w:dw, h:dh };

  if(_logo2Selected){
    _logo2BigCtx.save();
    _logo2BigCtx.strokeStyle = '#4a90e2'; // 跟 1200 陰影編輯器選取框同色，視覺統一
    _logo2BigCtx.lineWidth = 2;
    _logo2BigCtx.setLineDash([6,4]);
    _logo2BigCtx.strokeRect(dx, dy, dw, dh);
    _logo2BigCtx.setLineDash([]);

    var hs = logo2HandleSizeCanvasPx(); // 把手大小依畫布縮放換算，確保螢幕上看起來/點起來大小一致
    var corners = [[dx,dy],[dx+dw,dy],[dx,dy+dh],[dx+dw,dy+dh]];
    corners.forEach(function(pt){
      _logo2BigCtx.fillStyle = '#ffffff';   // 跟 1200 陰影編輯器一樣：白底
      _logo2BigCtx.strokeStyle = '#4a90e2'; // 藍色外框
      _logo2BigCtx.lineWidth = Math.max(1.5, hs*0.12);
      _logo2BigCtx.fillRect(pt[0]-hs/2, pt[1]-hs/2, hs, hs);
      _logo2BigCtx.strokeRect(pt[0]-hs/2, pt[1]-hs/2, hs, hs);
    });
    _logo2BigCtx.restore();
  }

  logo2UpdateHint();
  logo2UpdateFlPreview();
}

/* ── 雙logo（共播）模式：兩個logo共用同一塊範圍，各自可以自由擺放/縮放，
   允許重疊，用 _logo2TopSlot 決定誰畫在最上面；選取其中一個時，在它
   旁邊畫一個浮動的「交換」icon，點下去兩個logo的位置整個對調（大小不變）
   （見 logo2SwapSlots）。 ── */
function drawLogo2Shared(){
  var ctx = _logo2BigCtx;
  var W = _logo2BigCanvas.width, H = _logo2BigCanvas.height;
  var r = LOGO2_RADIUS_PX;

  logo2MaybeApplyDefaultDoubleLayout();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.arcTo(W, 0, W, H, r);
  ctx.arcTo(W, H, 0, H, r);
  ctx.arcTo(0, H, 0, 0, r);
  ctx.arcTo(0, 0, W, 0, r);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = '#ffffff'; // 跟單張模式一樣固定白底
  ctx.fillRect(0, 0, W, H);

  // 先畫在下面的那個，後畫在上面的那個，順序由 _logo2TopSlot 決定
  var bottomSlot = (_logo2TopSlot === 'A') ? 'B' : 'A';
  [bottomSlot, _logo2TopSlot].forEach(function(slot){
    if(slot === 'A' && _logo2Img && _logo2Bounds){
      _logo2Box = drawLogo2SharedOne(ctx, W, H, _logo2Img, _logo2Bounds, _logo2Scale, _logo2OffX, _logo2OffY);
    } else if(slot === 'B' && _logo2ImgB && _logo2BoundsB){
      _logo2BoxB = drawLogo2SharedOne(ctx, W, H, _logo2ImgB, _logo2BoundsB, _logo2ScaleB, _logo2OffXB, _logo2OffYB);
    }
  });
  if(!_logo2Img || !_logo2Bounds) _logo2Box = null;
  if(!_logo2ImgB || !_logo2BoundsB) _logo2BoxB = null;

  /* 兩格都還沒放東西時，顯示提示文字（不用畫框，因為現在沒有固定的「哪一格」位置了） */
  if(!_logo2Box && !_logo2BoxB){
    ctx.fillStyle = '#999999';
    ctx.font = Math.round(H*0.12) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('尚未上傳', W/2, H/2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }

  ctx.restore(); // 先把裁切範圍還原，選取框/把手才不會被圓角裁掉

  /* 選取框/把手：畫在最上層，不受兩個logo誰疊誰的影響，才能一直點得到/看得到。
     兩個都選取時（多選），畫一個涵蓋兩者的「聯集外框」＋4角控制點（跟1200商品/
     主持人畫布的多選外框同一套做法），不再各自畫一個框，避免混淆「點哪個角在縮放誰」。 */
  var bothSelected = _logo2Selected && _logo2SelectedB && _logo2Box && _logo2BoxB;
  if(bothSelected){
    drawLogo2SelectionBox(ctx, logo2GroupBounds());
  } else {
    if(_logo2Selected && _logo2Box) drawLogo2SelectionBox(ctx, _logo2Box);
    if(_logo2SelectedB && _logo2BoxB) drawLogo2SelectionBox(ctx, _logo2BoxB);
  }

  // 交換這個動作改成畫布下方的懸浮bar（DOM，多選時不顯示——交換是「兩個對調」，
  // 多選狀態下沒有「另一個」的概念），疊放順序改成側邊拖曳排序清單，
  // 清單項目的選取樣式（黃框/多選框）也在這裡一起同步。
  logo2SyncFloatBarUI();
  logo2SyncOrderListUI();
  logo2SyncOrderListSelectionUI();
}

/* 兩個logo目前選取框的聯集外框（給多選群組移動/縮放用），回傳跟 _logo2Box 格式
   一樣的 {x,y,w,h}，另外附上中心點 cx/cy 給群組縮放當基準點。 */
function logo2GroupBounds(){
  if(!_logo2Box || !_logo2BoxB) return null;
  var left = Math.min(_logo2Box.x, _logo2BoxB.x);
  var top = Math.min(_logo2Box.y, _logo2BoxB.y);
  var right = Math.max(_logo2Box.x+_logo2Box.w, _logo2BoxB.x+_logo2BoxB.w);
  var bottom = Math.max(_logo2Box.y+_logo2Box.h, _logo2BoxB.y+_logo2BoxB.h);
  return { x:left, y:top, w:right-left, h:bottom-top, cx:(left+right)/2, cy:(top+bottom)/2 };
}

/* 兩個logo都上傳好，且都還是「從沒被調過」的預設值(scale1/offset0)時，
   自動排成左右不重疊的預設位置，使用者手動拖過之後這裡就不會再介入，
   不會蓋掉使用者自己調好的位置。

   排版方式：先各自算出「最多佔多寬」（避免其中一個直接佔滿整塊共用範圍），
   再用兩個logo「實際算出來的寬度」去置中排版——不是假設兩個都剛好半寬。
   如果直接假設兩個都佔半寬去左右鏡射擺放，遇到其中一個logo本身比較窄
   （沒有真的塞滿它那一半）時，左右邊界看起來就會不對稱（其中一邊留白
   比較多），這也是造成使用者看到的「兩個logo距離不相等」的原因。 */
function logo2MaybeApplyDefaultDoubleLayout(){
  if(!(_logo2Img && _logo2Bounds && _logo2ImgB && _logo2BoundsB)) return;
  var untouchedA = (_logo2Scale === 1 && _logo2OffX === 0 && _logo2OffY === 0);
  var untouchedB = (_logo2ScaleB === 1 && _logo2OffXB === 0 && _logo2OffYB === 0);
  if(!untouchedA || !untouchedB) return;

  var dim = LOGO2_WORK_DIM.double;
  var W = dim.w, H = dim.h;
  var GAP = 80; // 兩個logo中間預設間距，跟舊版兩格並排的間距一致
  var halfW = (W - GAP) / 2;

  // 跟 drawLogo2SharedOne() 的「高度基準縮放」公式對應：scale=1時dw=(bw/bh)*H
  function defaultScaleAndWidth(bounds){
    var dwAtScale1 = (bounds.w / bounds.h) * H;
    var scale = Math.min(1, halfW / dwAtScale1);
    return { scale: scale, dw: dwAtScale1 * scale };
  }

  var a = defaultScaleAndWidth(_logo2Bounds);
  var b = defaultScaleAndWidth(_logo2BoundsB);
  _logo2Scale  = a.scale;
  _logo2ScaleB = b.scale;

  var totalW = a.dw + GAP + b.dw;
  var startX = (W - totalW) / 2; // 兩個logo＋中間間距，整組置中
  var centerA = startX + a.dw / 2;
  var centerB = startX + a.dw + GAP + b.dw / 2;
  _logo2OffX  = centerA - W / 2;
  _logo2OffXB = centerB - W / 2;
  _logo2OffY  = 0;
  _logo2OffYB = 0;
}

function drawLogo2SharedOne(ctx, W, H, img, bounds, scale, offX, offY){
  var bw=bounds.w, bh=bounds.h, bx=bounds.x, by=bounds.y;
  /* 固定用「高度基準」縮放（不跟寬度比較取最小值）：這樣兩個logo的相對大小
     只跟各自的高寬比＋畫布高度有關，跟畫布/目標框的寬高比無關——FL示意圖、
     05_fl正式版位的框比例都比這裡的編輯畫布更「扁」，如果沿用舊的
     min(W/bw,H/bh)取最小值寫法，兩個logo有可能各自被寬度/高度卡住的情況
     不一樣，換算到扁一點的框裡兩個logo的間距就會跑掉（比例對不齊）。
     固定用高度基準，三個地方的算法都一致，間距才會一直維持使用者調的比例。 */
  var sclBase = H / bh;
  var scl = sclBase * scale;
  var dw = bw*scl, dh = bh*scl;
  var dx = (W-dw)/2 + offX;
  var dy = (H-dh)/2 + offY;
  ctx.drawImage(img, bx, by, bw, bh, dx, dy, dw, dh);
  return { x:dx, y:dy, w:dw, h:dh };
}

/* 選取框＋四角把手，共用元件（單張模式跟雙logo共用範圍模式都用這個畫）。 */
function drawLogo2SelectionBox(ctx, box){
  var dx=box.x, dy=box.y, dw=box.w, dh=box.h;
  ctx.save();
  ctx.strokeStyle = '#4a90e2'; // 跟 1200 陰影編輯器選取框同色，視覺統一
  ctx.lineWidth = 2;
  ctx.setLineDash([6,4]);
  ctx.strokeRect(dx, dy, dw, dh);
  ctx.setLineDash([]);

  var hs = logo2HandleSizeCanvasPx();
  var corners = [[dx,dy],[dx+dw,dy],[dx,dy+dh],[dx+dw,dy+dh]];
  corners.forEach(function(pt){
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#4a90e2';
    ctx.lineWidth = Math.max(1.5, hs*0.12);
    ctx.fillRect(pt[0]-hs/2, pt[1]-hs/2, hs, hs);
    ctx.strokeRect(pt[0]-hs/2, pt[1]-hs/2, hs, hs);
  });
  ctx.restore();
}

/* 把手在畫布座標系裡該多大：固定「螢幕上看起來 16px」，換算成畫布內部解析度的等效大小，
   畫布內部解析度（1200×540／735×810）遠比顯示尺寸大，如果把手直接用固定的畫布座標數字，
   螢幕上會小到幾乎點不到——這是原本「只能移動、抓不到角落縮放」的主因。 */
function logo2HandleSizeCanvasPx(){
  if(!_logo2BigCanvas) return 20;
  var rect = _logo2BigCanvas.getBoundingClientRect();
  if(!rect.width) return 20;
  var scaleX = _logo2BigCanvas.width / rect.width;
  return 16 * scaleX;
}

function logo2UpdateHint(){
  var el = document.getElementById('logo2-compose-hint');
  if(!el) return;
  if(_logo2Shape === 'double'){
    el.textContent = '雙Logo模式（共播）：兩個logo共用同一塊範圍，可自由擺放/縮放甚至重疊；點一下可選取、拖曳移動、拖角落縮放（方向鍵微調，Shift加速）；選取後畫布下方會浮出「交換」按鈕，可以把兩個logo的位置整個對調（大小不變）；疊放順序（誰在上面）拖曳左側清單排序，要移除哪一個就點清單項目右上角的×';
    return;
  }
  if(!_logo2Img){ el.textContent = '請先上傳 logo2 素材'; return; }
  el.textContent = '目前判定為「' + (_logo2Shape==='square'?'方形':'長型') + '」，點一下素材可選取，選取後可拖曳移動、拖藍色角落縮放（方向鍵微調，Shift 加速）';
}

/* ── 滑鼠互動：拖曳移動／拖角縮放（邏輯搬自 layout-logo2.js） ── */

function logo2CanvasMouseDown(e){
  if(!_logo2BigCanvas) return;
  var rect = _logo2BigCanvas.getBoundingClientRect();
  var scaleX = _logo2BigCanvas.width / rect.width;
  var scaleY = _logo2BigCanvas.height / rect.height;
  var mx = (e.clientX - rect.left) * scaleX;
  var my = (e.clientY - rect.top) * scaleY;

  if(_logo2Shape === 'double'){
    logo2CanvasMouseDownShared(mx, my, e, scaleX, scaleY);
    return;
  }

  if(!_logo2Img || !_logo2Box) return;

  // 角落命中判定只在「已選取」時才生效（沒選取時看不到把手，也就不該搶走點擊）
  if(_logo2Selected){
    var HANDLE = logo2HandleSizeCanvasPx(); // 跟畫出來的把手大小一致，點得到看得到的東西
    var corners = [
      { sx:-1, sy:-1, x:_logo2Box.x,             y:_logo2Box.y             },
      { sx: 1, sy:-1, x:_logo2Box.x+_logo2Box.w, y:_logo2Box.y             },
      { sx:-1, sy: 1, x:_logo2Box.x,             y:_logo2Box.y+_logo2Box.h },
      { sx: 1, sy: 1, x:_logo2Box.x+_logo2Box.w, y:_logo2Box.y+_logo2Box.h }
    ];
    for(var i=0;i<corners.length;i++){
      var c = corners[i];
      if(Math.abs(mx-c.x)<=HANDLE && Math.abs(my-c.y)<=HANDLE){
        logo2PushUndo();
        _logo2ResizeData = { sx:e.clientX, sy:e.clientY, sc:_logo2Scale, signX:c.sx, signY:c.sy,
          ref: Math.min(_logo2BigCanvas.width, _logo2BigCanvas.height) };
        return;
      }
    }
  }

  if(mx>=_logo2Box.x && mx<=_logo2Box.x+_logo2Box.w && my>=_logo2Box.y && my<=_logo2Box.y+_logo2Box.h){
    _logo2Selected = true;
    logo2PushUndo();
    _logo2DragData = { sx:e.clientX, sy:e.clientY, ox:_logo2OffX, oy:_logo2OffY,
      scaleX:scaleX, scaleY:scaleY };
  } else {
    _logo2Selected = false;
  }
  drawLogo2BigCanvas(); // 選取狀態改變了，重畫一次讓框/把手顯示或消失
}

/* 雙logo（共播）模式的命中判斷，依序檢查：
   1. 目前選取中的那個logo有沒有點到縮放把手
   2. 點擊位置落在哪個logo的範圍內來切換選取——兩個重疊時，選最上層(_logo2TopSlot)的那個
   （交換位置/更換/移除這幾個動作現在是畫布下方的懸浮bar按鈕，不在畫布命中判斷裡） */
/* 記錄目前的位置/縮放/疊放順序狀態（在開始拖曳/縮放/對調/排序之前呼叫），
   最多存5步，超過就把最舊的丟掉。 */
function logo2PushUndo(){
  _logo2UndoStack.push({
    offX:_logo2OffX, offY:_logo2OffY, scale:_logo2Scale,
    offXB:_logo2OffXB, offYB:_logo2OffYB, scaleB:_logo2ScaleB,
    topSlot:_logo2TopSlot, ts:Date.now()
  });
  if(_logo2UndoStack.length > LOGO2_UNDO_MAX) _logo2UndoStack.shift();
}

function logo2PeekUndoTs(){
  return _logo2UndoStack.length ? _logo2UndoStack[_logo2UndoStack.length-1].ts : 0;
}

function logo2Undo(){
  var snap = _logo2UndoStack.pop();
  if(!snap) return;
  _logo2OffX=snap.offX; _logo2OffY=snap.offY; _logo2Scale=snap.scale;
  _logo2OffXB=snap.offXB; _logo2OffYB=snap.offYB; _logo2ScaleB=snap.scaleB;
  _logo2TopSlot=snap.topSlot;
  drawLogo2BigCanvas();
}

if(window.BNUndo){
  window.BNUndo.register({ peekTs: logo2PeekUndoTs, undo: logo2Undo });
}

function logo2CanvasMouseDownShared(mx, my, e, scaleX, scaleY){
  var HANDLE = logo2HandleSizeCanvasPx();
  function hitHandle(box){
    if(!box) return null;
    var corners = [
      { sx:-1, sy:-1, x:box.x,       y:box.y       },
      { sx: 1, sy:-1, x:box.x+box.w, y:box.y       },
      { sx:-1, sy: 1, x:box.x,       y:box.y+box.h },
      { sx: 1, sy: 1, x:box.x+box.w, y:box.y+box.h }
    ];
    for(var i=0;i<corners.length;i++){
      var c = corners[i];
      if(Math.abs(mx-c.x)<=HANDLE && Math.abs(my-c.y)<=HANDLE) return c;
    }
    return null;
  }
  function inBox(box){
    return box && mx>=box.x && mx<=box.x+box.w && my>=box.y && my<=box.y+box.h;
  }

  var ref = Math.min(_logo2BigCanvas.width, _logo2BigCanvas.height);

  // 兩個都選取（多選）時，優先檢查是不是要整組縮放／整組拖曳，
  // 跟1200商品/主持人畫布的多選互動同一套優先順序。
  if(_logo2Selected && _logo2SelectedB){
    var gb = logo2GroupBounds();
    if(gb){
      var gHit = hitHandle(gb);
      if(gHit){
        logo2PushUndo();
        _logo2GroupResizeData = {
          sx:e.clientX, sy:e.clientY, ref:ref, center:{x:gb.cx, y:gb.cy},
          startRadius: Math.hypot(mx-gb.cx, my-gb.cy) || 1,
          slots: [
            { slot:'A', offX:_logo2OffX, offY:_logo2OffY, scale:_logo2Scale },
            { slot:'B', offX:_logo2OffXB, offY:_logo2OffYB, scale:_logo2ScaleB }
          ]
        };
        return;
      }
      if(inBox(gb)){
        logo2PushUndo();
        _logo2GroupDragData = {
          sx:e.clientX, sy:e.clientY, scaleX:scaleX, scaleY:scaleY,
          slots: [
            { slot:'A', offX:_logo2OffX, offY:_logo2OffY },
            { slot:'B', offX:_logo2OffXB, offY:_logo2OffYB }
          ]
        };
        return;
      }
    }
  }

  if(_logo2Selected){
    var hitA = hitHandle(_logo2Box);
    if(hitA){
      logo2PushUndo();
      _logo2ResizeData = { sx:e.clientX, sy:e.clientY, sc:_logo2Scale, signX:hitA.sx, signY:hitA.sy, ref:ref };
      return;
    }
  }
  if(_logo2SelectedB){
    var hitB = hitHandle(_logo2BoxB);
    if(hitB){
      logo2PushUndo();
      _logo2ResizeDataB = { sx:e.clientX, sy:e.clientY, sc:_logo2ScaleB, signX:hitB.sx, signY:hitB.sy, ref:ref };
      return;
    }
  }

  var inA = inBox(_logo2Box), inB = inBox(_logo2BoxB);

  // 兩個都點得到（重疊）時，先選最上層的那個
  var pickSlot = null;
  if(inA && inB) pickSlot = _logo2TopSlot;
  else if(inA) pickSlot = 'A';
  else if(inB) pickSlot = 'B';

  var multiKey = e.shiftKey || e.ctrlKey || e.metaKey;

  if(pickSlot && multiKey){
    // 按著shift/ctrl/cmd點：切換該logo的選取狀態，保留另一個原本的選取狀態不動
    // （沒點到東西時，多選修飾鍵不做事，維持原本選取，比較符合直覺）
    if(pickSlot === 'A') _logo2Selected = !_logo2Selected;
    else _logo2SelectedB = !_logo2SelectedB;
    drawLogo2BigCanvas();
    return; // 這次mousedown只切換選取，不順便開始拖曳，避免手勢衝突
  }

  if(pickSlot === 'A'){
    _logo2Selected = true; _logo2SelectedB = false;
    logo2PushUndo();
    _logo2DragData = { sx:e.clientX, sy:e.clientY, ox:_logo2OffX, oy:_logo2OffY, scaleX:scaleX, scaleY:scaleY };
  } else if(pickSlot === 'B'){
    _logo2SelectedB = true; _logo2Selected = false;
    logo2PushUndo();
    _logo2DragDataB = { sx:e.clientX, sy:e.clientY, ox:_logo2OffXB, oy:_logo2OffYB, scaleX:scaleX, scaleY:scaleY };
  } else {
    _logo2Selected = false; _logo2SelectedB = false;
  }
  drawLogo2BigCanvas();
}

function logo2CanvasMouseMove(e){
  if(_logo2GroupDragData){
    var gd = _logo2GroupDragData;
    var dx = (e.clientX - gd.sx) * gd.scaleX, dy = (e.clientY - gd.sy) * gd.scaleY;
    gd.slots.forEach(function(s0){
      if(s0.slot === 'A'){ _logo2OffX = s0.offX + dx; _logo2OffY = s0.offY + dy; }
      else { _logo2OffXB = s0.offX + dx; _logo2OffYB = s0.offY + dy; }
    });
    drawLogo2BigCanvas();
    return;
  }
  if(_logo2GroupResizeData){
    var grd = _logo2GroupResizeData;
    var rect = _logo2BigCanvas.getBoundingClientRect();
    var scaleX = _logo2BigCanvas.width / rect.width, scaleY = _logo2BigCanvas.height / rect.height;
    var px = (e.clientX - rect.left) * scaleX, py = (e.clientY - rect.top) * scaleY;
    var newRadius = Math.hypot(px - grd.center.x, py - grd.center.y) || 1;
    var factor = Math.max(0.1, Math.min(8, newRadius / grd.startRadius));
    var W = _logo2BigCanvas.width, H = _logo2BigCanvas.height;
    grd.slots.forEach(function(s0){
      // 每個logo的位置(offX/offY)換算成畫布絕對座標下的框中心，繞著群組中心點等比例縮放，
      // 再換算回offX/offY——跟1200商品/主持人畫布的群組縮放公式對應。
      var centerX = W/2 + s0.offX, centerY = H/2 + s0.offY;
      var newCenterX = grd.center.x + (centerX - grd.center.x) * factor;
      var newCenterY = grd.center.y + (centerY - grd.center.y) * factor;
      var newOffX = newCenterX - W/2, newOffY = newCenterY - H/2;
      var newScale = Math.max(0.1, Math.min(10, s0.scale * factor));
      if(s0.slot === 'A'){ _logo2OffX = newOffX; _logo2OffY = newOffY; _logo2Scale = newScale; }
      else { _logo2OffXB = newOffX; _logo2OffYB = newOffY; _logo2ScaleB = newScale; }
    });
    drawLogo2BigCanvas();
    return;
  }
  if(_logo2DragData){
    var d = _logo2DragData;
    _logo2OffX = d.ox + (e.clientX - d.sx) * d.scaleX;
    _logo2OffY = d.oy + (e.clientY - d.sy) * d.scaleY;
    drawLogo2BigCanvas();
  } else if(_logo2ResizeData){
    var rd = _logo2ResizeData;
    var dx = e.clientX - rd.sx, dy = e.clientY - rd.sy;
    var delta = (dx*rd.signX + dy*rd.signY) / rd.ref;
    _logo2Scale = Math.max(0.1, rd.sc + delta);
    drawLogo2BigCanvas();
  } else if(_logo2DragDataB){
    var dB = _logo2DragDataB;
    _logo2OffXB = dB.ox + (e.clientX - dB.sx) * dB.scaleX;
    _logo2OffYB = dB.oy + (e.clientY - dB.sy) * dB.scaleY;
    drawLogo2BigCanvas();
  } else if(_logo2ResizeDataB){
    var rdB = _logo2ResizeDataB;
    var dxB = e.clientX - rdB.sx, dyB = e.clientY - rdB.sy;
    var deltaB = (dxB*rdB.signX + dyB*rdB.signY) / rdB.ref;
    _logo2ScaleB = Math.max(0.1, rdB.sc + deltaB);
    drawLogo2BigCanvas();
  }
}

/* 使用者在「Logo2 編輯」popup 裡選擇這個 Logo 在直播間FL的底色類型
   （二選一：白底＋橘框／吸Logo底色填滿），存進 S.flLogoBgMode，廣播給
   所有版位（05_fl.html 據此決定背景怎麼畫），並立刻更新這裡的示意圖，
   讓使用者馬上看到差異。 */
function setFlLogoColorMode(mode){
  S.flLogoBgMode = mode;
  if(mode === 'sampled'){
    S.flLogoSampledColor = _logo2SampledBgColor || '#ffffff';
  }
  if(typeof broadcast === 'function') broadcast();
  logo2UpdateFlPreview();
}

/* ── 直播間FL 示意圖 ──────────────────────────────────────────
   目的：讓使用者在「Logo2 編輯」popup 裡，確認/套用之前，就能看到這個
   logo2 之後出現在 05_直播間FL 版位（版型＝LOGO）時的實際樣子——固定
   白底、橘色邊框、膠囊造型（四角全圓，圓角＝高度的一半），跟
   layouts/05_fl.html 的 render()/drawLogoVariant() 用同一套規格算出來，
   兩邊一致，不用各自維護一份。

   只在「直播間FL 版型」下拉選單目前選的是「LOGO」時才顯示這塊示意圖──
   其他情況（例如從右側「編輯商品／主持人陰影」按鈕開這個 popup，
   或這個廠商的FL版型是「無」/「案型」）跟這個示意圖無關，顯示出來
   只會讓人誤會。 */
var FL_PREVIEW = {
  W: 336, H: 120,
  BORDER_W: 3,
  BORDER_COLOR: '#EE4D2D',
  BG_COLOR: '#FFFFFF'
};
/* 跟 layouts/05_fl.html 的 BG_BOX 完全對應（x:3,y:11,w:330,h:98），
   圓角＝高度一半＝膠囊造型；LOGO_ZONE 內縮 6px（比橘框 3px 粗一倍當緩衝），
   兩邊都用同一組數字，示意圖才會跟實際套用出來的結果一致。 */
FL_PREVIEW.BLOCK = { x:3, y:11, w:330, h:98 };
FL_PREVIEW.BLOCK.r = FL_PREVIEW.BLOCK.h / 2;
FL_PREVIEW.LOGO_ZONE = {
  x: FL_PREVIEW.BLOCK.x + 6,
  y: FL_PREVIEW.BLOCK.y + 6,
  w: FL_PREVIEW.BLOCK.w - 12,
  h: FL_PREVIEW.BLOCK.h - 12
};

function flPreviewRoundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x,     y + h, x,     y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x,     y,     x + r, y,         r);
  ctx.closePath();
}

/* 目前「直播間FL 版型」下拉選單選的是不是 LOGO */
function _flIsLogoStyle(){
  return S.flStyle === 'LOGO';
}

function logo2UpdateFlPreview(){
  var wrap = document.getElementById('logo2-fl-preview-wrap');
  var cv   = document.getElementById('logo2-fl-preview-canvas');
  if(!wrap || !cv) return;

  if(!_flIsLogoStyle()){
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';
  initFlPreviewDragOnce();
  syncFlLogoExtraScaleUI();

  /* 同步左側 radio 選項的勾選狀態（例如切分頁還原時，S.flLogoBgMode 可能已被還原成別的值） */
  var curMode = (S.flLogoBgMode === 'sampled') ? 'sampled' : 'white';
  var radios = document.getElementsByName('fl-logo-color-mode');
  for(var i=0;i<radios.length;i++){
    radios[i].checked = (radios[i].value === curMode);
  }

  var ctx = cv.getContext('2d');
  var b = FL_PREVIEW.BLOCK;
  ctx.clearRect(0, 0, FL_PREVIEW.W, FL_PREVIEW.H);

  if(curMode === 'white'){
    /* 白底膠囊色塊 + 橘框 */
    ctx.save();
    flPreviewRoundRect(ctx, b.x, b.y, b.w, b.h, b.r);
    ctx.fillStyle = FL_PREVIEW.BG_COLOR;
    ctx.fill();
    ctx.clip();
    drawFlPreviewLogo(ctx);
    ctx.restore();

    var bw2 = FL_PREVIEW.BORDER_W / 2;
    flPreviewRoundRect(ctx, b.x + bw2, b.y + bw2, b.w - FL_PREVIEW.BORDER_W, b.h - FL_PREVIEW.BORDER_W, b.r - bw2);
    ctx.strokeStyle = FL_PREVIEW.BORDER_COLOR;
    ctx.lineWidth   = FL_PREVIEW.BORDER_W;
    ctx.stroke();
  } else {
    /* 吸Logo底色填滿，不加框 */
    ctx.save();
    flPreviewRoundRect(ctx, b.x, b.y, b.w, b.h, b.r);
    ctx.fillStyle = S.flLogoSampledColor || FL_PREVIEW.BG_COLOR;
    ctx.fill();
    ctx.clip();
    drawFlPreviewLogo(ctx);
    ctx.restore();
  }
}

/* FL示意圖現在直接把「透明底的Logo2合成內容」(_logo2FlCleanCanvas，單張或雙logo
   共用範圍都已經包含在裡面，含雙logo的相對位置/大小/間距)整張等比例塞進
   FL_PREVIEW.LOGO_ZONE（跟 object-fit:contain 一樣），使用者能再調的只有
   「FL額外放大／位移」這組整體的縮放/位移——這樣不管單張還是雙logo，
   示意圖永遠跟Logo2編輯畫布長得一模一樣，不會再有兩邊換算對不起來的問題。
   跟 layouts/05_fl.html 的 drawLogoVariant() 對應（那邊用的是「確認並套用」時
   烤出來的同一張PNG：S.imgs.logo2Fl）。 */
function drawFlPreviewLogo(ctx){
  if(!_logo2FlCleanCanvas) return;
  var srcW = _logo2FlCleanCanvas.width, srcH = _logo2FlCleanCanvas.height;
  if(!srcW || !srcH) return;
  var z = FL_PREVIEW.LOGO_ZONE;
  var sclBase = Math.min(z.w / srcW, z.h / srcH);
  var scl = sclBase * (S.flLogoExtraScale || 1);
  var dw = srcW * scl, dh = srcH * scl;
  var dx = z.x + (z.w - dw) / 2 + (S.flLogoExtraOffX || 0) * z.w;
  var dy = z.y + (z.h - dh) / 2 + (S.flLogoExtraOffY || 0) * z.h;
  ctx.drawImage(_logo2FlCleanCanvas, 0, 0, srcW, srcH, dx, dy, dw, dh);
}

/* ── FL 額外放大／拖曳位移 ──────────────────────────────────
   Logo2編輯畫布(workDim)跟FL色塊的長寬比不一樣，光靠 logo2Scale/OffX/OffY
   這組數字，Logo有時候怎麼調都填不滿FL；這裡另外開一組「只影響FL示意圖」的
   縮放/位移，兩組分開存、分開套用，讓使用者可以直接在FL示意圖上調到滿意為止。 */
function setFlLogoExtraScale(val){
  S.flLogoExtraScale = parseFloat(val) || 1;
  syncFlLogoExtraScaleUI();
  logo2UpdateFlPreview();
  if(typeof broadcast === 'function') broadcast();
}

function resetFlLogoExtra(){
  S.flLogoExtraScale = 1;
  S.flLogoExtraOffX = 0;
  S.flLogoExtraOffY = 0;
  syncFlLogoExtraScaleUI();
  logo2UpdateFlPreview();
  if(typeof broadcast === 'function') broadcast();
}

function syncFlLogoExtraScaleUI(){
  var slider = document.getElementById('fl-logo-extra-scale');
  var label  = document.getElementById('fl-logo-extra-scale-label');
  var val = S.flLogoExtraScale || 1;
  if(slider) slider.value = val;
  if(label)  label.textContent = val.toFixed(2) + 'x';
}

/* 直接在FL示意圖畫布上拖曳調整位置（只綁一次事件，避免每次 render 重複綁定） */
var _flPreviewDrag = null;
function initFlPreviewDragOnce(){
  var cv = document.getElementById('logo2-fl-preview-canvas');
  if(!cv || cv._flDragBound) return;
  cv._flDragBound = true;
  cv.addEventListener('mousedown', function(e){
    if(!_logo2Img) return;
    _flPreviewDrag = { sx:e.clientX, sy:e.clientY, ox:S.flLogoExtraOffX||0, oy:S.flLogoExtraOffY||0 };
    cv.style.cursor = 'grabbing';
    e.preventDefault();
  });
  document.addEventListener('mousemove', function(e){
    if(!_flPreviewDrag) return;
    var rect = cv.getBoundingClientRect();
    var scaleX = cv.width / rect.width, scaleY = cv.height / rect.height;
    var dxCanvas = (e.clientX - _flPreviewDrag.sx) * scaleX;
    var dyCanvas = (e.clientY - _flPreviewDrag.sy) * scaleY;
    var z = FL_PREVIEW.LOGO_ZONE;
    S.flLogoExtraOffX = _flPreviewDrag.ox + dxCanvas / z.w;
    S.flLogoExtraOffY = _flPreviewDrag.oy + dyCanvas / z.h;
    logo2UpdateFlPreview();
  });
  document.addEventListener('mouseup', function(){
    if(_flPreviewDrag){
      _flPreviewDrag = null;
      cv.style.cursor = 'grab';
      if(typeof broadcast === 'function') broadcast();
    }
  });
}

/* ── 逐包確認流程 ──────────────────────────────────────────
   匯入工單後，每個廠商分頁各自的Logo2／商品陰影都需要人工確認一次；
   確認完一包，自動存檔＋切到下一包（同一個彈窗接著開，不用每包都手動
   關掉重開），全部確認完才真正結束。只有匯入流程會啟動這個模式；
   從側欄「編輯 Logo2」／「編輯商品／主持人陰影」按鈕手動開這個彈窗，
   只是單純套用當下這一頁，不會跳到下一頁（見 confirmLogo2AndShadow()）。 */
var _reviewActive = false;

/* 哪些分頁需要逐包確認：有商品組合(combo)或有比對到廠商Logo(logo2Raw)
   才需要，純文字、完全沒素材的分頁在匯入當下就已經直接帶入文字欄位，
   不需要另外跳出來人工確認，逐包確認清單會自動略過。 */
function _reviewTabIndices(){
  var arr = [];
  TABS.forEach(function(t, i){
    if(t.data && (t.data.combo || t.data.logo2Raw)) arr.push(i);
  });
  return arr;
}

/* 匯入工單後的總入口：找出需要確認的分頁，從第一包開始逐一跳出彈窗。
   沒有任何分頁需要確認就靜靜結束（純文案／不製作的工單，這是正常情況，
   不用跳錯誤toast）。 */
function startReviewFlow(){
  var idxs = _reviewTabIndices();
  if(!idxs.length) return;
  _reviewActive = true;
  if(ACTIVE_TAB === idxs[0]){
    _openReviewPanelForCurrentTab();
  } else {
    /* switchTab() 內部 saveCurrentTabState 存完才會呼叫 applyTabData，
       一定要等它真的切換完（applyTabData 跑完、S 已經是新分頁的狀態）
       才能開彈窗，不然 openLogo2Popup() 會在切換完成前就先讀到「舊分頁」
       的 S.logo2Raw，變成「畫面顯示新分頁，但Logo圖片卻停在上一包」。 */
    switchTab(idxs[0], _openReviewPanelForCurrentTab);
  }
}

function _openReviewPanelForCurrentTab(){
  openLogo2Popup();
  _updateReviewProgressUI();
}

/* 進度列／確認按鈕文字：逐包確認模式下顯示「廠商確認 (目前/總共)」，
   最後一包按鈕顯示「完成最後一包」，其餘顯示「下一包」；不是逐包確認
   模式（手動開彈窗）維持原本「確認並套用」，不顯示進度列。 */
function _updateReviewProgressUI(){
  var wrap = document.getElementById('logo2-review-progress-wrap');
  var text = document.getElementById('logo2-review-progress-text');
  var fill = document.getElementById('logo2-review-progress-fill');
  var btn  = document.getElementById('logo2-shadow-confirm-btn');
  var prevBtn = document.getElementById('logo2-review-prev-btn');
  if(!_reviewActive){
    if(wrap) wrap.style.display = 'none';
    if(btn) btn.textContent = '確認並套用';
    if(prevBtn) prevBtn.style.display = 'none';
    return;
  }
  var idxs = _reviewTabIndices();
  var pos = idxs.indexOf(ACTIVE_TAB) + 1;
  if(wrap) wrap.style.display = '';
  if(text) text.textContent = '廠商確認 (' + pos + '/' + idxs.length + ')';
  if(fill) fill.style.width = Math.round(pos / idxs.length * 100) + '%';
  if(btn) btn.textContent = (pos < idxs.length) ? '下一包' : '完成最後一包';
  if(prevBtn){
    prevBtn.style.display = '';
    prevBtn.disabled = (pos <= 1); // 第一包沒有上一包可以回
  }
}

/* 逐包確認模式下，回到上一包廠商重新看/調整——跟「下一包」共用同一套
   switchTab()+_openReviewPanelForCurrentTab()邏輯，差別只在idxs的index方向。
   回去之後如果重新調整、重新確認，composeShadow()那邊 tab.data._hostPositioned
   早就是true了（這包本來就confirm過），會走keepPos=true那條路，不會把
   使用者原本調好的位置蓋掉，這點跟往前推進是一致的，不會有額外風險。 */
function goToPreviousReviewTab(){
  if(!_reviewActive) return;
  var idxs = _reviewTabIndices();
  var pos = idxs.indexOf(ACTIVE_TAB);
  var prevIdx = idxs[pos - 1];
  if(prevIdx === undefined) return;
  pm.show('切換中');
  pm.update(50, '回到上一包廠商…');
  saveCurrentTabState(function(){
    switchTab(prevIdx, function(){
      _openReviewPanelForCurrentTab();
      pm.done('已切換');
      pm.hide();
    });
  });
}

/* ── 開啟面板：有存過的原始素材就還原上次編輯狀態 ──
   popup-logo2 現在是 Logo2＋商品／主持人陰影 合併後的單一彈窗，只有一顆
   「確認並套用」按鈕（見 confirmLogo2AndShadow()），不再分兩步驟，
   所以這裡不用再處理 chainToShadow／下一步跳轉的邏輯。傳入的參數（若有）
   直接忽略，保留參數位置只是為了不用去改呼叫端（editor-import.js 仍會傳 true）。 */
function openLogo2Popup(){
  document.getElementById('popup-logo2').classList.add('open');
  initLogo2BigCanvasOnce();
  /* popup-logo2 現在是 Logo2＋商品／主持人陰影合併後的單一彈窗，1200畫布
     (shadow-compose-canvas) 也在同一個彈窗裡，但它的初始化/狀態同步函式
     定義在 editor-shadow-canvas.js，開彈窗時要主動呼叫，不然：
     _shadowBigCtx/_shadowBigReceiver 永遠是 null → 畫布一直是空的、
     滑鼠事件也沒綁定（不能拖曳/縮放），且 ShadowEditor.onStateChange 的
     監聽器也是在 initShadowBigCanvasOnce() 裡面才註冊，沒呼叫的話左側
     素材清單選的商品/主持人也不會同步畫到這個1200畫布上。 */
  if(typeof initShadowBigCanvasOnce === 'function') initShadowBigCanvasOnce();
  /* popup 從 display:none 打開的那一刻，容器寬度才量得到，所以開窗當下要重新量一次，
     不能只靠 initShadowBigCanvasOnce() 裡那次（那次多半量到 0，因為彈窗還沒顯示） */
  if(typeof sizeShadowBigCanvasBox === 'function') sizeShadowBigCanvasBox();
  if(typeof syncShadowBigCanvasFromState === 'function') syncShadowBigCanvasFromState(); // 開啟當下就把目前狀態畫上去（例如匯入工單已經比對好的素材）
  logo2UpdateFlPreview();
  _updateReviewProgressUI();
  if(S.logo2Raw || S.logo2RawB){
    _logo2Scale = S.logo2Scale!==undefined ? S.logo2Scale : 1;
    _logo2OffX  = S.logo2OffX!==undefined  ? S.logo2OffX  : 0;
    _logo2OffY  = S.logo2OffY!==undefined  ? S.logo2OffY  : 0;
    _logo2ScaleB = S.logo2ScaleB!==undefined ? S.logo2ScaleB : 1;
    _logo2OffXB  = S.logo2OffXB!==undefined  ? S.logo2OffXB  : 0;
    _logo2OffYB  = S.logo2OffYB!==undefined  ? S.logo2OffYB  : 0;
    _logo2TopSlot = S.logo2TopSlot || 'B';
    _logo2Shape = S.logo2Shape || 'wide'; // 雙logo模式下存的就是'double'，單張模式先給個預設，等圖片載入完成再視情況覆蓋

    var pending = 0;
    function afterLogo2Loaded(){
      if(--pending > 0) return;
      _logo2Selected = false; _logo2SelectedB = false;
      logo2ResizeCanvasToShape();
      drawLogo2BigCanvas();
      logo2SyncDoubleControlsUI();
    }

    if(S.logo2Raw){
      pending++;
      var im = new Image();
      im.onload = function(){
        _logo2Img = im;
        _logo2RawSrc = S.logo2Raw;
        _logo2Bounds = logo2CalcTightBounds(im);
        if(_logo2Shape !== 'double') _logo2Shape = S.logo2Shape || logo2DetectShape(_logo2Bounds.w, _logo2Bounds.h);
        _logo2BgColor = logo2SampleBgColor(im);
        _logo2SampledBgColor = logo2SampleAssetBgColor(im);
        /* 還原舊分頁時，如果FL底色模式是「以Logo底色填滿」，用這張還原出來的Logo
           重新吸一次色──理論上跟上次存的S.flLogoSampledColor會一樣，這裡只是保險，
           避免存檔格式演進過程中有漏存的舊資料。 */
        if(S.flLogoBgMode === 'sampled' && S.flLogoSampledColor !== _logo2SampledBgColor){
          S.flLogoSampledColor = _logo2SampledBgColor;
          if(typeof broadcast === 'function') broadcast();
        }
        afterLogo2Loaded();
      };
      im.src = S.logo2Raw;
    } else {
      _logo2Img = null; _logo2Bounds = null; _logo2RawSrc = null;
    }

    if(_logo2Shape === 'double' && S.logo2RawB){
      pending++;
      var imB = new Image();
      imB.onload = function(){
        _logo2ImgB = imB;
        _logo2RawSrcB = S.logo2RawB;
        _logo2BoundsB = logo2CalcTightBounds(imB);
        afterLogo2Loaded();
      };
      imB.src = S.logo2RawB;
    } else {
      _logo2ImgB = null; _logo2BoundsB = null; _logo2RawSrcB = null;
    }

    if(pending === 0) afterLogo2Loaded(); // 保險：理論上S.logo2Raw/S.logo2RawB至少有一個才會走進這個分支
  } else if(_logo2Img || _logo2ImgB){
    logo2ResizeCanvasToShape();
    drawLogo2BigCanvas();
    logo2SyncDoubleControlsUI();
  } else {
    logo2UpdateHint();
    logo2SyncDoubleControlsUI();
  }
}

/* ── 合成 Logo2：把畫布上目前的狀態合成一張 PNG，套進 S.imgs.logo2，
   存原始素材供之後重新編輯。沒有上傳 logo2 素材就直接跳過（cb(true)），
   不會擋住下面陰影那半邊的確認流程——不是每個廠商都一定有 logo2。
   這是 popup-logo2 底部唯一的「確認並套用」按鈕流程的第一步，
   由 editor-shadow-canvas.js 的 confirmLogo2AndShadow() 呼叫，
   confirmLogo2AndShadow() 會等這裡的 cb() 被呼叫（代表 S.imgs.logo2
   真的寫入完成）之後，才接著處理陰影那一半，避免非同步寫入順序跟畫面顯示對不上。 ── */
function composeLogo2(cb){
  if(!_logo2Img && !_logo2ImgB){
    S.imgs.logo2Fl = null; // 沒有任何logo了，FL專用的透明合成圖也要清掉
    if(cb) cb(true);
    return;
  }

  /* 合成前強制取消選取，避免使用者忘記點空白處取消選取時，
     選取框／控點被一起合成進最終圖片、廣播到各版位 */
  _logo2Selected = false; _logo2SelectedB = false;
  drawLogo2BigCanvas(); // 確保畫布是最新狀態（已無選取框），連帶也刷新了 _logo2FlCleanCanvas

  // 先把「原圖＋當下數值」存起來，供之後「編輯 Logo2」重新叫出面板還原用
  // （務必存原圖，不能存合成後的圖——合成後的死圖沒辦法反推回原本怎麼縮放/擺放）
  S.logo2Raw   = _logo2RawSrc;
  S.logo2Scale = _logo2Scale;
  S.logo2OffX  = _logo2OffX;
  S.logo2OffY  = _logo2OffY;
  S.logo2Shape = _logo2Shape;

  /* 雙logo（共播）模式才存B格；切回單張模式時要清乾淨，
     不然殘留的舊B格資料會在下次重開面板時被誤判成「還是雙logo」 */
  if(_logo2Shape === 'double'){
    S.logo2RawB   = _logo2RawSrcB || null;
    S.logo2ScaleB = _logo2ScaleB;
    S.logo2OffXB  = _logo2OffXB;
    S.logo2OffYB  = _logo2OffYB;
    S.logo2TopSlot = _logo2TopSlot; // 誰疊在上面，05_fl.html畫版位時要用同一個順序
  } else {
    S.logo2RawB = null; S.logo2ScaleB = 1; S.logo2OffXB = 0; S.logo2OffYB = 0;
    S.logo2TopSlot = 'B';
  }

  _logo2BigCanvas.toBlob(function(blob){
    if(!blob){ toast('Logo2 合成失敗','err'); if(cb) cb(false); return; }
    var file = new File([blob], 'logo2-composite.png', { type:'image/png' });
    applyImageFile(file, 'logo2', function(){
      // 沿用既有 logo2 管線：S.imgs.logo2（白底小卡，給thumbnail/opening用）+ 廣播給所有版位
      logo2ComposeFlVariant(function(){ if(cb) cb(true); });
    });
  }, 'image/png');
}

/* 另外烤一份「透明底、只有logo本身」的合成圖，專門給直播間FL的LOGO版型用——
   FL版位自己會畫白底＋橘框或吸色底，這份圖只需要疊上logo本身（含雙logo的
   相對位置/大小/間距），才不會把FL自己選的底色蓋掉。跟上面 S.imgs.logo2
   （白底小卡，給thumbnail/opening用）是兩份獨立的圖，各自對應不同用途。 */
function logo2ComposeFlVariant(cb){
  logo2RenderFlCleanCanvas(); // 確保是最新狀態
  if(!_logo2FlCleanCanvas){ if(cb) cb(); return; }
  _logo2FlCleanCanvas.toBlob(function(blob){
    if(!blob){ if(cb) cb(); return; }
    var reader = new FileReader();
    reader.onload = function(ev){
      S.imgs.logo2Fl = ev.target.result;
      if(typeof broadcastFull === 'function') broadcastFull(); // logo2Fl 這組要含圖片，跟 applyImageFile 一樣走 broadcastFull
      if(cb) cb();
    };
    reader.readAsDataURL(blob);
  }, 'image/png');
}
