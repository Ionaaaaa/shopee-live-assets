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
  /* 跟 openLogo2Popup() 同樣的道理：讀圖是非同步的，這裡沒有 S.logo2Raw
     可以拿來當身分證（這個函式被呼叫當下 S.logo2Raw 還是舊值，新圖要等
     使用者按「下一步／確認」才會真的寫進 S.logo2Raw），改記住當下是哪一個
     分頁物件，讀完圖時如果分頁已經換了就不套用，避免蓋掉新分頁的狀態。 */
  var _openedTab = (typeof TABS !== 'undefined' && typeof ACTIVE_TAB !== 'undefined') ? TABS[ACTIVE_TAB] : null;
  im.onload = function(){
    if(_openedTab && TABS[ACTIVE_TAB] !== _openedTab) return; // 分頁已經換過了，這次上傳結果不套用到現在的分頁
    _logo2Img = im;
    _logo2RawSrc = src;
    _logo2Bounds = logo2CalcTightBounds(im);
    _logo2Shape = logo2DetectShape(_logo2Bounds.w, _logo2Bounds.h);
    _logo2BgColor = logo2SampleBgColor(im);
    _logo2SampledBgColor = logo2SampleAssetBgColor(im);
    /* A級專場方形FL ICON：背景色固定自動吸取Logo素材本身最多的顏色，
       不用像B級橫式FL那樣手動點選「白底」或「以Logo底色填滿」——
       每次換Logo都强制套用最新吸出來的顏色。B級／舊格式維持原本行為：
       只有使用者已經手動選過「以Logo底色填滿」時才會跟著換色。 */
    if(_currentTabLevel() === 'A'){
      S.flLogoBgMode = 'sampled';
      S.flLogoSampledColor = _logo2SampledBgColor;
    } else if(S.flLogoBgMode === 'sampled'){
      S.flLogoSampledColor = _logo2SampledBgColor;
    }
    _logo2Scale = 1; _logo2OffX = 0; _logo2OffY = 0; _logo2Selected = false;
    S.flLogoExtraScale = 1; S.flLogoExtraOffX = 0; S.flLogoExtraOffY = 0;
    logo2ResizeCanvasToShape();
    drawLogo2BigCanvas();
    if(typeof broadcast === 'function') broadcast();
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

/* A級專場方形FL ICON（04_fl_a1.html）的示意圖規格：跟上面FL_PREVIEW（03_fl
   橫式膠囊）是完全獨立的兩組設定，只有A級分頁才會切換用這一組。
   座標直接對應 layouts/04_fl_a1.html 的 CIRCLE／LOGOBAR_LOGO_ZONE，數字
   要跟著那邊一起改——不加橘框（這個版位沒有邊框設計），圓形底一樣是
   白底／吸色兩種，邏輯跟直播間FL共用同一組 S.flLogoBgMode。 */
var FL_PREVIEW_A1 = {
  W: 360, H: 360,
  BG_COLOR: '#FFFFFF'
};
FL_PREVIEW_A1.CIRCLE = { x:30, y:30, w:300, h:300, r:150 };
FL_PREVIEW_A1.LOGO_ZONE = { x:65, y:50, w:230, h:220 };
/* 跟 layouts/04_fl_a1.html 的 BADGE／CTA／LOGOBAR_BAR 座標完全對應——這三個是
   固定裝飾＋下方色塊，示意圖加這幾個進來，是讓使用者調Logo位置時能直接看到
   會不會被這些東西擋到，不用等匯出才發現。文案本身不畫（使用者這裡只在意
   位置會不會被擋，不是要對文案排版），所以只畫BAR的色塊形狀，不畫文字/箭頭。 */
FL_PREVIEW_A1.BADGE = { x:17, y:14, w:157, h:83 };
FL_PREVIEW_A1.CTA   = { x:255, y:8, w:96, h:96 };
FL_PREVIEW_A1.BAR   = { x:24, y:287, w:312, h:64 };
FL_PREVIEW_A1.BAR.r = FL_PREVIEW_A1.BAR.h / 2;

var _flPreviewA1BadgeImg = null, _flPreviewA1CtaImg = null;
(function preloadFlPreviewA1Decor(){
  _flPreviewA1BadgeImg = new Image();
  _flPreviewA1BadgeImg.onload = function(){ if(typeof logo2UpdateFlPreview === 'function') logo2UpdateFlPreview(); };
  _flPreviewA1BadgeImg.src = 'logos/fl-live-badge.png';
  _flPreviewA1CtaImg = new Image();
  _flPreviewA1CtaImg.onload = function(){ if(typeof logo2UpdateFlPreview === 'function') logo2UpdateFlPreview(); };
  _flPreviewA1CtaImg.src = 'logos/fl-a1-cta.png';
})();

function flPreviewA1CirclePath(ctx){
  var c = FL_PREVIEW_A1.CIRCLE;
  ctx.beginPath();
  ctx.arc(c.x + c.w/2, c.y + c.h/2, c.r, 0, Math.PI*2);
  ctx.closePath();
}

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

/* 目前這個分頁是不是「需要顯示FL示意圖」的LOGO模式：
   A級專場（方形04_fl_a1）看 S.flAVariant 是不是 'logoBar'；
   B級專場／舊格式（橫式03_fl）維持原本判斷方式：下拉選單選「LOGO」，
   或 txt-fl 文字打「logo」，兩種都算（雙重保險，跟 editor-utils.js 的
   ccFl() 用同一套判斷方式，不分大小寫、去頭尾空白）。 */
function _currentTabLevel(){
  return (TABS[ACTIVE_TAB] && TABS[ACTIVE_TAB].data) ? TABS[ACTIVE_TAB].data.level : null;
}
function _flTextIsLogo(){
  if(_currentTabLevel() === 'A') return S.flAVariant === 'logoBar';
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

  var isA1 = _currentTabLevel() === 'A';
  /* A級專場方形FL ICON：底色固定自動吸取Logo底色，不提供手動選單──
     直接強制curMode='sampled'、隱藏「白底／以Logo底色填滿」選項群組。
     B級橫式FL維持原本手動二選一。 */
  if(isA1 && S.flLogoBgMode !== 'sampled') S.flLogoBgMode = 'sampled';
  var colorModeGroup = document.getElementById('fl-logo-color-mode-group');
  if(colorModeGroup) colorModeGroup.style.display = isA1 ? 'none' : '';

  /* 同步左側 radio 選項的勾選狀態（例如切分頁還原時，S.flLogoBgMode 可能已被還原成別的值） */
  var curMode = isA1 ? 'sampled' : ((S.flLogoBgMode === 'white') ? 'white' : 'sampled');
  var radios = document.getElementsByName('fl-logo-color-mode');
  for(var i=0;i<radios.length;i++){
    radios[i].checked = (radios[i].value === curMode);
  }

  /* 白底選項的文字說明：橫式03_fl白底會加橘框，方形04_fl_a1沒有邊框設計，
     文字要跟著版位換，不然A級專場看到「白底＋橘框」會誤以為畫面上有框 */
  var whiteLabelEl = document.getElementById('fl-logo-color-mode-white-label');
  if(whiteLabelEl) whiteLabelEl.textContent = isA1 ? '白底' : '白底＋橘框';
  var titleEl = document.getElementById('logo2-fl-preview-title');
  if(titleEl) titleEl.textContent = isA1 ? 'FL ICON A1 示意' : '直播間FL 示意';

  var ctx = cv.getContext('2d');

  if(isA1){
    /* A級專場方形FL ICON：畫布內部解析度跟著切換成360×360（跟336×120不一樣，
       改width/height屬性會清空畫布內容，本來就要重畫，不影響行為）。
       CSS顯示尺寸也要跟著換成正方形，不然360×360會被原本橫式的280×100
       硬壓扁成長方形，跟實際版位比例對不起來。 */
    if(cv.width !== FL_PREVIEW_A1.W || cv.height !== FL_PREVIEW_A1.H){
      cv.width = FL_PREVIEW_A1.W; cv.height = FL_PREVIEW_A1.H;
    }
    cv.style.width = '100%'; cv.style.height = 'auto'; cv.style.aspectRatio = '1 / 1';
    ctx.clearRect(0, 0, FL_PREVIEW_A1.W, FL_PREVIEW_A1.H);

    /* 圓形底：白底／吸Logo底色，這個版位沒有橘框設計 */
    ctx.save();
    flPreviewA1CirclePath(ctx);
    ctx.fillStyle = (curMode === 'white') ? FL_PREVIEW_A1.BG_COLOR : (S.flLogoSampledColor || FL_PREVIEW_A1.BG_COLOR);
    ctx.fill();
    ctx.clip();
    drawFlPreviewA1Logo(ctx);
    ctx.restore();

    /* 下方BAR色塊（不畫文字/箭頭，使用者這裡只在意位置會不會被擋）＋
       BADGE／CTA兩張固定裝飾，順序比照正式版位render()：Logo→BAR→BADGE→CTA，
       畫在Logo之上，才能真的看出來會不會被擋到。 */
    var barA = FL_PREVIEW_A1.BAR;
    flPreviewRoundRect(ctx, barA.x, barA.y, barA.w, barA.h, barA.r);
    ctx.fillStyle = (typeof flBgColorFor === 'function') ? flBgColorFor(S.theme) : '#1E6EB4';
    ctx.fill();

    if(_flPreviewA1BadgeImg && _flPreviewA1BadgeImg.complete && _flPreviewA1BadgeImg.naturalWidth){
      var bd = FL_PREVIEW_A1.BADGE;
      ctx.drawImage(_flPreviewA1BadgeImg, bd.x, bd.y, bd.w, bd.h);
    }
    if(_flPreviewA1CtaImg && _flPreviewA1CtaImg.complete && _flPreviewA1CtaImg.naturalWidth){
      var ct = FL_PREVIEW_A1.CTA;
      ctx.drawImage(_flPreviewA1CtaImg, ct.x, ct.y, ct.w, ct.h);
    }
    return;
  }

  /* B級專場／舊格式：維持原本336×120橫式膠囊示意圖 */
  if(cv.width !== FL_PREVIEW.W || cv.height !== FL_PREVIEW.H){
    cv.width = FL_PREVIEW.W; cv.height = FL_PREVIEW.H;
  }
  cv.style.width = '100%'; cv.style.height = 'auto'; cv.style.aspectRatio = '336 / 120';
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

/* 跟 drawFlPreviewLogo 同一套公式，只是目標範圍換成 FL_PREVIEW_A1.LOGO_ZONE
   （方形版位、無邊框），跟正式版位 layouts/04_fl_a1.html 的
   drawLogoBarLogo() 逐行對應，示意圖才會跟實際套用結果一致。 */
function drawFlPreviewA1Logo(ctx){
  if(!_logo2Img || !_logo2Bounds) return;
  var z = FL_PREVIEW_A1.LOGO_ZONE;
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
    var z = (_currentTabLevel() === 'A') ? FL_PREVIEW_A1.LOGO_ZONE : FL_PREVIEW.LOGO_ZONE;
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
  if(typeof _updateAReviewProgressUI === 'function') _updateAReviewProgressUI();
  logo2UpdateFlPreview();
  if(S.logo2Raw){
    _logo2Scale = S.logo2Scale!==undefined ? S.logo2Scale : 1;
    _logo2OffX  = S.logo2OffX!==undefined  ? S.logo2OffX  : 0;
    _logo2OffY  = S.logo2OffY!==undefined  ? S.logo2OffY  : 0;
    var im = new Image();
    /* 記住這次讀圖當下對應的是哪一張原圖（哪一個分頁）——讀圖是非同步的，
       如果使用者在圖片讀完前就切了分頁（例如逐包確認流程連續按「下一步」、
       或切分頁的手速比讀圖快），下面 onload 觸發時 S 已經是「新分頁」的狀態，
       這時候絕對不能再把「舊分頁圖片」剛取樣出來的底色蓋回去，不然畫面會變成
       「圖片是新分頁的，底色卻是舊分頁的」這種兩邊對不起來的錯亂狀態。 */
    var _openedRawSrc = S.logo2Raw;
    im.onload = function(){
      if(S.logo2Raw !== _openedRawSrc) return; // 分頁已經換過了，這次讀圖結果不算數，新分頁自己的值已經由 applyTabData() 同步設定好了
      _logo2Img = im;
      _logo2RawSrc = S.logo2Raw;
      _logo2Bounds = logo2CalcTightBounds(im);
      _logo2Shape = S.logo2Shape || logo2DetectShape(_logo2Bounds.w, _logo2Bounds.h);
      _logo2BgColor = logo2SampleBgColor(im);
      _logo2SampledBgColor = logo2SampleAssetBgColor(im);
      var _forceSampled = _currentTabLevel() === 'A';
      if(_forceSampled) S.flLogoBgMode = 'sampled';
      if((_forceSampled || S.flLogoBgMode === 'sampled') && S.flLogoSampledColor !== _logo2SampledBgColor){
        S.flLogoSampledColor = _logo2SampledBgColor;
        if(typeof broadcast === 'function') broadcast();
      }
      _logo2Selected = false;
      logo2ResizeCanvasToShape();
      drawLogo2BigCanvas();
      logo2UpdateFlPreview();
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

/* ── 純合成＋套用（不管彈窗開關／跳轉），給「編輯LOGO」按鈕跟A級專場
   逐包確認彈窗共用。cb(applied) —— applied=false 代表沒有素材可合成，直接略過。 ── */
function composeLogo2(cb){
  if(!_logo2Img){ if(cb) cb(false); return; }

  _logo2Selected = false;
  drawLogo2BigCanvas();

  S.logo2Raw   = _logo2RawSrc;
  S.logo2Scale = _logo2Scale;
  S.logo2OffX  = _logo2OffX;
  S.logo2OffY  = _logo2OffY;
  S.logo2Shape = _logo2Shape;

  _logo2BigCanvas.toBlob(function(blob){
    if(!blob){ toast('Logo2 合成失敗','err'); if(cb) cb(false); return; }
    var file = new File([blob], 'logo2-composite.png', { type:'image/png' });
    /* 同樣要等 FileReader 真的讀完、S.imgs.logo2 真的寫入才能呼叫 cb()，
       理由跟 editor-shadow-canvas.js 的 composeShadow() 一樣：不等的話，
       逐包確認流程會搶先存檔＋切到下一頁，這張Logo合成圖遲來的寫入
       就會被誤存進下一包。 */
    applyImageFile(file, 'logo2', function(){ if(cb) cb(true); }); // 沿用既有 logo2 管線：S.imgs.logo2 + 廣播給所有版位
  }, 'image/png');
}

function composeLogo2AndNext(){
  if(!_logo2Img){ toast('請先上傳 logo2 素材','err'); return; }
  composeLogo2(function(applied){
    if(!applied) return;
    closePopup('logo2');
    if(_logo2ChainToShadow){
      toast('Logo2 已套用到所有版位，接著調整陰影','ok',3000);
      openShadowPopup(); // 只有匯入流程進來的才自動跳到下一步：陰影面板
    } else {
      toast('Logo2 已套用到所有版位','ok',3000);
    }
  });
}

/* ── A級專場逐包確認流程 ──
   合併後的 popup-logo2 上方是LOGO、下方是1200曝品區畫布，這裡負責串起
   「切到下一個A級分頁 → 重新開這個合併彈窗 → 按確認就送出並繼續下一包」。
   A級全部確認完會自動接續B級專場逐包確認（見下方 startBLevelReview）——
   B級只有LOGO、沒有曝品區，彈窗會把下半段1200曝品區隱藏起來，只留LOGO
   編輯，且只有工單S欄標記「LOGO」的分頁才需要跳出確認，純文案／不製作
   的分頁在匯入當下就已經直接帶入文字欄位，不需要人工確認，逐包確認流程
   會自動略過。 */
var _aReviewActive = false;
var _bReviewActive = false;

/* 合併彈窗下半段「1200曝品區」的外層容器：B級逐包確認時要整段隱藏
   （B級沒有商品/人物陰影可編輯），A級或手動開啟「編輯 LOGO ＋ 曝品區」
   時要還原顯示，兩邊共用同一個彈窗DOM，不新增第二個彈窗。 */
/* 合併彈窗右側「1200曝品區」相關兩欄（陰影編輯器面板＋1200畫布，現在是
   2x2網格裡各自獨立的grid item）：B級逐包確認時要一起隱藏（B級沒有
   商品/人物陰影可編輯），A級或手動開啟「編輯 LOGO ＋ 曝品區」時要還原
   顯示，兩邊共用同一個彈窗DOM，不新增第二個彈窗。 */
/* 合併彈窗右區塊（陰影編輯器面板＋1200畫布，同一排並排）：B級逐包確認時
   整個隱藏（B級沒有商品/人物陰影可編輯），A級或手動開啟「編輯 LOGO ＋
   曝品區」時要還原顯示，兩邊共用同一個彈窗DOM，不新增第二個彈窗。 */
function _setLogo2ShadowSectionVisible(visible){
  var el = document.getElementById('logo2-shadow-block');
  if(el) el.style.display = visible ? '' : 'none';
}

function _aLevelTabIndices(){
  var arr = [];
  TABS.forEach(function(t,i){ if(t.data && t.data.level === 'A') arr.push(i); });
  return arr;
}

function startALevelReview(){
  var idxs = _aLevelTabIndices();
  if(!idxs.length){ toast('目前沒有A級專場的分頁，請先匯入工單','err'); return; }
  _aReviewActive = true;
  _bReviewActive = false;
  /* 如果目前本來就已經停在第一包A級分頁：
     ①這個分頁從來沒被套用顯示過（例如剛匯入工單，畫面還是空白預設狀態）──
       直接強制重套tab.data，套出批次比對(prematchAllTabAssets)已經存好的
       logo2Edit/shadowState，不用先存再套用；
     ②這個分頁已經套用顯示過至少一次（使用者可能已經在1200畫布手動調過商品
       位置）──不要重套，重套會把 tab.data 裡「匯入當下比對出來的」舊位置蓋回
       畫布，變成「逐包確認一點開就跳回初始排版」。畫面已經是這個分頁正確
       （甚至更新過）的樣子，直接開面板就好。 */
  if(ACTIVE_TAB === idxs[0]){
    if(!_appliedTabDatas.has(TABS[ACTIVE_TAB].data || {})) applyTabData(TABS[ACTIVE_TAB], true);
    _openALevelPanelForCurrentTab();
  } else {
    /* switchTab() 是非同步的（內部saveCurrentTabState要等iframe回覆才算存完），
       一定要等它真的切換完（applyTabData跑完、S已經是新分頁的狀態）才能開彈窗，
       不然openLogo2Popup()會在切換完成前就先讀到「舊分頁」的S.logo2Raw，
       這正是「畫面顯示新分頁，但LOGO圖片/底色卻停在上一包」這個錯亂的根因。 */
    switchTab(idxs[0], _openALevelPanelForCurrentTab);
  }
}

function _openALevelPanelForCurrentTab(){
  _setLogo2ShadowSectionVisible(true); // A級要顯示曝品區（跟B級共用同一個彈窗，B級會把它藏起來）
  openLogo2Popup();   // 開啟合併彈窗＋依目前 S.logo2Raw 初始化LOGO畫布
  openShadowPopup();  // 初始化1200曝品區畫布＋套用目前分頁的陰影素材狀態
  _updateReviewProgressUI();
}

/* 進度列／確認按鈕文字：A級、B級逐包確認共用同一組UI元素（a-review-progress／
   a-review-confirm-btn），這裡依目前是哪一種逐包確認在跑，顯示對應的進度。 */
/* 進度條（a-review-progress-track／-fill）＋文字（a-review-progress）：
   跟外層 a-review-progress-wrap 一起顯示/隱藏，A級、B級逐包確認都會走到
   這裡，不用各自再算一次。文字格式固定「◯級專場 (目前/總共)」，不帶分頁
   標籤（例如A01），維持簡潔、也方便置中對齊。 */
function _setReviewProgress(levelLabel, pos, total){
  var wrap  = document.getElementById('a-review-progress-wrap');
  var el    = document.getElementById('a-review-progress');
  var track = document.getElementById('a-review-progress-track');
  var fill  = document.getElementById('a-review-progress-fill');
  if(!wrap) return;
  if(!total){ wrap.style.display = 'none'; return; }
  wrap.style.display = '';
  if(el) el.textContent = levelLabel+'專場 ('+pos+'/'+total+')';
  if(track && fill){ track.style.display = ''; fill.style.width = Math.round(pos/total*100)+'%'; }
}

function _updateReviewProgressUI(){
  var btn = document.getElementById('a-review-confirm-btn');
  if(_bReviewActive){
    var bIdxs = _bLevelTabIndices();
    var bPos  = bIdxs.indexOf(ACTIVE_TAB) + 1;
    _setReviewProgress('B級', bPos, bIdxs.length);
    if(btn) btn.textContent = (bPos < bIdxs.length) ? '下一頁' : '完成最後一包';
    return;
  }
  if(!_aReviewActive){
    _setReviewProgress('', 0, 0);
    if(btn) btn.textContent = '確認並套用';
    return;
  }
  var idxs = _aLevelTabIndices();
  var pos  = idxs.indexOf(ACTIVE_TAB) + 1;
  _setReviewProgress('A級', pos, idxs.length);
  if(btn) btn.textContent = (pos < idxs.length) ? '下一頁' : '完成最後一包';
}
/* 保留舊函式名稱，其他地方（例如 openLogo2Popup）呼叫的還是舊名字，
   不用逐一改呼叫端 */
function _updateAReviewProgressUI(){ _updateReviewProgressUI(); }

/* 合併彈窗唯一的送出按鈕：把LOGO跟1200曝品區兩邊都合成＋套用（＝廣播到
   02_lpbn等版位），存這個分頁的狀態，逐包確認模式下自動接著開下一個A級
   分頁的同一個彈窗；不是逐包確認模式（從側欄「編輯 LOGO ＋ 曝品區」手動
   開的）就單純套用完直接關窗，不會跳分頁。 */
function confirmALevelPanel(){
  composeLogo2(function(){
    composeShadow(function(){
      if(!_aReviewActive){
        saveCurrentTabState(function(){
          closePopup('logo2');
          toast('已套用','ok',2000);
        });
        return;
      }
      saveCurrentTabState(function(){
        var idxs = _aLevelTabIndices();
        var pos = idxs.indexOf(ACTIVE_TAB);
        var nextIdx = idxs[pos+1];
        if(nextIdx === undefined){
          _aReviewActive = false;
          closePopup('logo2');
          _updateReviewProgressUI();
          toast('已完成所有A級專場的確認','ok',3000);
          /* 自動接續B級專場逐包確認：只有需要放LOGO的B分頁才會跳出彈窗，
             純文案／不製作的分頁已經在匯入當下直接帶入，不用人工確認，
             startBLevelReview 內部會自己過濾、沒有的話就靜靜結束不用另外判斷。
             留一點延遲讓上面「已完成A級」的提示先被看到，不要立刻被蓋掉。 */
          setTimeout(function(){ startBLevelReview(true); }, 600);
          return;
        }
        switchTab(nextIdx, _openALevelPanelForCurrentTab);
      });
    });
  });
}

/* ── B級專場逐包確認流程 ──
   跟A級共用同一個合併彈窗，但只留上半段LOGO編輯，下半段1200曝品區整段
   隱藏（B級沒有商品/人物陰影可編輯）。只有工單S欄標記「LOGO」的分頁
   （parsePersonalEventBLevel 裡 flText==='logo'）才需要人工確認位置/大小，
   純文案或不製作的分頁在匯入時已經直接帶入文字欄位，這裡直接跳過，
   不會出現在逐包確認清單裡。 */
function _bLevelTabIndices(){
  var arr = [];
  TABS.forEach(function(t,i){
    if(t.data && t.data.level === 'B' && t.data.flText === 'logo') arr.push(i);
  });
  return arr;
}

/* silent=true：從A級確認完自動接續呼叫，沒有B級LOGO分頁時不用跳錯誤toast
   （靜靜結束就好，這是正常情況，不是使用者操作錯誤）；
   silent=false（或不傳）：從「▸ 逐包確認 B級專場」按鈕手動點擊，找不到
   分頁才需要明確告知使用者。 */
function startBLevelReview(silent){
  var idxs = _bLevelTabIndices();
  if(!idxs.length){
    if(!silent) toast('目前沒有需要放LOGO的B級專場分頁','ok',2500);
    return false;
  }
  _bReviewActive = true;
  _aReviewActive = false;
  /* 同 startALevelReview() 的邏輯：只有這個分頁「從來沒被套用顯示過」才強制
     重套tab.data，已經顯示過（可能已手動調整過）就不要重套，避免把使用者
     剛調好的狀態蓋回匯入當下的舊資料。 */
  if(ACTIVE_TAB === idxs[0]){
    if(!_appliedTabDatas.has(TABS[ACTIVE_TAB].data || {})) applyTabData(TABS[ACTIVE_TAB], true);
    _openBLevelPanelForCurrentTab();
  } else {
    switchTab(idxs[0], _openBLevelPanelForCurrentTab);
  }
  return true;
}

function _openBLevelPanelForCurrentTab(){
  _setLogo2ShadowSectionVisible(false); // B級沒有曝品區，藏起來只留LOGO編輯
  openLogo2Popup();
  _updateReviewProgressUI();
}

/* B級確認送出：只合成／套用LOGO，不動曝品區（composeShadow不會被呼叫），
   逐包確認模式下自動接著開下一包需要LOGO的B級分頁；不是逐包確認模式
   （目前沒有B級的手動單獨編輯入口，理論上不會走到這裡，保留跟A級對稱
   的寫法以防之後加上手動入口）就單純套用完直接關窗。 */
function confirmBLevelPanel(){
  composeLogo2(function(){
    if(!_bReviewActive){
      saveCurrentTabState(function(){
        closePopup('logo2');
        toast('已套用','ok',2000);
      });
      return;
    }
    saveCurrentTabState(function(){
      var idxs = _bLevelTabIndices();
      var pos = idxs.indexOf(ACTIVE_TAB);
      var nextIdx = idxs[pos+1];
      if(nextIdx === undefined){
        _bReviewActive = false;
        closePopup('logo2');
        _setLogo2ShadowSectionVisible(true); // 還原顯示，不影響之後手動開「編輯 LOGO ＋ 曝品區」
        _updateReviewProgressUI();
        toast('已完成所有B級專場的LOGO確認','ok',3000);
        return;
      }
      switchTab(nextIdx, _openBLevelPanelForCurrentTab);
    });
  });
}

/* 合併彈窗的送出按鈕唯一的 onclick 目標：依目前是哪一種逐包確認在跑，
   分派給對應的送出邏輯；兩者都沒在跑（手動開「編輯 LOGO ＋ 曝品區」）
   就走A級那個分支——它本來就有處理「非逐包確認模式」的單純套用行為。 */
function confirmReviewPanel(){
  if(_bReviewActive){ confirmBLevelPanel(); }
  else { confirmALevelPanel(); }
}

/* 匯入工單後的總入口：優先跑A級逐包確認，A級全部確認完會自動接續B級
   （見 confirmALevelPanel 完成分支）；如果這次工單根本沒有A級分頁，
   直接跳去跑B級（B級沒有需要確認LOGO的分頁時 startBLevelReview 內部
   靜靜結束，不用另外判斷）。 */
function startReviewFlow(){
  var startedA = startALevelReviewSilently();
  if(!startedA) startBLevelReview(true);
}

/* startALevelReview() 原本在「找不到A級分頁」時會跳錯誤toast——匯入流程
   自動呼叫時，工單本來就可能只有B級沒有A級，這是正常情況不是錯誤，
   所以這裡包一層不跳toast的版本，回傳有沒有真的啟動A級確認。 */
function startALevelReviewSilently(){
  var idxs = _aLevelTabIndices();
  if(!idxs.length) return false;
  startALevelReview();
  return true;
}
