'use strict';

/*
  editor-logo2-canvas.js
  ------------------------------------------------------------
  Logo 編輯面板：獨立 popup、獨立大畫布，使用者在這裡把 Logo 素材擺好
  （自動判斷方形/長型、自動吸底色、固定圓角、手動拖曳/縮放），按「確認並套用」
  把畫面合成成一張 PNG，套進 S.imgs.logo2 並廣播到所有版位。

  這份是從 pet-frenzy 專案的 editor-logo2-canvas.js 移植過來的，拿掉了兩塊
  這個專案用不到的東西：
    1. 「直播間FL 示意圖」──那是 07_fl.html 版位專屬的預覽功能，
       資源交換沒有這個版位，整段拿掉。
    2. 「下一步：調整陰影」的銜接──pet-frenzy 按確認後會自動跳到陰影合成面板，
       資源交換沒有陰影系統，這裡按確認就是單純套用，不會跳轉到別的地方。

  重新編輯：面板重開時要能接續使用者上次的縮放/位移，所以除了合成好的
  最終 PNG（存在 S.imgs.logo2），另外存一份「原始素材（未合成的原圖）＋
  當時的縮放位移」（S.logo2Raw / S.logo2Scale / S.logo2OffX / S.logo2OffY /
  S.logo2Shape），重開面板時用這份還原，不是每次都要重新上傳重新調。
*/

/* 工作畫布尺寸：長型 400×180／方形 245×270 的 3 倍，操作空間比較寬裕，
   匯出品質只會更好不會變差（之後套到版位一律是往小縮）。 */
var LOGO2_WORK_DIM = {
  wide:   { w: 1200, h: 540 },
  square: { w: 735,  h: 810 }
};
var LOGO2_RADIUS_PX = 12; // 固定圓角（在工作畫布尺度下），全域只有這一個數字

var _logo2BigCanvas = null, _logo2BigCtx = null, _logo2BigInited = false;
var _logo2Img = null, _logo2Bounds = null, _logo2BgColor = '#ffffff';
var _logo2RawSrc = null;   // 使用者上傳的原圖（未合成），用來存 S.logo2Raw / 重新編輯還原
var _logo2Shape = 'wide';
var _logo2Scale = 1, _logo2OffX = 0, _logo2OffY = 0;
var _logo2Box = null;      // 目前渲染範圍（給滑鼠命中判斷用）
var _logo2Selected = false;
var _logo2DragData = null, _logo2ResizeData = null;

/* ── 形狀判斷／底色採樣／有色範圍 ── */

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

/* 底色判斷：
   - PNG（去背圖）：固定回傳白色。PNG 通常已經去背，即使背景沒去乾淨、
     殘留了不透明的顏色，大多也是想要「無底色」的效果，統一給白色最安全，
     不用去猜測那個殘留色（也避免黑色文字的 logo 被誤判成黑底）。
   - 非PNG（JPG等本身沒有透明通道、一定有背景的格式）：真的去抓原圖四個
     角落＋四邊中點共8個取樣點，用出現次數最多的顏色當作素材本身的底色，
     合成時直接拿來填滿畫布底色，讓 JPG 素材融入畫布，不會露出一圈突兀的
     白邊。 */
function logo2SampleBgColor(im){
  if (im && typeof im.src === 'string' && /^data:image\/png/i.test(im.src)) return '#ffffff';
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
      if(d[3] < 200) return; // 太透明就不算候選（理論上JPG不會有透明，這裡是保險）
      var key = d[0] + ',' + d[1] + ',' + d[2];
      counts[key] = (counts[key] || 0) + 1;
    });

    var best = null, bestCount = 0;
    Object.keys(counts).forEach(function(key){
      if(counts[key] > bestCount){ bestCount = counts[key]; best = key; }
    });
    if(!best) return '#ffffff'; // 抓不到底色，退回白色

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

  // 滾輪縮放：往上滾放大、往下滾縮小，跟拖角縮放共用同一個 _logo2Scale
  _logo2BigCanvas.addEventListener('wheel', function(e){
    if(!_logo2Img) return;
    e.preventDefault();
    var delta = -e.deltaY * 0.0015;
    _logo2Scale = Math.max(0.1, Math.min(6, _logo2Scale + delta));
    drawLogo2BigCanvas();
  }, { passive:false });

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

/* ── 側邊 slot：有圖顯示縮圖＋右上角×刪除，沒有圖顯示虛線框＋「+」 ── */
function logo2SyncSlotUI(){
  var slot = document.getElementById('logo2-slot');
  if(!slot) return;
  if(_logo2RawSrc){
    slot.className = 'logo2-slot-item filled';
    slot.onclick = null;
    slot.innerHTML =
      '<div class="logo2-slot-thumb"><img src="' + _logo2RawSrc + '"></div>' +
      '<span class="logo2-slot-label">Logo</span>' +
      '<span class="logo2-slot-del" onclick="event.stopPropagation();logo2RemoveLogo()" title="移除">×</span>';
  } else {
    slot.className = 'logo2-slot-item empty';
    slot.innerHTML =
      '<div class="logo2-slot-thumb add"><span class="logo2-slot-plus">+</span></div>' +
      '<span class="logo2-slot-label">點擊上傳</span>';
    slot.onclick = function(){ logo2TriggerUpload(); };
  }
}

function logo2TriggerUpload(){
  var inp = document.getElementById('logo2-compose-upload');
  if(inp) inp.click();
}

/* 移除目前的 Logo 素材：清掉這個編輯面板裡「尚未合成的原圖」狀態＋位移/縮放 */
function logo2RemoveLogo(){
  _logo2Img = null; _logo2RawSrc = null; _logo2Bounds = null;
  _logo2Scale = 1; _logo2OffX = 0; _logo2OffY = 0; _logo2Selected = false;
  _logo2Shape = 'wide';
  S.logo2Raw = null; S.logo2Scale = undefined; S.logo2OffX = undefined; S.logo2OffY = undefined; S.logo2Shape = undefined;
  logo2ResizeCanvasToShape();
  drawLogo2BigCanvas();
  logo2SyncSlotUI();
  logo2SyncShapeRadioUI();
}

/* ── 方形/長型：預設自動判斷，這裡讓使用者手動覆蓋 ── */
function logo2SyncShapeRadioUI(){
  var group = document.getElementById('logo2-shape-group');
  if (!group) return;
  var radios = group.querySelectorAll('input[name="logo2-shape"]');
  radios.forEach(function(r){ r.checked = (r.value === _logo2Shape); });
}
function logo2SetShapeOverride(shape){
  if (shape !== 'square' && shape !== 'wide') return;
  if (!_logo2Img) { logo2SyncShapeRadioUI(); return; }
  _logo2Shape = shape;
  logo2ResizeCanvasToShape();
  drawLogo2BigCanvas();
}

/* ── 載入素材（使用者手動上傳新圖、或自動比對到 Logo 時呼叫，會重設縮放位移） ── */
function logo2LoadImageFromSrc(src){
  var im = new Image();
  im.onload = function(){
    _logo2Img = im;
    _logo2RawSrc = src;
    _logo2Bounds = logo2CalcTightBounds(im);
    _logo2Shape = logo2DetectShape(_logo2Bounds.w, _logo2Bounds.h);
    _logo2BgColor = logo2SampleBgColor(im);
    _logo2Scale = 1; _logo2OffX = 0; _logo2OffY = 0; _logo2Selected = false;
    logo2ResizeCanvasToShape();
    drawLogo2BigCanvas();
    logo2SyncSlotUI();
    logo2SyncShapeRadioUI();
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
    _logo2BigCtx.strokeStyle = '#4a90e2';
    _logo2BigCtx.lineWidth = 2;
    _logo2BigCtx.setLineDash([6,4]);
    _logo2BigCtx.strokeRect(dx, dy, dw, dh);
    _logo2BigCtx.setLineDash([]);

    var hs = logo2HandleSizeCanvasPx();
    var corners = [[dx,dy],[dx+dw,dy],[dx,dy+dh],[dx+dw,dy+dh]];
    corners.forEach(function(pt){
      _logo2BigCtx.fillStyle = '#ffffff';
      _logo2BigCtx.strokeStyle = '#4a90e2';
      _logo2BigCtx.lineWidth = Math.max(1.5, hs*0.12);
      _logo2BigCtx.fillRect(pt[0]-hs/2, pt[1]-hs/2, hs, hs);
      _logo2BigCtx.strokeRect(pt[0]-hs/2, pt[1]-hs/2, hs, hs);
    });
    _logo2BigCtx.restore();
  }

  logo2UpdateHint();
}

/* 把手在畫布座標系裡該多大：固定「螢幕上看起來 16px」，換算成畫布內部解析度的等效大小 */
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
  el.textContent = _logo2Img ? '' : '請先上傳 Logo 素材';
}

/* ── 滑鼠互動：拖曳移動／拖角縮放 ── */

function logo2CanvasMouseDown(e){
  if(!_logo2Img || !_logo2Box) return;
  var rect = _logo2BigCanvas.getBoundingClientRect();
  var scaleX = _logo2BigCanvas.width / rect.width;
  var scaleY = _logo2BigCanvas.height / rect.height;
  var mx = (e.clientX - rect.left) * scaleX;
  var my = (e.clientY - rect.top) * scaleY;

  if(_logo2Selected){
    var HANDLE = logo2HandleSizeCanvasPx();
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
  drawLogo2BigCanvas();
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

/* ── 開啟面板：有存過的原始素材就還原上次編輯狀態 ── */
function openLogo2Popup(){
  /* 不管是逐包確認流程叫出來的、還是手動上傳/點畫布取代圖示叫出來的，
     彈窗真的要顯示了，就代表載入結束、可以讓使用者操作了。
     這裡不能用 pm.hide()——它有內建 800ms 淡出延遲，且 pm-bg 的
     z-index（9999）比這個彈窗（300）高，會讓彈窗打開後還被半透明
     黑幕多蓋住將近1秒、點不到任何東西，改成直接立即隱藏。 */
  var pmBg = document.getElementById('pm-bg');
  if(pmBg) pmBg.style.display = 'none';
  document.getElementById('popup-logo2').classList.add('open');
  initLogo2BigCanvasOnce();
  if(typeof updateLogoReviewProgressUI === 'function') updateLogoReviewProgressUI();
  /* S.logo2Raw 沒有值，代表這一頁的 Logo 從來沒開過編輯畫布（例如自動
     比對到贊助商原圖就直接套用，沒有經過「確認並套用」這一步），
     這時候退回用「目前已套用的圖」本身當原始素材繼續編輯，而不是
     顯示空白 slot——那張圖本身就還是未壓平的原圖，可以直接拿來調整。 */
  var _rawToRestore = S.logo2Raw || S.imgs.logo2;
  if(_rawToRestore){
    _logo2Scale = S.logo2Scale!==undefined ? S.logo2Scale : 1;
    _logo2OffX  = S.logo2OffX!==undefined  ? S.logo2OffX  : 0;
    _logo2OffY  = S.logo2OffY!==undefined  ? S.logo2OffY  : 0;
    var im = new Image();
    im.onload = function(){
      _logo2Img = im;
      _logo2RawSrc = _rawToRestore;
      _logo2Bounds = logo2CalcTightBounds(im);
      _logo2Shape = S.logo2Shape || logo2DetectShape(_logo2Bounds.w, _logo2Bounds.h);
      _logo2BgColor = logo2SampleBgColor(im);
      _logo2Selected = false;
      logo2ResizeCanvasToShape();
      drawLogo2BigCanvas();
      logo2SyncSlotUI();
      logo2SyncShapeRadioUI();
    };
    im.src = _rawToRestore;
  } else if(_logo2Img){
    logo2ResizeCanvasToShape();
    drawLogo2BigCanvas();
    logo2SyncSlotUI();
    logo2SyncShapeRadioUI();
  } else {
    logo2UpdateHint();
    logo2SyncSlotUI();
    logo2SyncShapeRadioUI();
  }
}

/* ── 匯出用合成：只匯出「Logo 本身」（依目前縮放/位移），不含底色填滿、
   不含圓角裁切，畫布維持透明背景。

   為什麼不能直接把預覽畫布（drawLogo2BigCanvas，含底色填滿）拿去匯出：
   預覽畫布為了讓使用者看到「套進圓角框長什麼樣子」，把整張工作畫布
   （1200×540 或 735×810）都填滿了底色，等於整張輸出圖完全不透明。
   版位端（01_thumbnail.html / 06_opening.html）收到這張圖後，會自己
   重新計算「有色範圍」（找非透明像素的邊界）來決定 Logo 實際大小，
   一旦整張圖都不透明，這個計算會把「整張畫布」誤判成「Logo 本體」，
   縮放比例整個跑掉，Logo 會被縮到很小、外面一圈都是底色。
   所以匯出時只畫 Logo 本身、背景維持透明，底色改成用另一個管道
   （S.logo2BgColor）明確告訴版位端要用什麼顏色當框的底色，
   不要讓版位自己猜。 */
function exportLogo2Composite(){
  var dim = LOGO2_WORK_DIM[_logo2Shape] || LOGO2_WORK_DIM.wide;
  var oc = document.createElement('canvas');
  oc.width = dim.w; oc.height = dim.h;
  var octx = oc.getContext('2d');
  octx.clearRect(0, 0, dim.w, dim.h);

  var bw = _logo2Bounds.w, bh = _logo2Bounds.h, bx = _logo2Bounds.x, by = _logo2Bounds.y;
  var sclBase = Math.min(dim.w/bw, dim.h/bh);
  var scl = sclBase * _logo2Scale;
  var dw = bw*scl, dh = bh*scl;
  var dx = (dim.w-dw)/2 + _logo2OffX;
  var dy = (dim.h-dh)/2 + _logo2OffY;
  octx.drawImage(_logo2Img, bx, by, bw, bh, dx, dy, dw, dh);
  return oc.toDataURL('image/png');
}

/* ── 確認：匯出「透明背景、只有 Logo 本體」的 PNG，套進 S.imgs.logo2，
   底色另外用 S.logo2BgColor 明確傳給版位端；存原始素材供之後重新編輯，
   並沿用既有的 applyLogo2()（廣播給所有版位）── */
function composeLogo2AndApply(){
  if(!_logo2Img){ toast('請先上傳 Logo 素材','err'); return; }

  /* 匯出前強制取消選取，避免選取框／控點被一起合成進最終圖片 */
  _logo2Selected = false;
  drawLogo2BigCanvas();

  // 先把「原圖＋當下數值」存起來，供之後重新叫出面板還原用
  S.logo2Raw   = _logo2RawSrc;
  S.logo2Scale = _logo2Scale;
  S.logo2OffX  = _logo2OffX;
  S.logo2OffY  = _logo2OffY;
  S.logo2Shape = _logo2Shape;

  /* 這幾個原本只存在全域的 S 上，但 Logo 是各分頁各自獨立的東西——
     逐包確認跑完之後，S.logo2Raw 會停在「最後一包」的值，之後不管在
     哪一頁點「取代」重新打開編輯畫布，都會錯誤地還原成最後一包的素材。
     這裡額外把這幾個值也存進「目前這一頁」自己的 tab.data，
     applyTabData() 切換分頁時會把它們讀回 S 上，兩邊才會對得起來。 */
  if(typeof TABS !== 'undefined' && TABS[ACTIVE_TAB]){
    var _t = TABS[ACTIVE_TAB].data;
    _t.logo2Raw = S.logo2Raw;
    _t.logo2Scale = S.logo2Scale;
    _t.logo2OffX = S.logo2OffX;
    _t.logo2OffY = S.logo2OffY;
    _t.logo2Shape = S.logo2Shape;
  }

  var dataUrl = exportLogo2Composite();
  closePopup('logo2');
  applyLogo2(dataUrl, _logo2BgColor); // 既有函式：套用 + 廣播給所有版位，多帶一個底色參數

  /* 逐包確認流程中，確認完這包就自動前進到下一包 */
  if(_logoReviewQueue) advanceLogoReviewAfterThis();
}
