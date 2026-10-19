'use strict';
/* 影子顏色是否跟著背景取樣：這個專案影子顏色跟著背景色動（用色碼/背景設定），所以開著。要關掉改成 false。 */
var SHADOW_BIG_FOLLOW_BG = true;
console.log('%c[editor-shadow-canvas.js] 版本確認：2026-07-06-v2（含combo同步功能）', 'background:#222;color:#0f0;font-weight:bold;padding:2px 6px;');

/* ── 1200x1200 商品／人物 陰影合成畫布 ── */
var _shadowBigCanvas = null, _shadowBigCtx = null, _shadowBigReceiver = null, _shadowBigSimBg = null;
var _shadowBigInited = false;
var _shadowBigLastAngle = null;
var _shadowBigBgHex = null; // 目前已拿去給 ShadowPlugin.setBackground() 取樣的背景色（S.seedHex），換色才需要重新取樣

/* 影子吸取背景顏色（移植自 Circle）：模擬背景換了就用 ShadowPlugin.setBackground() 重新取樣
   背景的平均色當影子顏色（乘0.8變暗），1200 畫布上的影子顏色才會跟背景配；匯出的 PNG 影子顏色
   也是這個，貼到各版位才不會灰灰的。本專案的模擬背景是「背景顏色 S.seedHex」純色，
   所以這裡把純色做成一張小圖丟給 setBackground（它要 Image，且要 naturalWidth）。 */
function setShadowBigSimBg(img){
  _shadowBigSimBg = img;
  if(SHADOW_BIG_FOLLOW_BG && img && window.ShadowPlugin && ShadowPlugin.setBackground){
    try{ ShadowPlugin.setBackground(img); }catch(e){ console.warn('[shadow-compose] 影子取樣背景色失敗：', e); }
  }
  drawShadowBigCanvas();
}
/* 目前背景顏色換了（或第一次）就重新產生純色小圖並取樣；畫面上的底色仍由 drawShadowBigCanvas 直接填 S.seedHex，不用等圖載入 */
function syncShadowBigBgFromSeed(){
  if(!SHADOW_BIG_FOLLOW_BG) return;
  var hex = S.seedHex || '#d8d8d8';
  if(hex === _shadowBigBgHex) return;
  _shadowBigBgHex = hex;
  try{
    var c = document.createElement('canvas');
    c.width = 40; c.height = 40;
    var cctx = c.getContext('2d');
    cctx.fillStyle = hex; cctx.fillRect(0,0,40,40);
    var img = new Image();
    img.onload = function(){ if(_shadowBigBgHex === hex) setShadowBigSimBg(img); };
    img.src = c.toDataURL('image/png');
  }catch(e){ console.warn('[shadow-compose] 無法建立背景取樣圖：', e); }
}

function initShadowBigCanvasOnce(){
  if(_shadowBigInited) return;
  _shadowBigCanvas = document.getElementById('shadow-compose-canvas');
  if(!_shadowBigCanvas || typeof ShadowLayoutReceiver === 'undefined') return;
  _shadowBigCtx = _shadowBigCanvas.getContext('2d');
  /* guides:true＝開啟對齊參考線與吸附（拖曳靠近畫布中心/邊緣自動吸附、旋轉靠近0°/45°/90°自動吸附、雙擊歸零），見 shadow-layout-receiver.js 上方 GUIDE_* 說明 */
  _shadowBigReceiver = ShadowLayoutReceiver.create(_shadowBigCanvas, { guides: true });
  _shadowBigReceiver.attachPointerEvents(drawShadowBigCanvas); // 直接在大畫布上拖曳/縮放商品與人物（點選會透過 LC_ACTIVE_CHANGED 自動同步回左側素材清單的選取高亮）

  /* 模擬背景＝目前的「背景顏色」（S.seedHex）純色，drawShadowBigCanvas() 每次畫都直接讀最新值；
     同時用 syncShadowBigBgFromSeed() 把這個顏色餵給 ShadowPlugin.setBackground() 取樣影子顏色。
     （原本「模擬背景 選擇檔案」上傳欄位已移除，背景一律跟著目前背景顏色。） */
  syncShadowBigBgFromSeed();

  /* 訂閱 shadow-editor-plugin 的狀態變更（版型/角度/素材/順序/選取），同步畫到這個大畫布上 */
  if(window.ShadowEditor){
    window.ShadowEditor.onStateChange(function(snapshot){ syncShadowBigCanvasFromState(snapshot); });
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

  /* 先清掉「大畫布目前有畫、但這次 snapshot 已經沒有資料」的素材（例如剛被使用者
     按縮圖右上角 × 刪除）——這個大畫布不是 iframe，收不到 broadcastToAllFrames 的
     LC_REMOVE_SLOT，要自己補送。 */
  _shadowBigReceiver.getEnabledOrder().forEach(function(id){
    if(!snapshot.slots || !snapshot.slots[id]){
      _shadowBigReceiver.handleMessage({ type:'LC_REMOVE_SLOT', slotId:id }, drawShadowBigCanvas);
    }
  });

  /* 全域光源角度改變時，把各素材個別設定的角度清掉（按『全部素材』就是全部一起改） */
  if(_shadowBigLastAngle !== null && _shadowBigLastAngle !== snapshot.angle && _shadowBigReceiver.clearAllLightAngles) _shadowBigReceiver.clearAllLightAngles();
  _shadowBigLastAngle = snapshot.angle;
  _shadowBigReceiver.handleMessage({ type:'LC_SET_ANGLE', preset: snapshot.angle }, drawShadowBigCanvas);
  /* 版型要先送，upsertSlot 才能正確判斷這個版型該用哪組 byCombo 位置 */
  _shadowBigReceiver.handleMessage({ type:'LC_SET_ENABLED', ids: snapshot.order || snapshot.enabled || [], combo: snapshot.combo }, drawShadowBigCanvas);
  var slotDefs = window.ShadowEditor.SLOT_DEFS;
  Object.keys(snapshot.slots).forEach(function(slotId){
    var def = slotDefs.filter(function(d){ return d.id===slotId; })[0];
    if(def){
      var ratio = snapshot.slotRatios ? snapshot.slotRatios[slotId] : undefined;
      _shadowBigReceiver.handleMessage({ type:'LC_UPSERT_SLOT', slotId:slotId, slotType:def.type, dataUrl:snapshot.slots[slotId], ratio:ratio }, drawShadowBigCanvas);
    }
  });
  _shadowBigReceiver.setSelectedSlots(snapshot.selectedIds || (snapshot.activeSlotId ? [snapshot.activeSlotId] : []));
  drawShadowBigCanvas();
  updateShadowBigOffsetPanel();
}

/* ── 陰影不超出畫布／陰影位移／個別光源角度（移植自 Circle shadow-popup.js，同 mcn-daibo）── */
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

function drawShadowBigCanvas(){
  if(!_shadowBigCtx) return;
  syncShadowBigBgFromSeed(); // 背景顏色換了就重新取樣影子顏色（每次畫都檢查，成本只是字串比對）
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
  /* 底色直接填目前的背景顏色 S.seedHex（純色，永遠是最新值） */
  _shadowBigCtx.fillStyle = S.seedHex || '#d8d8d8'; _shadowBigCtx.fillRect(0,0,1200,1200);
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

function openShadowPopup(){
  document.getElementById('popup-shadow').classList.add('open');
  initShadowBigCanvasOnce();
  syncShadowBigBgFromSeed(); // 每次開啟都對齊目前背景顏色（匯入後可能換過色）
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
    closePopup('shadow');
    toast('已匯出並套用到人物圖層，可在各版位畫布拖曳調整位置','ok',3500);
  }, 'image/png');
}


