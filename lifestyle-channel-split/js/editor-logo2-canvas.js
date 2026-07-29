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
function logo2SampleBgColor(im){
  return '#ffffff';
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
    _logo2Scale = 1; _logo2OffX = 0; _logo2OffY = 0; _logo2Selected = false;
    logo2ResizeCanvasToShape();
    drawLogo2BigCanvas();
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
  el.textContent = '目前判定為「' + (_logo2Shape==='square'?'方形':'長型') + '」，點一下素材可選取，選取後可拖曳移動、拖藍色角落縮放（方向鍵微調，Shift 加速）';
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

/* ── 開啟面板：有存過的原始素材就還原上次編輯狀態 ──
   chainToShadow=true：這次是匯入流程自動開啟的，按鈕按下去要接著跳陰影面板；
   不傳（undefined/false）：從右側「編輯 Logo2」按鈕手動開啟，按鈕按下去只單純套用，不跳轉。 */
function openLogo2Popup(chainToShadow){
  _logo2ChainToShadow = !!chainToShadow;
  document.getElementById('popup-logo2').classList.add('open');
  initLogo2BigCanvasOnce();
  logo2UpdateNextBtnLabel();
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
