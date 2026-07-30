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
  square: { w: 735,  h: 810 }
};
var LOGO2_RADIUS_PX = 12; // 固定圓角（在工作畫布尺度下），全域只有這一個數字

var _logo2BigCanvas = null, _logo2BigCtx = null, _logo2BigInited = false;
var _logo2Img = null, _logo2Bounds = null, _logo2BgColor = '#ffffff';
var _logo2SampledBgColor = '#ffffff'; // Logo素材本身的底色（FL「以Logo底色填滿」模式用）
var _logo2RawSrc = null;   // 使用者上傳的原圖（未合成），用來存 S.logo2Raw / 重新編輯還原
var _logo2Shape = 'wide';
var _logo2Scale = 1, _logo2OffX = 0, _logo2OffY = 0;
var _logo2Box = null;      // 目前渲染範圍（給滑鼠命中判斷用）
var _logo2Selected = false;
var _logo2DragData = null, _logo2ResizeData = null;
var _logo2ChainToShadow = false; // 這次開面板是不是從匯入流程來的，決定按確認後要不要自動跳陰影面板

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
/* 原本這裡固定回傳白色，是因為舊版做法（整張圖找「最常見的顏色」）遇到黑字
   Logo時，黑色文字常常變成最常見的顏色，吸出來的底色也是黑的，字就跟底色
   融在一起看不見了。現在改成呼叫 logo2SampleAssetBgColor()（只取四個角落＋
   四邊中點共8個點，不是整張圖的顏色統計），黑字通常在正中央、不會佔到這幾個
   取樣點，同樣的問題不會重演，所以這裡不用再固定回傳白色，兩個函式統一共用
   同一套邏輯即可。 */
function logo2SampleBgColor(im){
  return logo2SampleAssetBgColor(im);
}

/* 給FL「以Logo底色填滿」模式專用──真的去吸Logo素材本身的底色，
   跟上面那支 logo2SampleBgColor()（故意固定回傳白色，給小卡本身的白底用）
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

  _logo2BigCanvas.addEventListener('mousedown', logo2CanvasMouseDown);
  document.addEventListener('mousemove', logo2CanvasMouseMove);
  document.addEventListener('mouseup', function(){ _logo2DragData = null; _logo2ResizeData = null; });

  document.addEventListener('keydown', function(e){
    if(!_logo2Selected || !_logo2Img) return;
    var tag = (e.target && e.target.tagName) || '';
    if(tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
    var step = e.shiftKey ? 10 : 1;
    var moved = true;
    if(e.key === 'ArrowLeft')       _logo2OffX -= step;
    else if(e.key === 'ArrowRight') _logo2OffX += step;
    else if(e.key === 'ArrowUp')    _logo2OffY -= step;
    else if(e.key === 'ArrowDown')  _logo2OffY += step;
    else moved = false;
    if(moved){ e.preventDefault(); drawLogo2BigCanvas(); }
  });

  _logo2BigInited = true;
}

/* ── 載入素材（使用者手動上傳新圖時呼叫，會重設縮放位移） ── */

function logo2LoadImageFromSrc(src){
  var im = new Image();
  im.onload = function(){
    _logo2Img = im;
    _logo2RawSrc = src;
    _logo2Bounds = logo2CalcTightBounds(im);
    _logo2Shape = logo2DetectShape(_logo2Bounds.w, _logo2Bounds.h);
    _logo2BgColor = logo2SampleBgColor(im);
    _logo2SampledBgColor = logo2SampleAssetBgColor(im);
    /* 如果目前FL底色模式已經是「以Logo底色填滿」，換一張新Logo時要立刻
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

function logo2ResizeCanvasToShape(){
  if(!_logo2BigCanvas) return;
  var dim = LOGO2_WORK_DIM[_logo2Shape] || LOGO2_WORK_DIM.wide;
  _logo2BigCanvas.width = dim.w;
  _logo2BigCanvas.height = dim.h;
  _logo2BigCanvas.style.aspectRatio = dim.w + '/' + dim.h;
}

/* ── 繪製 ── */

function drawLogo2BigCanvas(){
  if(!_logo2BigCtx || !_logo2BigCanvas) return;
  var W = _logo2BigCanvas.width, H = _logo2BigCanvas.height;
  _logo2BigCtx.clearRect(0,0,W,H);

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
  if(!_logo2Img){ el.textContent = '請先上傳 logo2 素材'; return; }
  el.textContent = '點選素材可 拖曳移動 / 放大縮小';
}

/* ── 滑鼠互動：拖曳移動／拖角縮放（邏輯搬自 layout-logo2.js） ── */

function logo2CanvasMouseDown(e){
  if(!_logo2Img || !_logo2Box) return;
  var rect = _logo2BigCanvas.getBoundingClientRect();
  var scaleX = _logo2BigCanvas.width / rect.width;
  var scaleY = _logo2BigCanvas.height / rect.height;
  var mx = (e.clientX - rect.left) * scaleX;
  var my = (e.clientY - rect.top) * scaleY;

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
        _logo2ResizeData = { sx:e.clientX, sy:e.clientY, sc:_logo2Scale, signX:c.sx, signY:c.sy,
          ref: Math.min(_logo2BigCanvas.width, _logo2BigCanvas.height) };
        return;
      }
    }
  }

  if(mx>=_logo2Box.x && mx<=_logo2Box.x+_logo2Box.w && my>=_logo2Box.y && my<=_logo2Box.y+_logo2Box.h){
    _logo2Selected = true;
    _logo2DragData = { sx:e.clientX, sy:e.clientY, ox:_logo2OffX, oy:_logo2OffY,
      scaleX:scaleX, scaleY:scaleY };
  } else {
    _logo2Selected = false;
  }
  drawLogo2BigCanvas(); // 選取狀態改變了，重畫一次讓框/把手顯示或消失
}

function logo2CanvasMouseMove(e){
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
  }
}

/* 使用者在「Logo2 編輯」popup 裡選擇這個 Logo 的底色類型（二選一：白底＋橘框／
   本身已有顏色／吸Logo底色填滿），存進 S.flLogoBgMode，廣播給所有版位
   （03_fl.html 據此決定背景怎麼畫），並立刻更新這裡的示意圖，讓使用者馬上看到差異。 */
function setFlLogoColorMode(mode){
  S.flLogoBgMode = mode;
  if(mode === 'sampled'){
    S.flLogoSampledColor = _logo2SampledBgColor || '#ffffff';
  }
  if(typeof broadcast === 'function') broadcast();
  logo2UpdateFlPreview();
}

/* ── FL 示意圖 ──────────────────────────────────────────────
   目的：讓使用者在「Logo2 編輯」popup 裡，確認/套用之前，就能看到這個 logo2
   之後出現在 03_直播間FL 版位（純Logo版型＝版型L）時的實際樣子——固定白底、
   橘色邊框、膠囊造型（四角全圓，圓角＝高度的一半），跟 03_fl.html 的
   render()/drawVariantL() 用同一套規格算出來，兩邊long一致，不用各自維護一份。

   只在「直播間FL文案」欄位目前填的是 LOGO 時才顯示這塊示意圖──其他情況
   （例如從「編輯 Logo2」按鈕開這個 popup 是為了調整 02 版位用的 logo2）
   跟這個示意圖無關，顯示出來只會讓人誤會。 */
var FL_PREVIEW = {
  W: 336, H: 120,
  BORDER_W: 3,
  BORDER_COLOR: '#EE4D2D',
  BG_COLOR: '#FFFFFF'
};
FL_PREVIEW.BLOCK = { x:6, y:6, w:FL_PREVIEW.W-12, h:FL_PREVIEW.H-12 };
FL_PREVIEW.BLOCK.r = FL_PREVIEW.BLOCK.h / 2; // 膠囊造型：圓角 = 高度一半
FL_PREVIEW.LOGO_ZONE = {
  x: FL_PREVIEW.BLOCK.x + 12,
  y: FL_PREVIEW.BLOCK.y + 12,
  w: FL_PREVIEW.BLOCK.w - 24,
  h: FL_PREVIEW.BLOCK.h - 24
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

/* 目前是不是LOGO模式：下拉選單選「LOGO」，或 txt-fl 文字打「logo」，兩種都算
   （雙重保險，跟 editor-utils.js 的 ccFl() 用同一套判斷方式，不分大小寫、去頭尾空白） */
function _flTextIsLogo(){
  var slot = (document.getElementById('fl-product-slot') || {}).value || '';
  if(slot === 'logo') return true;
  var raw = (document.getElementById('txt-fl') || {}).value || '';
  return raw.trim().toLowerCase() === 'logo';
}

function logo2UpdateFlPreview(){
  var wrap = document.getElementById('logo2-fl-preview-wrap');
  var cv   = document.getElementById('logo2-fl-preview-canvas');
  if(!wrap || !cv) return;

  if(!_flTextIsLogo()){
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';
  initFlPreviewDragOnce();
  syncFlLogoExtraScaleUI();

  /* 同步左側 radio 選項的勾選狀態（例如切分頁還原時，S.flLogoBgMode 可能已被還原成別的值） */
  var curMode = (S.flLogoBgMode === 'white') ? 'white' : 'sampled';
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

/* 跟正式版位 03_fl.html 的 drawVariantL() 逐行對應同一套公式（原圖有色範圍＋
   Logo2畫布本身的縮放位移＋這裡新增的FL額外縮放位移），示意圖才會跟實際套用
   出來的結果一致，不會「示意圖看起來OK，套用到版位卻對不起來」。 */
function drawFlPreviewLogo(ctx){
  if(!_logo2Img || !_logo2Bounds) return;
  var z = FL_PREVIEW.LOGO_ZONE;
  var b = _logo2Bounds;
  var workDim = LOGO2_WORK_DIM[_logo2Shape] || LOGO2_WORK_DIM.wide;

  var sclBase = Math.min(z.w / b.w, z.h / b.h);
  var scl = sclBase * (_logo2Scale || 1) * (S.flLogoExtraScale || 1);
  var dw = b.w * scl, dh = b.h * scl;
  var offXRatio = (_logo2OffX || 0) / workDim.w;
  var offYRatio = (_logo2OffY || 0) / workDim.h;
  var dx = z.x + (z.w - dw) / 2 + offXRatio * z.w + (S.flLogoExtraOffX || 0) * z.w;
  var dy = z.y + (z.h - dh) / 2 + offYRatio * z.h + (S.flLogoExtraOffY || 0) * z.h;
  ctx.drawImage(_logo2Img, b.x, b.y, b.w, b.h, dx, dy, dw, dh);
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
  /* 滾輪縮放：跟旁邊「FL 額外放大」滑桿（fl-logo-extra-scale，min=1 max=3 step=0.05）
     共用同一個 setFlLogoExtraScale()，滾輪只是另一種輸入方式，數值/上下限完全一致，
     不用另外維護一套縮放邏輯。往上滾放大、往下滾縮小，跟大部分繪圖軟體手感一致。 */
  cv.addEventListener('wheel', function(e){
    e.preventDefault();
    var slider = document.getElementById('fl-logo-extra-scale');
    var min = slider ? parseFloat(slider.min) : 1;
    var max = slider ? parseFloat(slider.max) : 3;
    var step = slider ? parseFloat(slider.step) || 0.05 : 0.05;
    var cur = S.flLogoExtraScale || 1;
    var next = cur + (e.deltaY < 0 ? step : -step);
    next = Math.max(min, Math.min(max, next));
    setFlLogoExtraScale(next);
  }, { passive:false });
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

/* ── 開啟面板：有存過的原始素材就還原上次編輯狀態 ──
   chainToShadow=true：這次是匯入流程自動開啟的，按鈕按下去要接著跳陰影面板；
   不傳（undefined/false）：從右側「編輯 Logo2」按鈕手動開啟，按鈕按下去只單純套用，不跳轉。 */
function openLogo2Popup(chainToShadow){
  _logo2ChainToShadow = !!chainToShadow;
  document.getElementById('popup-logo2').classList.add('open');
  initLogo2BigCanvasOnce();
  logo2UpdateNextBtnLabel();
  logo2UpdateFlPreview();
  if(S.logo2Raw){
    _logo2Scale = S.logo2Scale!==undefined ? S.logo2Scale : 1;
    _logo2OffX  = S.logo2OffX!==undefined  ? S.logo2OffX  : 0;
    _logo2OffY  = S.logo2OffY!==undefined  ? S.logo2OffY  : 0;
    var im = new Image();
    im.onload = function(){
      _logo2Img = im;
      _logo2RawSrc = S.logo2Raw;
      _logo2Bounds = logo2CalcTightBounds(im);
      _logo2Shape = S.logo2Shape || logo2DetectShape(_logo2Bounds.w, _logo2Bounds.h);
      _logo2BgColor = logo2SampleBgColor(im);
      _logo2SampledBgColor = logo2SampleAssetBgColor(im);
      if(S.flLogoBgMode === 'sampled' && S.flLogoSampledColor !== _logo2SampledBgColor){
        S.flLogoSampledColor = _logo2SampledBgColor;
        if(typeof broadcast === 'function') broadcast();
      }
      _logo2Selected = false;
      logo2ResizeCanvasToShape();
      drawLogo2BigCanvas();
    };
    im.src = S.logo2Raw;
  } else if(_logo2Img){
    logo2ResizeCanvasToShape();
    drawLogo2BigCanvas();
  } else {
    logo2UpdateHint();
  }
}

function logo2UpdateNextBtnLabel(){
  var btn = document.getElementById('logo2-compose-next-btn');
  var skipBtn = document.getElementById('logo2-compose-skip-btn');
  if(btn) btn.textContent = _logo2ChainToShadow ? '下一步：調整陰影' : '確認並套用';
  if(skipBtn) skipBtn.style.display = _logo2ChainToShadow ? '' : 'none'; // 不是匯入流程就不需要「跳過」
}

/* 沒有 logo2 素材要處理時，跳過這步直接進陰影面板，不用被強制要求上傳
   （只有匯入流程會顯示這顆按鈕，見 logo2UpdateNextBtnLabel） */
function skipLogo2AndNext(){
  closePopup('logo2');
  openShadowPopup();
}

/* ── 下一步／確認：合成成一張 PNG，套進 S.imgs.logo2，存原始素材供之後重新編輯。
   只有從匯入流程進來的（_logo2ChainToShadow===true）才會接著自動開啟陰影面板；
   從右側「編輯 Logo2」按鈕進來的，套用完就結束，不會跳轉。 ── */

function composeLogo2AndNext(){
  if(!_logo2Img){ toast('請先上傳 logo2 素材','err'); return; }

  /* 匯出前強制取消選取，避免使用者忘記點空白處取消選取時，
     選取框／控點被一起合成進最終圖片、廣播到各版位 */
  _logo2Selected = false;
  drawLogo2BigCanvas(); // 確保畫布是最新狀態（已無選取框）

  // 先把「原圖＋當下數值」存起來，供之後「編輯 Logo2」重新叫出面板還原用
  // （務必存原圖，不能存合成後的圖——合成後的死圖沒辦法反推回原本怎麼縮放/擺放）
  S.logo2Raw   = _logo2RawSrc;
  S.logo2Scale = _logo2Scale;
  S.logo2OffX  = _logo2OffX;
  S.logo2OffY  = _logo2OffY;
  S.logo2Shape = _logo2Shape;

  _logo2BigCanvas.toBlob(function(blob){
    if(!blob){ toast('Logo2 合成失敗','err'); return; }
    var file = new File([blob], 'logo2-composite.png', { type:'image/png' });
    applyImageFile(file, 'logo2'); // 沿用既有 logo2 管線：S.imgs.logo2 + 廣播給所有版位
    closePopup('logo2');
    if(_logo2ChainToShadow){
      toast('Logo2 已套用到所有版位，接著調整陰影','ok',3000);
      openShadowPopup(); // 只有匯入流程進來的才自動跳到下一步：陰影面板
    } else {
      toast('Logo2 已套用到所有版位','ok',3000);
    }
  }, 'image/png');
}
