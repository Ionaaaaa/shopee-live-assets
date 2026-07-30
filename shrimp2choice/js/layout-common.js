/*
  layout-common.js
  所有版位共用、逐字完全相同的工具函式與拖曳/縮放互動邏輯——不要複製貼上到各版位檔案裡改。

  下面所有內容是我逐一比對過 01/02/04/05/06 五個版位檔案的原始內容，
  程式化比對確認完全一模一樣（一個字元都沒差）才抽出來的，抽出來不會改變任何行為。
  （這份不是純函式集合，中間 startResize 之後也包含幾段會立即執行的
  document.addEventListener(...) / stage.addEventListener(...) 註冊——
  這些每個版位各自的 iframe 是獨立的文件環境，共用這份檔案不會互相干擾，
  跟原本各版位各自寫一份的行為一致。）

  用到的全域變數（D、overlay、render、ZONE、cv、ctx、stage、W、H...）
  都還是各版位自己宣告，這裡只是共用「怎麼用這些變數」的邏輯，不是共用變數本身——
  這也是為什麼函式抽出來了，但 ZONE/LOGO 這些「每個版位不一樣的數字」還是留在各版位檔案裡。

  以下這些函式「每個版位不一樣」，還留在各版位檔案裡，沒有抽出來（逐字比對後確認有差異，抽了會壞掉）：
    render / drawLogos / drawText / drawHostBar / drawCTA
      → 每個版位的排版、有沒有 CTA、有沒有主持人 bar 本來就不同
    initHostPos / exportBlob / snapBlob / toggleUILayer
      → 每個版位的主持人預設位置、匯出格式細節有差異

  用法：在各版位 <script> 區塊最前面（比自己的內嵌 <script> 早）加一行：
    <script src="../js/layout-common.js"></script>
*/

function font(size, w){ return w+' '+size+'px "ShopeeNoto","Noto Sans TC",sans-serif'; }

/* 依 logo-row-defaults.js 查出這個版位該用的 logo1/分隔線比例係數，
   找不到對應版位就退回 _default。用法：var LR = getLogoRowRatios(); */
function getLogoRowRatios(){
  var id = null;
  try{ id = location.pathname.split('/').pop().replace(/\.html?$/i, ''); }catch(e){}
  var table = window.LogoRowDefaults || {};
  var def = table._default || { logo1HeightRatio:1, logo2HeightRatioSquare:1, logo2HeightRatioWide:0.8,
    dividerHeightRatio:0.5, dividerLineWidthPx:1, gapBeforeDividerPx:15, gapAfterDividerPx:15 };
  var override = (id && table[id]) || {};
  return {
    logo1HeightRatio:       override.logo1HeightRatio       !== undefined ? override.logo1HeightRatio       : def.logo1HeightRatio,
    logo2HeightRatioSquare: override.logo2HeightRatioSquare !== undefined ? override.logo2HeightRatioSquare : def.logo2HeightRatioSquare,
    logo2HeightRatioWide:   override.logo2HeightRatioWide   !== undefined ? override.logo2HeightRatioWide   : def.logo2HeightRatioWide,
    dividerHeightRatio:     override.dividerHeightRatio     !== undefined ? override.dividerHeightRatio     : def.dividerHeightRatio,
    dividerLineWidthPx:     override.dividerLineWidthPx     !== undefined ? override.dividerLineWidthPx     : def.dividerLineWidthPx,
    gapBeforeDividerPx:     override.gapBeforeDividerPx     !== undefined ? override.gapBeforeDividerPx     : def.gapBeforeDividerPx,
    gapAfterDividerPx:      override.gapAfterDividerPx      !== undefined ? override.gapAfterDividerPx      : def.gapAfterDividerPx
  };
}

/* logo2 目前是方形還是長型，決定要用 logo2HeightRatioSquare 還是 logo2HeightRatioWide。
   D.logo2Shape 沒有值（例如舊的存檔資料，還沒有形狀資訊）時，當作長型處理，
   跟目前大多數素材的使用情況一致。 */
function logo2HeightRatioFor(shape, ratios){
  if(shape === 'square') return ratios.logo2HeightRatioSquare;
  if(shape === 'double') return ratios.logo2HeightRatioDouble !== undefined ? ratios.logo2HeightRatioDouble : ratios.logo2HeightRatioWide;
  return ratios.logo2HeightRatioWide;
}

/* 依 host-scene-scale.js 查出這個版位「主持人圖層」第一次自動貼合時要再縮放多少倍。
   只影響 initHostPos 算出來的初始大小，使用者手動拖曳/縮放調整過之後不受影響。
   combo（選填）：目前版型 A/B/C。host-scene-scale.js 裡每個版位可以是：
     - 純數字：所有版型共用（向下相容舊寫法）
     - 物件 { _default, A, B, C, D }：只列出想特別調整的版型，其他版型退回 _default
   找不到對應版位、對應版型就一路退回 _default，最後退回 1（不縮放）。
   用法：D.imgScale *= getHostSceneScale(D.combo); */
function getHostSceneScale(combo){
  var id = null;
  try{ id = location.pathname.split('/').pop().replace(/\.html?$/i, ''); }catch(e){}
  var table = window.HostSceneScale || {};
  var entry = (id && table[id] !== undefined) ? table[id] : table._default;
  if(entry === undefined) return 1;
  if(typeof entry === 'object' && entry !== null){
    if(combo && entry[combo] !== undefined) return entry[combo];
    return entry._default !== undefined ? entry._default : 1;
  }
  return entry; // 純數字寫法：所有版型共用
}

/* 依 host-scene-scale.js 裡的 HostSceneOffsetY 查出這個版位「主持人圖層」
   第一次自動貼合時要額外往下（正值）/往上（負值）偏移幾個 px。
   只影響 initHostPos 算出來的初始位置，使用者手動拖曳調整過之後不受影響。
   combo（選填）：目前版型 A/B/C，規則跟 getHostSceneScale 一致（純數字＝共用，物件＝可依版型細分）。
   用法：D.imgY += getHostSceneOffsetY(D.combo); */
function getHostSceneOffsetY(combo){
  var id = null;
  try{ id = location.pathname.split('/').pop().replace(/\.html?$/i, ''); }catch(e){}
  var table = window.HostSceneOffsetY || {};
  var entry = (id && table[id] !== undefined) ? table[id] : table._default;
  if(entry === undefined) return 0;
  if(typeof entry === 'object' && entry !== null){
    if(combo && entry[combo] !== undefined) return entry[combo];
    return entry._default !== undefined ? entry._default : 0;
  }
  return entry; // 純數字寫法：所有版型共用
}

/* 依 mask-defaults.js 查出這個版位的底部遮罩設定，找不到就退回 _default（enabled:false）。
   用法：var m = getMaskConfig(); */
function getMaskConfig(){
  var id = null;
  try{ id = location.pathname.split('/').pop().replace(/\.html?$/i, ''); }catch(e){}
  var table = window.MaskDefaults || {};
  var def = table._default || { enabled:false };
  return (id && table[id]) || def;
}

/* 畫「主持人身體太短」用的底部遮罩：左右貼齊畫布，頂部邊緣中間凹一個弧形。
   開關看 D.maskOn（由 editor 廣播控制，預設關閉）；沒有廣播過的獨立測試環境
   則退回 window.MaskEnabled 這個檔案預設值。這個版位在 mask-defaults.js 裡
   沒有設定/沒有 enabled，就算開關開著也不會畫。呼叫時機：商品/主持人陰影疊層
   畫完之後，蓋在主持人/商品上面。

   形狀支援左右不對稱：leftDrop 不填或 0 時，左右一樣高（跟原本的對稱弧形相同）；
   填數字時左側邊緣比右側最高點再往下多少 px，做出「左低右高」的弧形。

   顏色是橢圓放射狀漸層：弧形邊最淺，往下、往左右邊緣擴散變深，貼齊畫布
   左右邊緣的地方只會是純深色。

   fade（可選）：在指定位置局部「擦淡」遮罩本身的透明度，不是疊白色——
   會讓底下真正的畫面（主持人/背景）透出來，效果比照 Photoshop 的放射性漸層
   工具：angle 對應「角度」、scale 對應「縮放」（把圓形壓扁成橢圓）。 */
function drawMaskLayer(ctx){
  var on = (typeof D !== 'undefined' && D.maskOn !== undefined) ? D.maskOn : window.MaskEnabled;
  if(!on) return;
  var m = getMaskConfig();
  if(!m || !m.enabled) return;

  var shapeLeft  = m.x !== undefined ? m.x : 0;               // 色塊左邊界（預設貼齊畫布左邊）
  var shapeWidth = m.width !== undefined ? m.width : W;        // 色塊寬度（預設等於畫布寬度）
  var shapeRight = shapeLeft + shapeWidth;

  var top = H - m.height;                  // 右側／預設兩側，最高點到底部的距離
  var leftTop = top + (m.leftDrop || 0);    // 左側邊緣，比最高點再往下多少（0＝左右對稱，跟之前一樣）
  var dip = m.dip || 0;

  /* 用獨立的離屏 canvas 畫遮罩本體（形狀＋顏色＋glow）。
     這樣做淡化(fade)時，destination-out 擦除只會影響「遮罩自己」的透明度，
     不會連同底下已經畫好的背景/主持人一起被擦成空白——不然在瀏覽器畫面上，
     擦掉的地方會露出畫布背後的網頁背景（通常是白色），而不是真正露出背景圖。 */
  var off = document.createElement('canvas');
  off.width = W; off.height = H;
  var octx = off.getContext('2d');

  octx.beginPath();
  octx.moveTo(shapeLeft, leftTop);
  octx.quadraticCurveTo((shapeLeft + shapeRight)/2, (leftTop + top)/2 + dip, shapeRight, top);
  octx.lineTo(shapeRight, H);
  octx.lineTo(shapeLeft, H);
  octx.closePath();
  octx.clip();

  /* 橢圓放射狀漸層：用 translate+scale 把圓形漸層橫向拉寬成橢圓，
     中心點放在弧形頂部（預設取左右較高的那一邊、色塊的水平正中央），讓淺色沿著弧形邊散開 */
  var glowWidthRatio  = m.glowWidthRatio  !== undefined ? m.glowWidthRatio  : 0.32;
  var glowHeightRatio = m.glowHeightRatio !== undefined ? m.glowHeightRatio : 1.6;
  var radiusY = m.height * glowHeightRatio;
  var scaleX  = (shapeWidth * glowWidthRatio) / radiusY;
  var glowCx  = m.glowCx !== undefined ? m.glowCx : (shapeLeft + shapeRight)/2;
  var glowCy  = m.glowCy !== undefined ? m.glowCy : Math.min(top, leftTop);

  octx.save();
  octx.translate(glowCx, glowCy);
  octx.scale(scaleX, 1);
  var grad = octx.createRadialGradient(0, 0, 0, 0, 0, radiusY);
  grad.addColorStop(0, m.lightColor || m.color);
  grad.addColorStop(1, m.color);
  octx.fillStyle = grad;
  var localW = shapeWidth / scaleX;
  octx.fillRect(-localW/2 - 5, -(radiusY + 5), localW + 10, radiusY + m.height + 10);
  octx.restore();

  /* 左下角（或指定位置）局部淡化：destination-out 只擦「這個離屏 canvas」自己的透明度，
     底下的背景/主持人是另外畫在主畫布上，完全不受影響。
     fade.type 預設 'radial'（比照 Photoshop 放射性漸層工具，angle/scale 把圓形壓扁旋轉）；
     設成 'linear' 則改用直線漸層，方向由 angle 決定、長度由 extentPx 決定，沒有壓扁/橢圓 */
  if(m.fade && m.fade.enabled){
    var f = m.fade;
    var fcx = f.cx !== undefined ? f.cx : 0;
    var fcy = f.cy !== undefined ? f.cy : H;
    var radius = f.extentPx || 210;
    octx.save();
    if(f.type === 'linear'){
      var rad = (f.angle || 0) * Math.PI / 180;
      var dx = Math.cos(rad), dy = -Math.sin(rad); // 角度慣例：0°朝右，逆時針為正，跟旋轉一致
      var ex = fcx + dx * radius, ey = fcy + dy * radius;
      var lineGrad = octx.createLinearGradient(fcx, fcy, ex, ey);
      lineGrad.addColorStop(0, 'rgba(0,0,0,1)'); // 起點：完全擦除
      lineGrad.addColorStop(1, 'rgba(0,0,0,0)'); // 終點：不擦除
      octx.fillStyle = lineGrad;
      octx.globalCompositeOperation = 'destination-out';
      octx.fillRect(0, 0, W, H); // 已經被色塊自己的形狀clip過，實際只會影響色塊範圍
    } else {
      octx.translate(fcx, fcy);
      octx.rotate((f.angle || 0) * Math.PI / 180);
      octx.scale(1, f.scale !== undefined ? f.scale : 1);
      var fadeGrad = octx.createRadialGradient(0, 0, 0, 0, 0, radius);
      fadeGrad.addColorStop(0, 'rgba(0,0,0,1)'); // 中心：完全擦除，變成0%不透明度
      fadeGrad.addColorStop(1, 'rgba(0,0,0,0)'); // 邊緣往外：不擦除，維持100%
      octx.fillStyle = fadeGrad;
      octx.globalCompositeOperation = 'destination-out';
      var big = radius * 3;
      octx.fillRect(-big, -big, big*2, big*2);
    }
    octx.restore();
  }

  /* 把處理好透明度的遮罩貼回主畫布：淡化的地方因為離屏canvas本身變透明，
     貼上去時用一般的 source-over，底下主畫布已經畫好的背景/主持人就會正確透出來 */
  ctx.drawImage(off, 0, 0);
}

/* ── BG ── */

function loadBg(url){
  if(!url){ D.bg=null; D.bgUrl=null; render(); return; }
  if(url===D.bgUrl && D.bg){ render(); return; }
  D.bgUrl=url;
  var img=new Image();
  img.onload=function(){ D.bg=img; render(); console.log('[bg] 載入成功:', url); };
  img.onerror=function(){ D.bg=null; render(); console.warn('[bg] 載入失敗，改用預設色：', url); };
  img.src=url;
}

function loadImg(src, cb){
  if(!src){ cb(null); return; }
  var img=new Image();
  img.onload=function(){ cb(img); };
  img.onerror=function(){ cb(null); };
  img.src=src;
}

/* ── Render ── */

function updateOverlay(){
  overlay.innerHTML='';
  if(!D.host||!D.selected) return;

  var dw = D.host.naturalWidth  * D.imgScale;
  var dh = D.host.naturalHeight * D.imgScale;
  D.imgW = dw; D.imgH = dh;

  /* 用 tight bounds 決定選取框範圍 */
  var boxL, boxT, boxW, boxH;
  if(D.hostBounds){
    var PAD = 2;
    boxL = D.imgX - dw/2 + D.hostBounds.x * D.imgScale - PAD;
    boxT = D.imgY - dh/2 + D.hostBounds.y * D.imgScale - PAD;
    boxW = D.hostBounds.w * D.imgScale + PAD*2;
    boxH = D.hostBounds.h * D.imgScale + PAD*2;
  } else {
    boxL = D.imgX - dw/2;
    boxT = D.imgY - dh/2;
    boxW = dw; boxH = dh;
  }
  var imgL=boxL, imgT=boxT, imgR=boxL+boxW, imgB=boxT+boxH;

  var box=document.createElement('div');
  box.className='sel-box';
  box.style.cssText='left:'+imgL+'px;top:'+imgT+'px;width:'+boxW+'px;height:'+boxH+'px;';
  overlay.appendChild(box);

  [
    {h:'nw',lx:imgL,        ly:imgT        },
    {h:'n', lx:imgL+boxW/2, ly:imgT        },
    {h:'ne',lx:imgR,        ly:imgT        },
    {h:'e', lx:imgR,        ly:imgT+boxH/2 },
    {h:'se',lx:imgR,        ly:imgB        },
    {h:'s', lx:imgL+boxW/2, ly:imgB        },
    {h:'sw',lx:imgL,        ly:imgB        },
    {h:'w', lx:imgL,        ly:imgT+boxH/2 },
  ].forEach(function(hd){
    var el=document.createElement('div');
    el.className='sel-handle';
    el.dataset.h=hd.h;
    el.style.cssText='left:'+hd.lx+'px;top:'+hd.ly+'px;';
    el.addEventListener('mousedown',startResize);
    overlay.appendChild(el);
  });

  // 懸浮 action bar — 置於圖片頂部中央，超出畫布上方時改顯示在下方
  var bar=document.createElement('div');
  bar.className='sel-bar';
  bar.innerHTML=
    '<button class="sel-bar-btn" onclick="doAction(\'edit\')">'
    +'<svg viewBox="0 0 16 16"><path d="M11 2l3 3-8 8-4 1 1-4z"/></svg>編輯</button>'
    +'<div class="sel-bar-sep"></div>'
    +'<button class="sel-bar-btn danger" onclick="doAction(\'delete\')">'
    +'<svg viewBox="0 0 16 16"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9"/></svg>刪除</button>';

  // 固定在作圖區底部，水平置中，不超出畫布
  var barTop = ZONE.y + ZONE.h + 8;
  // 如果作圖區底部已超出畫布高度，貼齊畫布底部往上
  if(barTop + 42 > H) barTop = H - 50;
  bar.style.left = (ZONE.x + ZONE.w/2) + 'px';
  bar.style.top  = barTop + 'px';
  bar.style.transform = 'translateX(-50%)';
  overlay.appendChild(bar);

  overlay.style.pointerEvents='auto';
}

/* ── Action handler ── */

function doAction(action){
  if(action==='edit'){
    if(window.parent!==window){
      window.parent.postMessage({type:'BN_OPEN_SHADOW_EDITOR', key:'host'}, '*');
    }
  } else if(action==='delete'){
    D.host=null; D.selected=false; D.imgW=0; D.imgH=0;
    overlay.style.pointerEvents='none';
    if(window.parent!==window){
      window.parent.postMessage({type:'BN_DELETE_IMG', key:'host'}, '*');
    }
    render();
  }
}

/* ── Resize ── */
var _rd=null;

function startResize(e){
  e.preventDefault(); e.stopPropagation();
  // 記錄當下的實際寬高和 scale
  var dw = D.host.naturalWidth  * D.imgScale;
  var dh = D.host.naturalHeight * D.imgScale;
  _rd={h:e.target.dataset.h, sx:e.clientX, sy:e.clientY,
       sc:D.imgScale, sw:dw, sh:dh, ix:D.imgX, iy:D.imgY};
  D.resizing=true;
}
document.addEventListener('mousemove',function(e){
  if(!D.resizing||!_rd) return;
  var rect=cv.getBoundingClientRect();
  var stageScale=W/rect.width; // canvas 顯示縮放比
  var dx=(e.clientX-_rd.sx)*stageScale;
  var dy=(e.clientY-_rd.sy)*stageScale;
  var h=_rd.h, ref=Math.max(_rd.sw,_rd.sh);
  var delta=0;
  if(h==='se'||h==='s'||h==='e')  delta= Math.max(dx,dy)/ref;
  if(h==='nw'||h==='n'||h==='w')  delta=-Math.min(dx,dy)/ref;
  if(h==='ne') delta= (dx-dy)/ref/2;
  if(h==='sw') delta=-(dx-dy)/ref/2;
  D.imgScale=Math.max(0.05,_rd.sc+delta);
  render();
});
document.addEventListener('mouseup',function(){ D.resizing=false; _rd=null; });

/* ── Drag ── */
stage.addEventListener('mousedown',function(e){
  if(D.resizing) return;
  if(e.target.classList.contains('sel-handle')||e.target.closest('.sel-bar')) return;
  var rect=cv.getBoundingClientRect();
  var sx=W/rect.width, sy=H/rect.height;
  var cx=(e.clientX-rect.left)*sx, cy=(e.clientY-rect.top)*sy;
  /* 判斷是否點到主持人圖素的有色範圍 */
  var hitOk = false;
  if(D.host){
    if(D.hostBounds){
      var dw=D.host.naturalWidth*D.imgScale, dh=D.host.naturalHeight*D.imgScale;
      var imgL=D.imgX-dw/2, imgT=D.imgY-dh/2;
      var bx=imgL+D.hostBounds.x*D.imgScale;
      var by=imgT+D.hostBounds.y*D.imgScale;
      var bw=D.hostBounds.w*D.imgScale;
      var bh=D.hostBounds.h*D.imgScale;
      hitOk=(cx>=bx&&cx<=bx+bw&&cy>=by&&cy<=by+bh);
    } else {
      /* 沒有 bounds：用整張圖範圍 */
      var dw2=D.host.naturalWidth*D.imgScale, dh2=D.host.naturalHeight*D.imgScale;
      hitOk=(cx>=D.imgX-dw2/2&&cx<=D.imgX+dw2/2&&cy>=D.imgY-dh2/2&&cy<=D.imgY+dh2/2);
    }
  }

  if(hitOk){
    /* 點到圖素：選取並開始拖拉 */
    D.selected=true;
    overlay.style.pointerEvents='auto';
    D.dragging=true;
    D.dragStartX=cx; D.dragStartY=cy;
    D.imgStartX=D.imgX; D.imgStartY=D.imgY;
    stage.style.cursor='grabbing';
  } else {
    /* 點到圖素以外（作圖區內或外）：取消選取 */
    D.selected=false;
    overlay.style.pointerEvents='none';
    stage.style.cursor='default';
  }
  render();
});
stage.addEventListener('mousemove',function(e){
  if(!D.dragging||D.resizing) return;
  var rect=cv.getBoundingClientRect();
  var sx=W/rect.width, sy=H/rect.height;
  D.imgX=D.imgStartX+(e.clientX-rect.left)*sx-D.dragStartX;
  D.imgY=D.imgStartY+(e.clientY-rect.top)*sy-D.dragStartY;
  render();
});
stage.addEventListener('mouseup',function(){ D.dragging=false; stage.style.cursor='default'; });
stage.addEventListener('mouseleave',function(){ D.dragging=false; stage.style.cursor='default'; });

/* ── Scroll zoom ── */
/* 滾輪縮放已移除 */

/* ── Init host position ── */
/* ── Tight bounding box：掃描有色像素範圍 ── */

function calcTightBounds(img){
  try{
    var SCAN = 200;
    var sc = Math.min(1, SCAN / Math.max(img.naturalWidth, img.naturalHeight));
    var sw = Math.max(1, Math.floor(img.naturalWidth  * sc));
    var sh = Math.max(1, Math.floor(img.naturalHeight * sc));
    var tmp = document.createElement('canvas');
    tmp.width = sw; tmp.height = sh;
    var tx = tmp.getContext('2d');
    tx.clearRect(0, 0, sw, sh);
    tx.drawImage(img, 0, 0, sw, sh);
    var d = tx.getImageData(0, 0, sw, sh).data;
    var x0=sw, y0=sh, x1=0, y1=0, found=false;
    for(var y=0; y<sh; y++){
      for(var x=0; x<sw; x++){
        if(d[(y*sw+x)*4+3] > 15){
          if(x<x0) x0=x; if(x>x1) x1=x;
          if(y<y0) y0=y; if(y>y1) y1=y;
          found=true;
        }
      }
    }
    if(!found) return null;
    var b={ x:x0/sc, y:y0/sc, w:(x1-x0+1)/sc, h:(y1-y0+1)/sc };
    console.log('[bounds] x='+Math.round(b.x)+' y='+Math.round(b.y)+' w='+Math.round(b.w)+' h='+Math.round(b.h));
    return b;
  } catch(e){ console.warn('[bounds] err:', e.message); return null; }
}