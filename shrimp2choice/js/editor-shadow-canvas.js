'use strict';
console.log('%c[editor-shadow-canvas.js] 版本確認：2026-07-21-v3（合併進popup-logo2＋分頁位置記憶＋callback修正）', 'background:#222;color:#0f0;font-weight:bold;padding:2px 6px;');

/* ── 1200x1200 商品／主持人 陰影合成畫布 ── */
var _shadowBigCanvas = null, _shadowBigCtx = null, _shadowBigReceiver = null, _shadowBigSimBg = null;
var _shadowBigInited = false;

/* 記住「每個分頁最後一次的畫布位置」，讓同一次操作期間來回切分頁／重新點進1200畫布
   不用每次都重新調整——只有這個分頁「從來沒被人手動調過、還是第一批廣播進來的原始
   狀態」時才會套用 shadow-layout-defaults.js 的預設位置，調過一次之後就一路沿用。
   用 tab.data 物件本身（不是分頁的序號 index）當 WeakMap 的 key：重新匯入另一份
   工單會產生全新的資料物件，舊的 key 天然對不到，不用另外寫清除邏輯；分頁被砍掉後
   對應的記憶也會被瀏覽器自動回收，不會累積記憶體。
   這份記憶只活在這次瀏覽器分頁還開著的期間——重新整理頁面、關掉重開、或整包工單
   重新匯入都會重置，這是刻意的取捨（範圍越大，改動風險越高）。 */
var _canvasTabPositions = new WeakMap(); // tab.data -> { slotId: {x,y,w0,h0,scaleMul,tight} }
var _canvasCurrentTabData = null;        // 記住「畫布現在顯示的是哪一頁」，硬重置當下用來判斷要把位置存回哪一頁

/* 強制畫布顯示區域維持正方形（1200x1200 內部解析度是正方形，顯示尺寸也一定要是正方形，
   不然商品/陰影會被非等比拉伸變形，選取框跟拖曳座標換算也會跟著算錯）。
   單純用 CSS width:auto+height:auto+max-width+max-height+aspect-ratio 這組合，
   在巢狀 flex/grid 容器（右區塊 grid-template-columns:200px minmax(0,1fr)）裡
   曾經算出不是正方形的框——這裡改成用 JS 直接量測容器可用寬度，跟 max-height
   取最小值後，寫死成相等的 style.width/style.height（正方形），不依賴瀏覽器
   怎麼解讀那組 CSS 組合。跟 editor-logo2-canvas.js 的 logo2ResizeCanvasToShape()
   是同一個思路（畫布顯示尺寸由 JS 主動控制，不賭 CSS）。 */
function sizeShadowBigCanvasBox(){
  if(!_shadowBigCanvas) return;
  var parent = _shadowBigCanvas.parentElement;
  var maxH = 480;
  var availW = maxH;
  if(parent){
    var cs = window.getComputedStyle(parent);
    var padL = parseFloat(cs.paddingLeft) || 0;
    var padR = parseFloat(cs.paddingRight) || 0;
    availW = parent.clientWidth - padL - padR;
  }
  if(availW <= 0) availW = maxH;
  var side = Math.max(120, Math.min(availW, maxH));
  _shadowBigCanvas.style.width = side + 'px';
  _shadowBigCanvas.style.height = side + 'px';
}
window.addEventListener('resize', sizeShadowBigCanvasBox);

function initShadowBigCanvasOnce(){
  if(_shadowBigInited) return;
  _shadowBigCanvas = document.getElementById('shadow-compose-canvas');
  if(!_shadowBigCanvas || typeof ShadowLayoutReceiver === 'undefined') return;
  sizeShadowBigCanvasBox();
  _shadowBigCtx = _shadowBigCanvas.getContext('2d');
  _shadowBigReceiver = ShadowLayoutReceiver.create(_shadowBigCanvas);
  _shadowBigReceiver.attachPointerEvents(drawShadowBigCanvas); // 直接在大畫布上拖曳/縮放商品與主持人（點選會透過 LC_ACTIVE_CHANGED 自動同步回左側素材清單的選取高亮）

  /* 復原（Ctrl+Z）：跟Logo2畫布是各自獨立的兩套堆疊，這裡只是把這個畫布
     自己的復原功能註冊給通用分派器（見 editor-canvas-ui.js 的 window.BNUndo），
     實際的堆疊/復原邏輯都在 shadow-layout-receiver.js 裡，這裡完全不用碰。 */
  if(window.BNUndo){
    window.BNUndo.register({
      peekTs: function(){ return _shadowBigReceiver ? _shadowBigReceiver.peekUndoTs() : 0; },
      undo: function(){ if(_shadowBigReceiver) _shadowBigReceiver.undo(drawShadowBigCanvas); }
    });
  }

  /* 預設模擬背景：backgrounds/1200bg.jpg（純預覽用，匯出時不會包含這張背景）。
     用 if(!_shadowBigSimBg) 才寫入——避免使用者已經上傳自訂模擬背景圖之後，
     這張預設圖才慢慢載入完成，反而把使用者剛選的圖蓋掉。 */
  var defaultBg = new Image();
  defaultBg.onload = function(){ if(!_shadowBigSimBg) _shadowBigSimBg = defaultBg; drawShadowBigCanvas(); };
  defaultBg.onerror = function(){ console.warn('[shadow-compose] 找不到預設模擬背景 backgrounds/1200bg.jpg，改用灰底'); };
  defaultBg.src = 'backgrounds/1200bg.jpg';

  var bgInput = document.getElementById('shadow-compose-bg-file');
  if(bgInput){
    bgInput.addEventListener('change', function(e){
      var f = e.target.files[0]; if(!f) return;
      var reader = new FileReader();
      reader.onload = function(ev){
        var img = new Image();
        img.onload = function(){ _shadowBigSimBg = img; drawShadowBigCanvas(); };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(f);
    });
  }

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

  _shadowBigInited = true;
}

var _shadowBigLastSlotIds = []; // 記住「上一次同步」實際套用過的 slot id，這樣才知道這次少了哪些要移除，
                                 // 不要整個 LC_RESET_SLOTS 清空重來——那樣連使用者剛手動拖曳/縮放過的
                                 // 位置大小都會被沖掉，變成「每點一次商品就跳回預設狀態」。

/* 圖層前後順序跟選取狀態，統一以 shadow-editor-plugin.js 的 state.order / activeSlotId 為唯一資料來源
   （左側素材清單就是操作介面：拖曳排序、右上角刪除、點縮圖選取），這裡只負責同步畫出來，不再自己維護一份順序 */
function syncShadowBigCanvasFromState(snapshot){
  if(!_shadowBigReceiver) return;
  snapshot = snapshot || (window.ShadowEditor && window.ShadowEditor.getFullState());
  if(!snapshot) return;
  _shadowBigReceiver.handleMessage({ type:'LC_SET_ANGLE', preset: snapshot.angle }, drawShadowBigCanvas);
  /* 版型要先送，upsertSlot 才能正確判斷這個版型該用哪組 byCombo 位置 */
  _shadowBigReceiver.handleMessage({ type:'LC_SET_ENABLED', ids: snapshot.order || snapshot.enabled || [], combo: snapshot.combo }, drawShadowBigCanvas);
  var slotDefs = window.ShadowEditor.SLOT_DEFS;

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

  var savedForThisTab = _canvasTabPositions.get(_canvasCurrentTabData); // 這一頁如果調過位置，這裡會有值；沒調過（或還是第一次看到）就是 undefined
  newIds.forEach(function(slotId){
    var def = slotDefs.filter(function(d){ return d.id===slotId; })[0];
    if(def){
      var ratio = snapshot.slotRatios ? snapshot.slotRatios[slotId] : undefined;
      var savedPos = savedForThisTab ? savedForThisTab[slotId] : undefined;
      _shadowBigReceiver.handleMessage({ type:'LC_UPSERT_SLOT', slotId:slotId, slotType:def.type, dataUrl:snapshot.slots[slotId], ratio:ratio, savedPos:savedPos }, drawShadowBigCanvas);
    }
  });
  _shadowBigReceiver.setSelectedSlots(snapshot.selectedIds || (snapshot.activeSlotId ? [snapshot.activeSlotId] : []));
  drawShadowBigCanvas();
}

function drawShadowBigCanvas(){
  if(!_shadowBigCtx) return;
  _shadowBigCtx.clearRect(0,0,1200,1200);
  if(_shadowBigSimBg){ _shadowBigCtx.drawImage(_shadowBigSimBg,0,0,1200,1200); }
  else { _shadowBigCtx.fillStyle = '#ee4d2d'; _shadowBigCtx.fillRect(0,0,1200,1200); }
  _shadowBigReceiver.drawItems(_shadowBigCtx);
}

/* 匯出：把大畫布上目前的商品＋陰影攤平成一張 1200x1200 PNG，
   丟進既有的「主持人」圖層管線──每個版位本來就能各自拖曳/拉角調整這張圖的位置與大小，
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
   這樣輸出的 PNG 用一般疊圖方式貼到任何背景上，陰影自然變暗，照片維持原本樣子。

   cb(applied)：applied=true 表示真的有素材可以匯出、也真的套用完成才呼叫；
   沒有素材時 cb(false)，讓呼叫端（confirmLogo2AndShadow）知道這半邊沒有東西要處理，
   不會卡住整個確認流程。一定要等 applyImageFile 內部的 FileReader 真的讀完、
   S.imgs.host 真的寫入之後才能呼叫 cb()——不然接下來的動作（關 popup、切分頁等）
   會搶先在這張圖真正寫入之前就先執行，這張圖遲來的寫入動作就會誤存進「下一包」
   的資料裡，變成內容跳頁。 */
function composeShadow(cb){
  if(!_shadowBigReceiver || typeof ShadowPlugin === 'undefined'){ if(cb) cb(false); return; }
  var states = _shadowBigReceiver.getOrderedStates();
  if(!states.length){ if(cb) cb(false); return; }

  ShadowPlugin.configureZone(1200*0.1, 1200*0.95);

  /* 第 1 層：只有陰影（不透明白底，才能正確用 multiply 運算，再去白轉透明） */
  var shadowCv = document.createElement('canvas');
  shadowCv.width = 1200; shadowCv.height = 1200;
  var sctx = shadowCv.getContext('2d');
  sctx.fillStyle = '#ffffff';
  sctx.fillRect(0,0,1200,1200);
  ShadowPlugin.renderScene(sctx, states, true); // skipPhoto=true，只畫陰影

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
    if(!blob){ toast('陰影合成失敗','err'); if(cb) cb(false); return; }
    var file = new File([blob], 'shadow-composite.png', { type:'image/png' });
    /* keepPos：這裡的匯出可能是「重新打開陰影彈窗調整後再次確認」，也可能是這個分頁
       第一次設定商品——這兩種情況不能用iframe裡 D.host 是不是 null 來分辨，因為切到
       一個還沒確認過的全新分頁時，applyTabData() 因為這個分頁還沒有hostImg，走的是
       broadcast()（不含host欄位），D.host 不會被清空、會沿用上一個分頁留下的舊圖，
       導致「這是第一次」被誤判成「不是第一次」，新分頁第一次確認時就會錯誤沿用
       上一個分頁的位置/大小（不完整露出、比例不對）。
       改成用 tab.data 自己的旗標 _hostPositioned 判斷：這個分頁「已經成功套用過一次
       商品圖」才算不是第一次，第一次一律 keepPos=false 讓 initHostPos() 正常自動貼合，
       套用成功後才把旗標記上，之後同一分頁再次匯出（含逐包確認、手動重開陰影彈窗）
       才會保留使用者調整過的位置。旗標存在tab.data上，重新匯入工單會產生全新的
       tab.data物件，天然就是「這個分頁沒設定過」，不用額外清除邏輯。 */
    var tab = (typeof TABS !== 'undefined' && typeof ACTIVE_TAB !== 'undefined') ? TABS[ACTIVE_TAB] : null;
    var keepPos = !!(tab && tab.data && tab.data._hostPositioned);
    applyImageFile(file, 'host', function(){
      if(tab){ tab.data = tab.data || {}; tab.data._hostPositioned = true; }
      if(cb) cb(true);
    }, keepPos); // 沿用現有主持人圖層管線，各版位可各自拖曳/縮放定位
  }, 'image/png');
}

/* 供右側「編輯商品／主持人陰影」按鈕手動開啟這半邊——popup 已經合併進 popup-logo2，
   直接呼叫同一個開啟函式即可 */
function exportShadowComposite(){
  composeShadow(function(applied){
    if(!applied){ toast('目前沒有任何素材可以匯出','err'); return; }
    toast('已套用到主持人圖層，可在各版位畫布拖曳調整位置','ok',3500);
  });
}

/* ── popup-logo2 底部唯一的「確認並套用／下一包」按鈕：Logo2 跟商品／主持人陰影
   依序合成套用，兩邊都是「有素材才套用、沒有就跳過」，不會因為某個廠商
   沒有其中一種素材就卡住整個確認流程。一定要等 Logo2 那邊真的套用完
   （applyImageFile 的 callback）才開始處理陰影那邊，兩個都各自寫入
   S.imgs 之後才關 popup，避免非同步寫入順序跟畫面顯示對不上。

   逐包確認模式（_reviewActive，見 editor-logo2-canvas.js 的 startReviewFlow）
   下，這顆按鈕確認完當下這一包，會自動存檔＋切到下一個需要確認的廠商分頁、
   重新開這個彈窗，全部確認完才真正關窗；不是逐包確認模式（從側欄「編輯 Logo2」
   ／「編輯商品／主持人陰影」按鈕手動開的）就單純套用完直接關窗，不會跳分頁。 ── */
function confirmLogo2AndShadow(){
  var btn = document.getElementById('logo2-shadow-confirm-btn');
  if(btn) btn.disabled = true;
  pm.show('套用中');
  pm.update(20, '合成商品/主持人圖層…');
  composeLogo2(function(){
    pm.update(50, '合成陰影…');
    composeShadow(function(shadowApplied){
      if(btn) btn.disabled = false;
      if(!_reviewActive){
        closePopup('logo2');
        toast(shadowApplied ? '已套用到所有版位，可在各版位畫布拖曳調整位置' : '已套用', 'ok', 3000);
        pm.hide();
        return;
      }
      pm.update(70, '記錄目前分頁狀態…');
      saveCurrentTabState(function(){
        var idxs = _reviewTabIndices();
        var pos = idxs.indexOf(ACTIVE_TAB);
        var nextIdx = idxs[pos + 1];
        if(nextIdx === undefined){
          _reviewActive = false;
          closePopup('logo2');
          _updateReviewProgressUI();
          toast('已完成所有廠商分頁的確認', 'ok', 3000);
          pm.hide();
          return;
        }
        pm.update(85, '切換到下一包廠商…');
        switchTab(nextIdx, function(){
          _openReviewPanelForCurrentTab();
          pm.done('已切換到下一包');
          pm.hide();
        });
      });
    });
  });
}


