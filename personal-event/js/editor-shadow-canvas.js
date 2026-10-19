'use strict';
/* 影子顏色是否跟著背景取樣：這個專案影子顏色跟著背景色動（用色碼/背景設定），所以開著。要關掉改成 false。 */
var SHADOW_BIG_FOLLOW_BG = true;
console.log('%c[editor-shadow-canvas.js] 版本確認：2026-10-19-v3（含combo同步＋影子吸取背景色／對齊吸附／陰影位移與個別光源角度，移植自 Circle）', 'background:#222;color:#0f0;font-weight:bold;padding:2px 6px;');

/* ── 1200x1200 商品／人物 陰影合成畫布 ── */
var _shadowBigCanvas = null, _shadowBigCtx = null, _shadowBigReceiver = null, _shadowBigSimBg = null;
var _shadowBigInited = false;
var _shadowBigLastAngle = null;
var _shadowBigBgTheme = null; // 目前模擬背景對應的公版 key，公版換了就自動重抓

/* 影子吸取背景顏色（移植自 Circle）：模擬背景換了（換公版），就用 ShadowPlugin.setBackground()
   重新取樣背景下方的平均色當影子顏色（乘0.8變暗），1200 畫布上的影子顏色才會跟背景配；
   匯出的 PNG 影子顏色也是這個，貼到各版位才不會灰灰的。沒有背景（退回灰底）時不取樣，沿用目前的影子顏色。 */
function setShadowBigSimBg(img){
  _shadowBigSimBg = img;
  if(SHADOW_BIG_FOLLOW_BG && img && window.ShadowPlugin && ShadowPlugin.setBackground){
    try{ ShadowPlugin.setBackground(img); }catch(e){ console.warn('[shadow-compose] 影子取樣背景色失敗：', e); }
  }
  drawShadowBigCanvas();
}

/* 模擬背景：這個專案沒有 1200 畫布專用的背景圖，也不需要另外放——
   自動取「目前公版」背景圖 backgrounds/{公版}/02_lpbn.jpg 下方的平均色（跟影子取樣是同一塊區域），
   整個 1200 畫布填這個純色當底，影子顏色也就跟著公版走（乘 0.8 變暗）。
   純預覽用、不會被匯出。圖找不到就退回灰底。 */
function solidBgFromImage(src, cb){
  try{
    var c = document.createElement('canvas'); c.width = 40; c.height = 40;
    var cx = c.getContext('2d');
    var sampleH = Math.max(1, Math.floor(src.naturalHeight * 0.35));
    cx.drawImage(src, 0, src.naturalHeight - sampleH, src.naturalWidth, sampleH, 0, 0, 40, 40);
    var d = cx.getImageData(0, 0, 40, 40).data, r = 0, g = 0, b = 0, n = 0;
    for(var i = 0; i < d.length; i += 4){ r += d[i]; g += d[i+1]; b += d[i+2]; n++; }
    cx.fillStyle = 'rgb(' + Math.round(r/n) + ',' + Math.round(g/n) + ',' + Math.round(b/n) + ')';
    cx.fillRect(0, 0, 40, 40);
    var out = new Image();
    out.onload = function(){ cb(out); };
    out.src = c.toDataURL('image/png');
  }catch(e){ console.warn('[shadow-compose] 取公版背景平均色失敗：', e); cb(null); }
}
function loadShadowBigSimBgForTheme(themeKey){
  _shadowBigBgTheme = themeKey;
  var themeUrl = 'backgrounds/' + themeKey + '/02_lpbn.jpg';
  var img = new Image();
  img.onload = function(){
    solidBgFromImage(img, function(solid){ if(_shadowBigBgTheme === themeKey) setShadowBigSimBg(solid); });
  };
  img.onerror = function(){
    console.warn('[shadow-compose] 找不到公版背景 '+themeUrl+'，改用灰底');
    if(_shadowBigBgTheme === themeKey) setShadowBigSimBg(null);
  };
  img.src = themeUrl;
}
/* 記住「每個分頁最後一次的畫布位置」，讓同一次操作期間來回切分頁／重新點進1200畫布
   不用每次都重新調整——只有這個分頁「從來沒被人手動調過、還是第一批廣播進來的原始
   狀態」時才會套用 shadow-layout-defaults.js 的預設位置，調過一次之後就一路沿用。
   用 tab.data 物件本身（不是分頁的序號 index）當 WeakMap 的 key：重新匯入另一份
   工單會產生全新的資料物件，舊的 key 天然對不到，不用另外寫清除邏輯；分頁被砍掉後
   對應的記憶也會被瀏覽器自動回收，不會累積記憶體。
   這份記憶只活在這次瀏覽器分頁還開著的期間——重新整理頁面、關掉重開、或整包工單
   重新匯入都會重置，這是刻意的取捨（範圍越大，改動風險越高）。 */
var _canvasTabPositions = new WeakMap(); // tab.data -> { slotId: {x,y,w0,h0,scaleMul,rot,tight} }
var _canvasCurrentTabData = null;        // 記住「畫布現在顯示的是哪一頁」，硬重置當下用來判斷要把位置存回哪一頁

function initShadowBigCanvasOnce(){
  if(_shadowBigInited) return;
  _shadowBigCanvas = document.getElementById('shadow-compose-canvas');
  if(!_shadowBigCanvas || typeof ShadowLayoutReceiver === 'undefined') return;
  _shadowBigCtx = _shadowBigCanvas.getContext('2d');
  /* guides:true＝開啟對齊參考線與吸附（拖曳靠近畫布中心/邊緣自動吸附、旋轉靠近0°/45°/90°自動吸附、雙擊歸零），見 shadow-layout-receiver.js 上方 GUIDE_* 說明 */
  _shadowBigReceiver = ShadowLayoutReceiver.create(_shadowBigCanvas, { guides: true });
  _shadowBigReceiver.attachPointerEvents(drawShadowBigCanvas); // 直接在大畫布上拖曳/縮放商品與人物（點選會透過 LC_ACTIVE_CHANGED 自動同步回左側素材清單的選取高亮）

  loadShadowBigSimBgForTheme(S.theme); // 初次開啟：自動套用目前公版背景（沒有手動上傳背景的入口）

  /* 訂閱 shadow-editor-plugin 的狀態變更（版型/角度/素材/順序/選取），同步畫到這個大畫布上 */
  if(window.ShadowEditor){
    window.ShadowEditor.onStateChange(function(snapshot){ syncShadowBigCanvasFromState(snapshot); });
    /* 硬重置：只在「真的換了一份完全不同的資料」（切分頁／批次還原）時才會觸發，
       這時候位置/大小本來就該整個重來（跟 shadow-layout-receiver.js LC_RESET_SLOTS
       的註解同一個道理：舊位置對不上新資料）。跟上面 onStateChange 分開，才不會
       連使用者在畫布上點一下選取、或只是新增/移除單一素材這種小動作，也被當成
       整批換資料處理，害剛調好的位置被沖掉。 */
    if(window.ShadowEditor.onHardReset){
      window.ShadowEditor.onHardReset(function(){
        /* 換頁前先把「現在畫布上」的位置存進「上一頁」的格子——這時候
           _canvasCurrentTabData 還沒被更新，指的正是即將離開的那一頁。 */
        if(_canvasCurrentTabData && _shadowBigReceiver){
          var raw = _shadowBigReceiver.getRawSlotStates();
          if(raw && Object.keys(raw).length) _canvasTabPositions.set(_canvasCurrentTabData, raw);
        }
        if(_shadowBigReceiver) _shadowBigReceiver.handleMessage({ type:'LC_RESET_SLOTS' }, drawShadowBigCanvas);
        _shadowBigLastSlotIds = [];
        /* 更新成「現在要換到的這一頁」——ACTIVE_TAB/TABS 在 restoreState() 被呼叫的
           當下已經指向新分頁了（switchTab() 先設定 ACTIVE_TAB 才呼叫 applyTabData），
           所以這裡讀到的已經是正確的新分頁。之後 syncShadowBigCanvasFromState()
           重新套用 slot 時，會查這一頁在 _canvasTabPositions 裡有沒有存過位置。 */
        _canvasCurrentTabData = (typeof TABS !== 'undefined' && typeof ACTIVE_TAB !== 'undefined' && TABS[ACTIVE_TAB]) ? TABS[ACTIVE_TAB].data : null;
      });
    }
  }

  bindShadowBigOffsetPanel();
  _shadowBigInited = true;
}

/* 圖層前後順序跟選取狀態，統一以 shadow-editor-plugin.js 的 state.order / activeSlotId 為唯一資料來源
   （左側素材清單就是操作介面：拖曳排序、右上角刪除、點縮圖選取），這裡只負責同步畫出來，不再自己維護一份順序 */
var _shadowBigLastSlotIds = []; // 記住「上一次同步」實際套用過的 slot id，這樣才知道這次少了哪些要移除，
                                 // 不要整個 LC_RESET_SLOTS 清空重來——那樣連使用者剛手動拖曳/縮放過的
                                 // 位置大小都會被沖掉，變成「每點一次商品就跳回預設狀態」。
function syncShadowBigCanvasFromState(snapshot){
  if(!_shadowBigReceiver) return;
  snapshot = snapshot || (window.ShadowEditor && window.ShadowEditor.getFullState());
  if(!snapshot) return;
  var newIds = Object.keys(snapshot.slots || {});
  /* 只移除「上次套用過、這次卻不在了」的 slot（例如combo從3品切成2品少了商品3、
     或使用者在左側清單按刪除）——upsertSlot() 遇到「這個slot本來就存在」時本來就只換
     圖片、保留位置，這裡不用重複處理，只要處理「消失」這一種情況就好。 */
  _shadowBigLastSlotIds.forEach(function(id){
    if(newIds.indexOf(id) === -1){
      _shadowBigReceiver.handleMessage({ type:'LC_REMOVE_SLOT', slotId:id }, drawShadowBigCanvas);
    }
  });
  _shadowBigLastSlotIds = newIds;
  /* 公版換了（切分頁／匯入／下拉選單）就重抓背景，影子顏色才會跟著新公版 */
  if(window.S && S.theme && S.theme !== _shadowBigBgTheme) loadShadowBigSimBgForTheme(S.theme);
  /* 全域光源角度改變時，把各素材個別設定的角度清掉（跟 Circle 一致：按『全部素材』就是全部一起改） */
  if(_shadowBigLastAngle !== null && _shadowBigLastAngle !== snapshot.angle && _shadowBigReceiver.clearAllLightAngles) _shadowBigReceiver.clearAllLightAngles();
  _shadowBigLastAngle = snapshot.angle;
  _shadowBigReceiver.handleMessage({ type:'LC_SET_ANGLE', preset: snapshot.angle }, drawShadowBigCanvas);
  /* 版型要先送，upsertSlot 才能正確判斷這個版型該用哪組 byCombo 位置 */
  _shadowBigReceiver.handleMessage({ type:'LC_SET_ENABLED', ids: snapshot.order || snapshot.enabled || [], combo: snapshot.combo }, drawShadowBigCanvas);
  var slotDefs = window.ShadowEditor.SLOT_DEFS;
  var savedForThisTab = _canvasTabPositions.get(_canvasCurrentTabData); // 這一頁如果調過位置，這裡會有值；沒調過（或還是第一次看到）就是 undefined
  Object.keys(snapshot.slots).forEach(function(slotId){
    var def = slotDefs.filter(function(d){ return d.id===slotId; })[0];
    if(def){
      var ratio = snapshot.slotRatios ? snapshot.slotRatios[slotId] : undefined;
      var savedPos = savedForThisTab ? savedForThisTab[slotId] : undefined;
      _shadowBigReceiver.handleMessage({ type:'LC_UPSERT_SLOT', slotId:slotId, slotType:def.type, dataUrl:snapshot.slots[slotId], ratio:ratio, savedPos:savedPos }, drawShadowBigCanvas);
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
  if(_shadowBigSimBg && _shadowBigSimBg.naturalWidth){
    /* 等比例鋪滿（cover）置中裁切：公版背景是 1125x360 橫幅，不能直接拉伸成正方形 */
    var bw = _shadowBigSimBg.naturalWidth, bh = _shadowBigSimBg.naturalHeight;
    var sc = Math.max(1200/bw, 1200/bh);
    var sw = 1200/sc, sh = 1200/sc;
    _shadowBigCtx.drawImage(_shadowBigSimBg, (bw-sw)/2, (bh-sh)/2, sw, sh, 0, 0, 1200, 1200);
  }
  else { _shadowBigCtx.fillStyle = '#d8d8d8'; _shadowBigCtx.fillRect(0,0,1200,1200); }
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
    el.querySelector('#shadow-stale-btn').onclick = function(){
      /* 跟側欄「編輯 LOGO ＋ 曝品區」按鈕同一套開啟流程 */
      if(typeof _aReviewActive !== 'undefined') _aReviewActive = false;
      if(typeof _bReviewActive !== 'undefined') _bReviewActive = false;
      if(typeof _setLogo2ShadowSectionVisible === 'function') _setLogo2ShadowSectionVisible(true);
      if(typeof openLogo2Popup === 'function') openLogo2Popup();
      openShadowPopup();
    };
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
  /* 1200畫布區已經合併進 popup-logo2 同一個彈窗，這裡不用再另外開彈窗，
     只需要確保畫布初始化＋套用目前狀態（呼叫端負責先把 popup-logo2 打開）。 */
  document.getElementById('popup-logo2').classList.add('open');
  initShadowBigCanvasOnce();
  /* 每次開啟都重新對齊「目前公版」的背景（例如匯入後又換了公版） */
  if(_shadowBigInited && S.theme !== _shadowBigBgTheme) loadShadowBigSimBgForTheme(S.theme);
  syncShadowBigCanvasFromState(); // 開啟當下就把目前狀態畫上去（例如匯入工單已經比對好的素材）
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
function composeShadow(cb){
  if(!_shadowBigReceiver || typeof ShadowPlugin === 'undefined'){ toast('陰影畫布尚未就緒','err'); if(cb) cb(false); return; }
  var states = _shadowBigReceiver.getOrderedStates();
  if(!states.length){ if(cb) cb(false); return; }

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
    if(!blob){ toast('匯出失敗','err'); if(cb) cb(false); return; }
    var file = new File([blob], 'shadow-composite.png', { type:'image/png' });
    /* 一定要等 applyImageFile 內部的 FileReader 真的讀完、S.imgs.host 真的寫入
       之後才能呼叫 cb()——不然逐包確認流程接下來的 saveCurrentTabState()／
       switchTab() 會搶先在這張圖真正寫入之前就先存檔＋切分頁，這張圖遲來的
       寫入動作就會誤存進「下一包」的資料裡，變成內容跳頁。 */
    applyImageFile(file, 'host', function(){ clearShadowStaleNotice(); if(cb) cb(true); }); // 沿用現有人物圖層管線，各版位可各自拖曳/縮放定位
  }, 'image/png');
}

function exportShadowComposite(){
  composeShadow(function(applied){
    if(!applied){ toast('目前沒有任何素材可以匯出','err'); return; }
    closePopup('logo2');
    toast('已匯出並套用到人物圖層，可在各版位畫布拖曳調整位置','ok',3500);
  });
}


