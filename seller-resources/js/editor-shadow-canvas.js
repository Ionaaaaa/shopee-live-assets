'use strict';
console.log('%c[editor-shadow-canvas.js] 版本確認：2026-10-19-v3（含combo同步＋影子吸取背景色／對齊吸附／陰影位移與個別光源角度，移植自 Circle）', 'background:#222;color:#0f0;font-weight:bold;padding:2px 6px;');

/* ── 1200x1200 商品／人物 陰影合成畫布 ── */
var _shadowBigCanvas = null, _shadowBigCtx = null, _shadowBigReceiver = null, _shadowBigSimBg = null;
var _shadowBigInited = false;
var _shadowBigLastAngle = null;

/* 模擬背景一律走這支（移植自 Circle）：換背景圖時用 ShadowPlugin.setBackground() 取樣背景色當影子顏色
   （乘0.8變暗）；沒有背景圖（null）時退回「背景顏色」純色填底，影子色改由 drawShadowBigCanvas() 內的
   setBackgroundColor() 依 S.seedHex 算，所以這裡把快取清掉讓它重算一次。 */
function setShadowBigSimBg(img){
  _shadowBigSimBg = img;
  if(img && window.ShadowPlugin && ShadowPlugin.setBackground){
    try{ ShadowPlugin.setBackground(img); }catch(e){ console.warn('[shadow-compose] 影子取樣背景色失敗：', e); }
  }
  _shadowBigLastColorHex = null;
  drawShadowBigCanvas();
}

function initShadowBigCanvasOnce(){
  if(_shadowBigInited) return;
  _shadowBigCanvas = document.getElementById('shadow-compose-canvas');
  if(!_shadowBigCanvas || typeof ShadowLayoutReceiver === 'undefined') return;
  _shadowBigCtx = _shadowBigCanvas.getContext('2d');
  _shadowBigReceiver = ShadowLayoutReceiver.create(_shadowBigCanvas, { guides: true }); /* guides:true＝對齊參考線與吸附，見 shadow-layout-receiver.js 上方 GUIDE_* 說明 */
  _shadowBigReceiver.attachPointerEvents(drawShadowBigCanvas); // 直接在大畫布上拖曳/縮放商品與人物（點選會透過 LC_ACTIVE_CHANGED 自動同步回左側素材清單的選取高亮）

  /* 模擬背景預設用目前的「背景顏色」（S.seedHex）即時填色，不用另外載入圖檔——
     drawShadowBigCanvas() 每次畫都會直接讀 S.seedHex 最新值，所以背景顏色換了、
     或這次陰影面板是換到別的分頁後才打開，看到的都會是當下正確的顏色。
     使用者上傳自訂模擬背景圖（下面 bgInput）的話，圖片優先權比顏色高。 */

  var bgInput = document.getElementById('shadow-compose-bg-file');
  if(bgInput){
    bgInput.addEventListener('change', function(e){
      var f = e.target.files[0]; if(!f) return;
      var reader = new FileReader();
      reader.onload = function(ev){
        var img = new Image();
        img.onload = function(){
          setShadowBigSimBg(img); // 使用者手動上傳了模擬背景圖：取樣這張圖本身的顏色當影子色（圖片優先權比顏色高）
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(f);
    });
  }

  /* 訂閱 shadow-editor-plugin 的狀態變更（版型/角度/素材/順序/選取），同步畫到這個大畫布上 */
  if(window.ShadowEditor){
    window.ShadowEditor.onStateChange(function(snapshot){ syncShadowBigCanvasFromState(snapshot); });
    /* 陰影 X/Y 縮放改走輕量訂閱：拖曳滑桿時高頻觸發，直接呼叫 receiver.setShadowScale()
       只改兩個數字＋重繪，不要走 onStateChange 那條「整包 slot 重新 upsert（含重新載入
       圖片、重建輪廓）」的路徑，不然拖曳滑桿時畫面會明顯卡頓。 */
    if(window.ShadowEditor.onShadowScaleChange){
      window.ShadowEditor.onShadowScaleChange(function(slotId, scaleX, scaleY){
        if(_shadowBigReceiver) _shadowBigReceiver.setShadowScale(slotId, scaleX, scaleY, drawShadowBigCanvas);
      });
    }
  }

  bindShadowBigOffsetPanel();
  _shadowBigInited = true;
}

/* 圖層前後順序跟選取狀態，統一以 shadow-editor-plugin.js 的 state.order / activeSlotId 為唯一資料來源
   （左側素材清單就是操作介面：拖曳排序、右上角刪除、點縮圖選取），這裡只負責同步畫出來，不再自己維護一份順序 */
function syncShadowBigCanvasFromState(snapshot){
  if(!_shadowBigReceiver) return;
  snapshot = snapshot || (window.ShadowEditor && window.ShadowEditor.getFullState());
  if(!snapshot) return;
  /* 全域光源角度改變時，把各素材個別設定的角度清掉（跟 Circle 一致：按『全部素材』就是全部一起改） */
  if(_shadowBigLastAngle !== null && _shadowBigLastAngle !== snapshot.angle && _shadowBigReceiver.clearAllLightAngles) _shadowBigReceiver.clearAllLightAngles();
  _shadowBigLastAngle = snapshot.angle;
  _shadowBigReceiver.handleMessage({ type:'LC_SET_ANGLE', preset: snapshot.angle }, drawShadowBigCanvas);
  /* 全域陰影開關：關掉/開啟所有素材的陰影，直接呼叫 ShadowPlugin.setShadowsEnabled，
     跟商品的位置/縮放無關，順序放哪裡都可以 */
  _shadowBigReceiver.handleMessage({ type:'LC_SET_SHADOWS_ENABLED', enabled: snapshot.shadowsEnabled !== false }, drawShadowBigCanvas);
  /* 版型要先送，upsertSlot 才能正確判斷這個版型該用哪組 byCombo 位置 */
  _shadowBigReceiver.handleMessage({ type:'LC_SET_ENABLED', ids: snapshot.order || snapshot.enabled || [], combo: snapshot.combo }, drawShadowBigCanvas);
  var slotDefs = window.ShadowEditor.SLOT_DEFS;
  Object.keys(snapshot.slots).forEach(function(slotId){
    var def = slotDefs.filter(function(d){ return d.id===slotId; })[0];
    if(def){
      var ratio = snapshot.slotRatios ? snapshot.slotRatios[slotId] : undefined;
      _shadowBigReceiver.handleMessage({ type:'LC_UPSERT_SLOT', slotId:slotId, slotType:def.type, dataUrl:snapshot.slots[slotId], ratio:ratio }, drawShadowBigCanvas);
      /* 陰影 X/Y 縮放：每個 slot 各自獨立的比例，沒調過的 slot 這裡會是 undefined，
         upsertSlot() 建立新 slot 時本來就會給預設值 1/1，所以這裡只在「有值」時才送 */
      var sc = snapshot.shadowScale ? snapshot.shadowScale[slotId] : undefined;
      if(sc) _shadowBigReceiver.handleMessage({ type:'LC_SET_SHADOW_SCALE', slotId:slotId, scaleX:sc.x, scaleY:sc.y }, drawShadowBigCanvas);
    }
  });
  _shadowBigReceiver.setSelectedSlots(snapshot.selectedIds || (snapshot.activeSlotId ? [snapshot.activeSlotId] : []));
  drawShadowBigCanvas();
  updateShadowBigOffsetPanel();
}

/* ── 陰影不超出畫布／陰影位移／個別光源角度（移植自 Circle shadow-popup.js）── */
var SHADOW_BIG_EDGE_FADE_PX = 50; // 影子離1200畫布邊緣50px內漸漸淡掉，超出的淡尾巴不會變成硬切線

function _shadowBigSlotType(id){
  var defs = (window.ShadowEditor && window.ShadowEditor.SLOT_DEFS) || [];
  var d = defs.filter(function(x){ return x.id === id; })[0];
  return d ? d.type : null;
}
/* 這個素材目前的光源角度：自己有設定就用自己的，沒有就跟「全部素材」那組一樣 */
function _shadowBigSlotLightAngle(id){
  var own = _shadowBigReceiver && _shadowBigReceiver.getLightAngle ? _shadowBigReceiver.getLightAngle(id) : null;
  if(own) return own;
  var st = window.ShadowEditor && window.ShadowEditor.getFullState && window.ShadowEditor.getFullState();
  return (st && st.angle) || '';
}
/* 依光源角度算影子左右伸出比例（實測約0.24倍商品高度，往光源反側伸）；讀不到角度時兩側都預留 */
function _shadowBigSlotExtra(id){
  var a = _shadowBigSlotLightAngle(id);
  return { l: (a === 'right' || !a) ? 0.24 : 0, r: (a === 'left' || !a) ? 0.24 : 0 };
}
function _drawShadowBigItemsFaded(ctx){
  if(window.ShadowPlugin && ShadowPlugin.setEdgeFade) ShadowPlugin.setEdgeFade(SHADOW_BIG_EDGE_FADE_PX);
  try { _shadowBigReceiver.drawItems(ctx); }
  finally { if(window.ShadowPlugin && ShadowPlugin.setEdgeFade) ShadowPlugin.setEdgeFade(0); }
}
var _shadowBigToastTimer = null;
function showShadowBigEdgeToast(msg){
  var stage = _shadowBigCanvas && _shadowBigCanvas.parentElement;
  if(!stage) return;
  stage.style.position = stage.style.position || 'relative';
  var el = stage.querySelector('.shadow-edge-toast');
  if(!el){
    el = document.createElement('div');
    el.className = 'shadow-edge-toast';
    el.style.cssText = 'position:absolute;left:50%;top:14px;transform:translateX(-50%);background:rgba(20,20,20,.88);color:#fff;font-size:13px;padding:8px 14px;border-radius:8px;pointer-events:none;z-index:5;white-space:nowrap;transition:opacity .2s;';
    stage.appendChild(el);
  }
  el.textContent = msg || '陰影避免超出畫布';
  el.style.opacity = '1';
  if(_shadowBigToastTimer) clearTimeout(_shadowBigToastTimer);
  _shadowBigToastTimer = setTimeout(function(){ el.style.opacity = '0'; }, 1600);
}

/* 記住上一次已經套用給 ShadowPlugin 的背景色，只有色碼真的變了才重新計算＋重新
   tint 商品陰影——這支函式在拖曳/縮放商品時會被高頻呼叫，避免每一影格都白算一次。 */
var _shadowBigLastColorHex = null;

function drawShadowBigCanvas(){
  if(!_shadowBigCtx) return;
  /* 商品＋貼地影子不能超出1200畫布：每次重畫前先對每個商品呼叫 constrainSlot()，
     超出就等比縮小再夾回範圍（留1%邊界）。人物（光暈型）允許超出，不鎖定。 */
  if(_shadowBigReceiver.constrainSlot){
    _shadowBigReceiver.getEnabledOrder().forEach(function(id){
      if(_shadowBigSlotType(id) !== 'product') return;
      var ex = _shadowBigSlotExtra(id);
      _shadowBigReceiver.constrainSlot(id, 1200, 1200, 0.01, ex.l, ex.r, 0.02);
    });
  }
  _shadowBigCtx.clearRect(0,0,1200,1200);
  if(_shadowBigSimBg){
    _shadowBigCtx.drawImage(_shadowBigSimBg,0,0,1200,1200);
  } else {
    var hex = S.seedHex || '#d8d8d8';
    _shadowBigCtx.fillStyle = hex;
    _shadowBigCtx.fillRect(0,0,1200,1200);
    /* 陰影顏色依照目前的「背景顏色」自動調整，不要固定寫死一個灰色——
       換色票、或匯入工單帶新背景色，商品貼地陰影要跟著換色調（深色背景陰影也偏深，
       淺色背景陰影也偏淺），道理跟 color-theme-engine.js 的地平線陰影一樣。 */
    if(typeof ShadowPlugin !== 'undefined' && hex !== _shadowBigLastColorHex){
      _shadowBigLastColorHex = hex;
      ShadowPlugin.setBackgroundColor(hex);
    }
  }
  _drawShadowBigItemsFaded(_shadowBigCtx);
}

/* 陰影獨立位置位移面板：只在「單選、且該素材已有圖」時顯示。位移量是畫布寬/高的比例（-0.3~0.3），
   每個素材各自記住（見 shadow-layout-receiver.js 的 setShadowOffset/getShadowOffset）。 */
function fmtShadowBigOffset(v){ var n = Math.round(v*100); return (n>0?'+':'')+n+'%'; }
function updateShadowBigOffsetPanel(){
  var panel = document.getElementById('shadow-offset-panel');
  if(!panel || !_shadowBigReceiver || !_shadowBigReceiver.getShadowOffset) return;
  var active = _shadowBigReceiver.getActiveSlot();
  var selected = _shadowBigReceiver.getSelectedSlots();
  var show = !!(active && selected.length <= 1 && _shadowBigReceiver.getEnabledOrder().indexOf(active) !== -1);
  panel.style.display = show ? '' : 'none';
  if(!show) return;
  var off = _shadowBigReceiver.getShadowOffset(active);
  document.getElementById('shadow-offset-x').value = off.x;
  document.getElementById('shadow-offset-y').value = off.y;
  document.getElementById('shadow-offset-x-val').textContent = fmtShadowBigOffset(off.x);
  document.getElementById('shadow-offset-y-val').textContent = fmtShadowBigOffset(off.y);
  var la = _shadowBigSlotLightAngle(active);
  panel.querySelectorAll('[data-slot-angle]').forEach(function(b){ b.classList.toggle('active', b.dataset.slotAngle === la); });
}

/* 陰影推到畫布邊緣就停住：新位移會讓「商品＋影子」比原本更超出時，二分找最遠還能放的位移值停在那裡，
   並提示「陰影避免超出畫布」，商品不動。人物（光暈）本來就允許超出，不檢查。 */
function applyShadowBigOffset(axis, input){
  var active = _shadowBigReceiver.getActiveSlot();
  if(!active) return;
  var want = Number(input.value);
  var cur = _shadowBigReceiver.getShadowOffset(active)[axis];
  var val = want;
  if(_shadowBigSlotType(active) === 'product' && _shadowBigReceiver.shadowOverflow){
    var ex = _shadowBigSlotExtra(active);
    var over = function(v){
      _shadowBigReceiver.setShadowOffset(active, axis, v);
      return _shadowBigReceiver.shadowOverflow(active, 1200, 1200, 0.01, ex.l, ex.r, 0.02);
    };
    var base = over(cur);
    if(over(want) > base + 0.5){
      var lo = cur, hi = want; // lo＝不會更超出、hi＝會更超出
      for(var i=0; i<18; i++){ var mid = (lo+hi)/2; if(over(mid) > base + 0.5) hi = mid; else lo = mid; }
      val = lo;
      input.value = val;
      showShadowBigEdgeToast('陰影避免超出畫布');
    }
  }
  document.getElementById('shadow-offset-'+axis+'-val').textContent = fmtShadowBigOffset(val);
  _shadowBigReceiver.setShadowOffset(active, axis, val, drawShadowBigCanvas);
}

function bindShadowBigOffsetPanel(){
  var panel = document.getElementById('shadow-offset-panel');
  if(!panel || panel.dataset.bound) return;
  panel.dataset.bound = '1';
  var offX = document.getElementById('shadow-offset-x');
  var offY = document.getElementById('shadow-offset-y');
  offX.oninput = function(){ applyShadowBigOffset('x', offX); };
  offY.oninput = function(){ applyShadowBigOffset('y', offY); };
  panel.querySelectorAll('[data-slot-angle]').forEach(function(btn){
    btn.onclick = function(){
      var active = _shadowBigReceiver.getActiveSlot();
      if(!active || !_shadowBigReceiver.setLightAngle) return;
      _shadowBigReceiver.setLightAngle(active, btn.dataset.slotAngle, drawShadowBigCanvas);
      updateShadowBigOffsetPanel();
    };
  });
  document.getElementById('shadow-offset-reset').onclick = function(){
    var active = _shadowBigReceiver.getActiveSlot();
    if(!active) return;
    _shadowBigReceiver.setShadowOffset(active, 'x', 0);
    _shadowBigReceiver.setShadowOffset(active, 'y', 0, drawShadowBigCanvas);
    updateShadowBigOffsetPanel();
  };
  /* 點選畫布上的素材時（receiver 會 postMessage LC_SELECTION_CHANGED），面板跟著更新 */
  window.addEventListener('message', function(e){
    if(e.data && e.data.type === 'LC_SELECTION_CHANGED') setTimeout(updateShadowBigOffsetPanel, 0);
  });
}

/* 換公版後提醒重新確認陰影（做法同 Circle editor-main.js 的 showShadowStaleNotice）：
   已經烤好的商品合成圖（S.imgs.host）裡的陰影顏色還是舊公版的，要重新確認一次才會刷新。
   畫面上方顯示提示，點「重新確認」直接打開陰影面板，按「確認並匯出」完成後自動消失。
   還沒有任何合成圖時不需要提示。 */
function showShadowStaleNotice(){
  if(!(S.imgs && S.imgs.host)) return;
  S._shadowStale = true;
  var el = document.getElementById('shadow-stale-notice');
  if(!el){
    el = document.createElement('div');
    el.id = 'shadow-stale-notice';
    el.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:900;background:#2a2118;border:1px solid #ee4d2d;color:#fff;border-radius:8px;padding:10px 14px;font-size:13px;display:flex;align-items:center;gap:12px;box-shadow:0 6px 20px rgba(0,0,0,.45);';
    el.innerHTML = '<span>公版已更換，商品的陰影顏色尚未更新，請重新確認一次。</span>'+
      '<button class="tbtn primary" id="shadow-stale-btn" style="padding:4px 10px;">重新確認</button>'+
      '<button class="tbtn" id="shadow-stale-x" style="padding:4px 8px;">×</button>';
    document.body.appendChild(el);
    el.querySelector('#shadow-stale-btn').onclick = function(){ openShadowPopup(); };
    el.querySelector('#shadow-stale-x').onclick = clearShadowStaleNotice;
  }
  el.style.display = 'flex';
}
function clearShadowStaleNotice(){
  S._shadowStale = false;
  var el = document.getElementById('shadow-stale-notice');
  if(el) el.style.display = 'none';
}


function openShadowPopup(){
  document.getElementById('popup-shadow').classList.add('open');
  initShadowBigCanvasOnce();
  syncShadowBigCanvasFromState(); // popup 開啟當下就把目前狀態畫上去（例如匯入工單已經比對好的素材）
}

/* 匯出：把大畫布上目前的商品＋陰影攤平成一張 1200x1200 PNG，
   丟進既有的「人物」圖層管線──每個版位本來就能各自拖曳/拉角調整這張圖的位置與大小，
   等於「一鍵 resize」，不用另外幫每個版位重寫拖曳邏輯。

   為什麼陰影拉到 layout 上會變灰灰的、以及這裡怎麼修：
   陰影套件的陰影是用 canvas 的 'multiply'（正片疊底）混合模式畫上去的，
   這種模式需要疊在「真正的底圖顏色」上運算才會自然變暗；
   如果直接畫在全透明的畫布上，因為底色被當成黑色，multiply 出來的陰影
   會變成一坨半透明的灰黑色，貼到 layout 真正的背景上當然就是灰灰的、對不起來。

   為什麼商品/人物照片也會跟著變得像正片疊底：
   前一版的修法是把「陰影+照片」畫在一起再整張去白算透明度，
   但這樣沒辦法分辨「這裡是陰影淡出」還是「這裡本來就是照片裡的淺色/白色」，
   照片裡任何偏白/偏淺的內容（例如白上衣、淺色頭髮）都會被誤判成陰影淡出而被
   加上透明度，貼到新背景上看起來就像整張照片也被正片疊底處理過一樣。

   修法：陰影跟照片「分開兩層畫」──
   1) 陰影單獨畫在不透明白底上（skipPhoto，不含照片），只有陰影本身時才安全用
      「去白算透明度」還原成正確的半透明黑色陰影；
   2) 照片單獨畫在透明底上（renderPhotosOnly，完全不經過陰影運算），保留原始像素，
      不會被誤判透明；
   3) 兩層合成：先貼陰影（已經是正確的半透明黑），再疊上完整不透明的照片。
   這樣輸出的 PNG 用一般疊圖方式貼到任何背景上，陰影自然變暗，照片維持原本樣子。 */
function exportShadowComposite(){
  if(!_shadowBigReceiver || typeof ShadowPlugin === 'undefined'){ toast('陰影畫布尚未就緒','err'); return; }
  var states = _shadowBigReceiver.getOrderedStates();
  if(!states.length){ toast('目前沒有任何素材可以匯出','err'); return; }

  ShadowPlugin.configureZone(1200*0.1, 1200*0.95);

  /* 第 1 層：只有陰影（不透明白底，才能正確用 multiply 運算，再去白轉透明） */
  var shadowCv = document.createElement('canvas');
  shadowCv.width = 1200; shadowCv.height = 1200;
  var sctx = shadowCv.getContext('2d');
  sctx.fillStyle = '#ffffff';
  sctx.fillRect(0,0,1200,1200);
  if(ShadowPlugin.setEdgeFade) ShadowPlugin.setEdgeFade(SHADOW_BIG_EDGE_FADE_PX); // 匯出也一樣淡出，跟畫面上看到的一致
  try { ShadowPlugin.renderScene(sctx, states, true); } // skipPhoto=true，只畫陰影
  finally { if(ShadowPlugin.setEdgeFade) ShadowPlugin.setEdgeFade(0); }

  try{
    var imgData = sctx.getImageData(0,0,1200,1200);
    var d = imgData.data;
    for (var i=0; i<d.length; i+=4){
      var r=d[i], g=d[i+1], b=d[i+2];
      var alpha = 255 - Math.min(r,g,b); // 離白色越遠＝越不透明（這裡只有陰影，安全）
      if (alpha <= 1){ d[i]=0; d[i+1]=0; d[i+2]=0; d[i+3]=0; continue; }
      d[i]   = Math.max(0, Math.min(255, 255 - (255-r)*255/alpha));
      d[i+1] = Math.max(0, Math.min(255, 255 - (255-g)*255/alpha));
      d[i+2] = Math.max(0, Math.min(255, 255 - (255-b)*255/alpha));
      d[i+3] = alpha;
    }
    sctx.putImageData(imgData, 0, 0);
  } catch(e){
    console.warn('[shadow-compose] 陰影去白轉透明失敗：', e);
  }

  /* 第 2 層：只有照片本體（透明底，原始像素，不經過任何去背景色運算） */
  var photoCv = document.createElement('canvas');
  photoCv.width = 1200; photoCv.height = 1200;
  var pctx = photoCv.getContext('2d');
  ShadowPlugin.renderPhotosOnly(pctx, states);

  /* 合成：先貼陰影，再疊照片 */
  var outCv = document.createElement('canvas');
  outCv.width = 1200; outCv.height = 1200;
  var octx = outCv.getContext('2d');
  octx.drawImage(shadowCv, 0, 0);
  octx.drawImage(photoCv, 0, 0);

  outCv.toBlob(function(blob){
    if(!blob){ toast('匯出失敗','err'); return; }
    var file = new File([blob], 'shadow-composite.png', { type:'image/png' });
    applyImageFile(file, 'host'); // 沿用現有人物圖層管線，各版位可各自拖曳/縮放定位
    clearShadowStaleNotice();
    closePopup('shadow');
    toast('已匯出並套用到人物圖層，可在各版位畫布拖曳調整位置','ok',3500);
  }, 'image/png');
}


