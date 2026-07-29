'use strict';

function buildCanvasArea(){
  var area = document.getElementById('canvas-area');
  area.innerHTML = '';
  LAYOUTS.forEach(function(layout){
    var block = document.createElement('div');
    block.className = 'canvas-block';
    block.id = 'canvas-block-'+layout.id;

    block.innerHTML =
      '<div class="canvas-frame">'+
        '<div class="canvas-meta">'+
          '<span class="canvas-name">'+layout.name+'</span>'+
          '<span class="canvas-size">'+layout.w+' × '+layout.h+' px</span>'+
          '<label class="canvas-ref-btn" title="上傳參考圖（不輸出）">'+
            '🖼 參考層'+
            '<input type="file" accept="image/*" style="display:none" onchange="setRefLayer(\''+layout.id+'\',this)">'+
          '</label>'+
          '<button class="canvas-dl-btn" onclick="downloadSingle(\''+layout.id+'\')">⬇ 下載</button>'+
        '</div>'+
        '<div class="iframe-wrap" id="wrap-'+layout.id+'" style="position:relative;">'+
          '<img id="ref-'+layout.id+'" style="display:none;position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;pointer-events:none;z-index:999;" />'+
        '</div>'+
      '</div>';

    area.appendChild(block);

    /* 實測「畫布本體以外」實際佔掉的寬高（外框padding、標題列高度＋下方margin），
       取代原本用猜的固定常數。這樣算出來的可用空間才會準確，
       畫布縮小後會剛好完整落在可視範圍內，不會需要多捲動一截才看得到畫布下緣。 */
    var frameEl = block.querySelector('.canvas-frame');
    var metaEl  = block.querySelector('.canvas-meta');
    var wrap    = block.querySelector('#wrap-'+layout.id);

    var frameCS   = getComputedStyle(frameEl);
    var framePadX = parseFloat(frameCS.paddingLeft) + parseFloat(frameCS.paddingRight);
    var framePadY = parseFloat(frameCS.paddingTop)  + parseFloat(frameCS.paddingBottom);
    var metaCS    = getComputedStyle(metaEl);
    var chromeH   = framePadY + metaEl.getBoundingClientRect().height + parseFloat(metaCS.marginBottom);

    var areaRect  = area.getBoundingClientRect();
    var areaCS    = getComputedStyle(area);
    var areaPadX  = parseFloat(areaCS.paddingLeft) + parseFloat(areaCS.paddingRight);
    var areaPadTop = parseFloat(areaCS.paddingTop);
    var BOTTOM_GAP = 24; // 畫布底部留一點呼吸空間，不要整個頂到視窗最下緣

    var scaleByW = Math.min(1, (areaRect.width - areaPadX - framePadX) / layout.w);
    /* 開播字卡直式比例(1080x1920)幾乎都是高度吃緊，放大一點點讓它在畫布裡看起來大一些，
       跟案型字卡(card-plugin.js的CARD_ENLARGE)是同樣的處理方式。 */
    var ENLARGE = (layout.id === '04_opening') ? 1.3 : 1;
    var availH   = window.innerHeight - areaRect.top - areaPadTop - chromeH - BOTTOM_GAP;
    var scaleByH = Math.min(1, (availH * ENLARGE) / layout.h);

    var scale = Math.min(scaleByW, scaleByH);

    var iframe = document.createElement('iframe');
    iframe.src = 'layouts/'+layout.file;
    iframe.style.width  = layout.w + 'px';
    iframe.style.height = layout.h + 'px';
    iframe.style.transform = 'scale('+scale+')';
    iframe.style.transformOrigin = 'top left';
    wrap.style.width  = (layout.w * scale) + 'px';
    wrap.style.height = (layout.h * scale) + 'px';
    iframe.setAttribute('scrolling','no');
    wrap.appendChild(iframe);
    iframes[layout.id] = iframe;
  });
  updateAssetList();
  renderTabBar();
  /* 案型字卡（06_card）不在 LAYOUTS 清單裡（張數不固定），
     另外用 card-plugin.js 接在畫布區最下面，橫向排列 */
  if(typeof buildCardStrip === 'function') buildCardStrip();
  if(typeof renderCardPanel === 'function') renderCardPanel();
}

function updateAssetList(){
  var body = document.getElementById('asset-list-body');
  if(!body) return;
  var layouts = getLayouts();
  /* 案型字卡（06_card）不在 LAYOUTS 清單裡（張數不固定，見 editor-state.js
     DEFAULT_LAYOUTS 的註解），左側素材清單原本只讀 getLayouts()，
     所以06直播字卡永遠不會出現在左側——這裡另外把目前存在的每一張
     案型字卡（06_card_1 ~ 06_card_N）補進清單，跟其他版位一樣可以點擊捲動。 */
  var cardItems = [];
  if(typeof ensureCards === 'function'){
    ensureCards();
    for(var ci=0; ci<S.cardCount; ci++){
      cardItems.push({ id:'06_card_'+(ci+1), name:'案型字卡 第'+(ci+1)+'張', w:1080, h:1920, isCard:true });
    }
  }
  var allItems = layouts.concat(cardItems);
  if(!allItems.length){ body.innerHTML = '<div style="padding:20px 16px;font-size:12px;color:var(--text-dim);text-align:center;">無素材</div>'; return; }
  body.innerHTML = allItems.map(function(l){
    return '<div class="asset-item" id="asset-item-'+l.id+'" onclick="scrollToCanvas(\''+l.id+'\')">'+
      '<div class="asset-icon">'+
        '<svg viewBox="0 0 16 16"><rect x="2" y="2" width="12" height="12" rx="1"/><path d="M2 10l3-3 3 3 2-2 4 4"/></svg>'+
      '</div>'+
      '<div class="asset-info">'+
        '<div class="asset-name">'+l.name+'</div>'+
        '<div class="asset-meta">'+l.w+' × '+l.h+' px</div>'+
      '</div>'+
      '<button class="asset-dl" onclick="event.stopPropagation();downloadSingle(\''+l.id+'\')">↓</button>'+
    '</div>';
  }).join('');

  /* 監聽 canvas-area 滾動，更新 active 狀態 */
  var area = document.getElementById('canvas-area');
  if(area && !area._assetScrollBound){
    area._assetScrollBound = true;
    area.addEventListener('scroll', updateActiveAsset);
  }
  updateActiveAsset();
}

/* 版位畫布跟案型字卡的 DOM 容器命名方式不一樣（canvas-block-ID vs card-block-index），
   點左側清單要能同時捲到兩種區塊 */
function scrollToCanvas(id){
  var block = document.getElementById('canvas-block-'+id);
  if(!block && id.indexOf('06_card_') === 0){
    var idx = parseInt(id.split('_')[2], 10) - 1;
    block = document.getElementById('card-block-'+idx);
  }
  if(block) block.scrollIntoView({behavior:'smooth', block:'start'});
}

function updateActiveAsset(){
  var area = document.getElementById('canvas-area');
  if(!area) return;
  var areaTop = area.getBoundingClientRect().top;
  var closest = null, closestDist = Infinity;
  Object.keys(iframes).forEach(function(id){
    var block = document.getElementById('canvas-block-'+id);
    if(!block && id.indexOf('06_card_') === 0){
      var idx = parseInt(id.split('_')[2], 10) - 1;
      block = document.getElementById('card-block-'+idx);
    }
    if(!block) return;
    var dist = Math.abs(block.getBoundingClientRect().top - areaTop - 60);
    if(dist < closestDist){ closestDist = dist; closest = id; }
  });
  /* 只更新左側清單，不動分頁 tab */
  document.querySelectorAll('.asset-item').forEach(function(el){ el.classList.remove('active'); });
  if(closest){
    var active = document.getElementById('asset-item-'+closest);
    if(active) active.classList.add('active');
  }
}

/* ── broadcast：把所有資料推送給每個 iframe ── */
/* ── Broadcast：分兩種
   broadcastText() — 只傳文案/顏色，不傳圖片，畫布不會重設位置
   broadcastFull() — 含圖片，只在上傳/刪除/載入暫存時呼叫
── */
function broadcastPayload(payload){
  Object.keys(iframes).forEach(function(id){
    var ifr=iframes[id];
    if(ifr.contentWindow){
      ifr.contentWindow.postMessage({type:'BN_UPDATE',payload:payload},'*');
    }
  });
}

function broadcastText(){
  broadcastPayload({
    theme:   S.theme,
    bgBase:  S.bgUrls[S.theme],  // e.g. '../backgrounds/A/'
    main:    v('txt-main'),
    sub:     v('txt-sub'),
    date:    v('txt-date'),
    time:    v('txt-time'),
    brand:   v('txt-brand'),
    guest:   v('txt-guest'),
    flText:  v('txt-fl'),
    flTheme: S.flTheme,
    flStyle: S.flStyle,
    combo:   (window.ShadowEditor && window.ShadowEditor.getCombo()) || null, // 目前版型A/B/C，給host-scene-scale.js依版型查詢用
    cSub:    v('cSub'),
    cMain:   v('cMain'),
    cDate:   v('cDate'),
    maskOn:  S.maskOn,
    /* showCTA 由各 layout 自己控制，不從 editor 傳入 */
    flLogoBgMode: S.flLogoBgMode,
    flLogoSampledColor: S.flLogoSampledColor,
    flLogoExtraScale: S.flLogoExtraScale,
    flLogoExtraOffX: S.flLogoExtraOffX,
    flLogoExtraOffY: S.flLogoExtraOffY,
  });
}

/* ── 非同步「問」各版位iframe目前真正的畫布位置（imgX/imgY/imgScale） ──
   取代「直接同步讀 iframe.contentWindow.D」的舊做法：postMessage送到別的iframe
   本來就是非同步的，呼叫端送出 broadcastFull() 之後如果馬上同步戳
   iframe.contentWindow.D，iframe當下大多還沒收到/處理那則訊息，讀到的會是
   上一個分頁殘留的舊值、或這個分頁從沒被 initHostPos() 定位過的原始預設值。
   （實際案例／完整根因調查見個人專場「商品曝品區位置/縮放跑掉bug」調查紀錄）

   做法：對每個iframe送一個帶 msgId 的 BN_GET_STATE，該版位的layout若有實作
   （目前只有 01_thumbnail.html／04_opening.html 有可拖曳定位的商品圖層，
   02_lpbn.html／05_fl.html／06_card.html 沒有實作，逾時後直接跳過，
   不會卡住呼叫端），回覆 BN_CANVAS_STATE 時用 e.source + msgId 比對是哪一次
   問的、對應到哪個iframe，全部答完或逾時（預設500ms）才呼叫cb(result)。 */
var _canvasStateMsgSeq = 0;
function getAllCanvasStates(cb, timeoutMs){
  timeoutMs = timeoutMs || 500;
  var ids = Object.keys(iframes);
  if(!ids.length){ cb({}); return; }
  var result = {};
  var pending = {};
  var msgIds = {};
  ids.forEach(function(id){ pending[id] = true; });

  var settled = false;
  function finish(){
    if(settled) return;
    settled = true;
    window.removeEventListener('message', onMsg);
    cb(result);
  }
  function onMsg(e){
    var msg = e.data;
    if(!msg || msg.type !== 'BN_CANVAS_STATE') return;
    var matchedId = null;
    ids.forEach(function(id){
      if(pending[id] && iframes[id] && iframes[id].contentWindow === e.source && msgIds[id] === msg.msgId){
        matchedId = id;
      }
    });
    if(!matchedId) return;
    result[matchedId] = { imgX: msg.state.imgX, imgY: msg.state.imgY, imgScale: msg.state.imgScale };
    delete pending[matchedId];
    if(!Object.keys(pending).length) finish();
  }
  window.addEventListener('message', onMsg);

  ids.forEach(function(id){
    var ifr = iframes[id];
    if(!ifr || !ifr.contentWindow){ delete pending[id]; return; }
    var msgId = 'cs_' + (++_canvasStateMsgSeq);
    msgIds[id] = msgId;
    try{ ifr.contentWindow.postMessage({ type:'BN_GET_STATE', msgId: msgId }, '*'); }
    catch(e){ delete pending[id]; }
  });
  if(!Object.keys(pending).length){ finish(); return; } // 一個 iframe 都沒送出去（例如都還沒掛載）
  setTimeout(finish, timeoutMs); // 逾時：沒回覆的版位（沒實作這組問答）就放棄，其他已經拿到的結果照樣回傳
}

function broadcastFull(keepPos){
  broadcastPayload({
    theme:   S.theme,
    bgBase:  S.bgUrls[S.theme],  // e.g. '../backgrounds/A/'
    main:    v('txt-main'),
    sub:     v('txt-sub'),
    date:    v('txt-date'),
    time:    v('txt-time'),
    brand:   v('txt-brand'),
    guest:   v('txt-guest'),
    flText:  v('txt-fl'),
    flTheme: S.flTheme,
    flStyle: S.flStyle,
    combo:   (window.ShadowEditor && window.ShadowEditor.getCombo()) || null, // 目前版型A/B/C，給host-scene-scale.js依版型查詢用
    cSub:    v('cSub'),
    cMain:   v('cMain'),
    cDate:   v('cDate'),
    maskOn:  S.maskOn,
    /* showCTA 由各 layout 自己控制 */
    host:    S.imgs.host,
    keepPos: !!keepPos, // true＝這次host只是內容更新（例如重新調整陰影再匯出），版位那邊要保留使用者已經手動調整過的位置/大小，不要重新initHostPos()
    logo1:   S.imgs.logo1,
    logo2:   S.imgs.logo2,
    /* 直播間FL「LOGO」版型專用：透明底、只有logo本身（含雙logo的相對位置/大小/
       間距）的合成圖，確認並套用時烤好——FL版位自己畫白底＋橘框／吸色底，
       只需要疊上logo本身，才不會把FL自己選的底色蓋掉。 */
    logo2Fl: S.imgs.logo2Fl,
    logo2Shape: S.logo2Shape, // 'square' 或 'wide'，讓版位決定 logo2 該用哪組高度比例
    /* 直播間FL「LOGO」版型專用：原圖（未合成，透明底）＋Logo2編輯畫布上的縮放位移，
       05_fl.html 用這組直接算Logo在膠囊框裡的位置大小，公式要跟 editor-logo2-canvas.js
       的 drawLogo2BigCanvas() 完全對應，才不會「示意圖看起來OK，套用到版位卻對不起來」。 */
    logo2Raw:  S.logo2Raw,
    logo2Scale: S.logo2Scale,
    logo2OffX:  S.logo2OffX,
    logo2OffY:  S.logo2OffY,
    /* 雙logo（共播）模式：第二格的原圖＋縮放位移，只有05_fl的LOGO模式會用到
       （01_thumbnail／04_opening用的是already烤好的合成圖S.imgs.logo2，不需要這組） */
    logo2RawB:  S.logo2RawB,
    logo2ScaleB: S.logo2ScaleB,
    logo2OffXB:  S.logo2OffXB,
    logo2OffYB:  S.logo2OffYB,
    logo2TopSlot: S.logo2TopSlot, // 共用範圍模式：誰疊在上面（'A'或'B'）
    flLogoBgMode: S.flLogoBgMode,
    flLogoSampledColor: S.flLogoSampledColor,
    flLogoExtraScale: S.flLogoExtraScale,
    flLogoExtraOffX: S.flLogoExtraOffX,
    flLogoExtraOffY: S.flLogoExtraOffY,
  });
}

/* 向下相容：broadcast() 不含圖片（防止位置被重設） */
function broadcast(){ broadcastText(); }

/* 底部遮罩總開關：所有版位一起開/關（各版位實際位置/形狀由 mask-defaults.js 決定，
   這裡只控制「要不要顯示」），不用整份重新廣播，單獨送這一個欄位就好 */
function onMaskToggleChange(checked){
  S.maskOn = !!checked;
  broadcastPayload({ maskOn: S.maskOn });
}

/* ── 接收 layout iframe 發回來的訊息 ── */
window.addEventListener('message', function(e){
  var msg = e.data;
  if(!msg || !msg.type) return;

  if(msg.type === 'BN_READY'){
    /* 某個畫布 iframe 剛載入完成：直接送目前完整狀態給「這一個」iframe，
       不依賴固定的 setTimeout 時間，避免載入速度不一導致背景/文案沒套上 */
    Object.keys(iframes).forEach(function(id){
      var ifr = iframes[id];
      if(ifr && ifr.contentWindow === e.source){
        try{
          ifr.contentWindow.postMessage({type:'BN_UPDATE', payload:{
            theme:   S.theme,
            bgBase:  S.bgUrls[S.theme],
            main:    v('txt-main'),
            sub:     v('txt-sub'),
            date:    v('txt-date'),
            time:    v('txt-time'),
            brand:   v('txt-brand'),
    guest:   v('txt-guest'),
    flText:  v('txt-fl'),
    combo:   (window.ShadowEditor && window.ShadowEditor.getCombo()) || null, // 目前版型A/B/C，給host-scene-scale.js依版型查詢用
            cSub:    v('cSub'),
            cMain:   v('cMain'),
            cDate:   v('cDate'),
            maskOn:  S.maskOn,
            host:    S.imgs.host,
            logo1:   S.imgs.logo1,
            logo2:   S.imgs.logo2,
            logo2Fl: S.imgs.logo2Fl,
            logo2Shape: S.logo2Shape,
            logo2Raw:  S.logo2Raw,
            logo2Scale: S.logo2Scale,
            logo2OffX:  S.logo2OffX,
            logo2OffY:  S.logo2OffY,
            logo2RawB:  S.logo2RawB,
            logo2ScaleB: S.logo2ScaleB,
            logo2OffXB:  S.logo2OffXB,
            logo2OffYB:  S.logo2OffYB,
            logo2TopSlot: S.logo2TopSlot,
            flLogoBgMode: S.flLogoBgMode,
            flLogoSampledColor: S.flLogoSampledColor,
            flLogoExtraScale: S.flLogoExtraScale,
            flLogoExtraOffX: S.flLogoExtraOffX,
            flLogoExtraOffY: S.flLogoExtraOffY,
          }}, '*');
          /* 如果目前分頁有記住這個畫布的圖片位置，也一併還原 */
          var tab = TABS[ACTIVE_TAB];
          if(tab && tab.data && tab.data.canvasState && tab.data.canvasState[id]){
            ifr.contentWindow.postMessage({type:'BN_RESTORE_STATE', state:tab.data.canvasState[id]}, '*');
          }
        }catch(err){}
      }
    });
  }
  else if(msg.type === 'BN_REPLACE_IMG' && msg.key === 'host'){
    /* 取代主持人：直接開啟右側圖庫 popup */
    openPopup('host');
  }
  else if(msg.type === 'BN_DELETE_IMG' && msg.key === 'host'){
    /* 刪除主持人 */
    S.imgs.host = null;
    var imgEl = document.getElementById('host-img');
    if(imgEl){ imgEl.src=''; imgEl.dataset.baseSrc=''; }
    var item = document.getElementById('host-item');
    if(item) item.style.display = 'none';
    var row = document.getElementById('host-row');
    if(row) row.classList.remove('done');
    broadcastFull();
    toast('主持人已移除','ok');
  }
  else if(msg.type === 'BN_OPEN_EDITOR' && msg.key === 'host'){
    /* 開啟去背/影子編輯器 */
    var hostImg = document.getElementById('host-img');
    var hostItem = document.getElementById('host-item');
    if(!hostImg || !hostImg.src || hostImg.src === window.location.href){
      toast('請先載入主持人圖片','err'); return;
    }
    /* 確保 host-item 可見（editor-plugin 需要讀取它的尺寸） */
    hostItem.style.display = 'block';

    /* 攔截 imgRef.src 寫入：編輯完成時同步回 S.imgs.host 並 broadcast */
    var origDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
    var _patched = false;
    function patchOnce(){
      if(_patched) return; _patched = true;
      var origSetter = origDescriptor.set;
      Object.defineProperty(hostImg, 'src', {
        set: function(val){
          origSetter.call(this, val);
          /* 只攔截 data: URL（編輯後的結果） */
          if(val && val.startsWith('data:')){
            S.imgs.host = val;
            /* 同步 sidebar 顯示 */
            var item = document.getElementById('host-item');
            if(item) item.style.display = 'block';
            var row = document.getElementById('host-row');
            if(row) row.classList.add('done');
            /* 還原 descriptor 避免重複攔截 */
            delete hostImg.src;
            broadcastFull();
            toast('主持人圖片已更新','ok');
          }
        },
        get: function(){ return origDescriptor.get.call(this); },
        configurable: true
      });
    }
    patchOnce();

    if(typeof window.openEraseEditor === 'function'){
      window.openEraseEditor(hostImg);
    } else {
      toast('編輯器尚未載入，請稍後再試','err');
    }
  }
});

function setRefLayer(id, input){
  var file = input.files[0];
  if(!file) return;
  var img = document.getElementById('ref-'+id);
  if(!img) return;
  var url = URL.createObjectURL(file);
  img.src = url;
  img.style.display = 'block';
  /* 按鈕文字改為可點擊移除 */
  var btn = input.closest('.canvas-ref-btn');
  if(btn) btn.title = '點擊更換參考圖（不輸出）';
  toast('參考層已載入（不影響輸出）','ok');
}

/* ── 復原（Ctrl+Z）── 通用分派器 ──────────────────────────────
   Logo2畫布跟1200商品/主持人畫布是兩套完全獨立、資料結構不一樣的編輯系統，
   刻意不做成「共用一份復原堆疊」——那需要設計一個能同時看懂兩邊資料的
   共用格式，改一邊的資料結構很容易不小心波及另一邊。

   改成每個編輯系統各自維護自己的復原堆疊（各自最多5步，只記錄「位置/縮放/
   疊放順序」這幾個欄位的微調，不含上傳/刪除素材、版型組合切換這些），
   在這裡註冊給這支通用分派器。按下Ctrl+Z時，比較各個堆疊「最上面那筆
   紀錄的時間」，哪個最新就復原哪一個——效果上就是「復原我剛剛動的那個」，
   但每個系統的復原邏輯完全獨立、互不影響，出問題也只會影響單一系統。 */
window.BNUndo = {
  _domains: [],
  /* domain = { peekTs: function()->number（沒有紀錄回傳0）, undo: function() } */
  register: function(domain){ this._domains.push(domain); }
};

document.addEventListener('keydown', function(e){
  var isUndo = (e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey;
  if(!isUndo) return;
  // 在輸入框/文字欄位裡按Ctrl+Z，維持瀏覽器原生的文字復原，不要搶走
  var tag = (e.target && e.target.tagName) || '';
  if(tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;

  var best = null, bestTs = 0;
  window.BNUndo._domains.forEach(function(d){
    var ts = 0;
    try{ ts = d.peekTs() || 0; }catch(err){ ts = 0; }
    if(ts > bestTs){ bestTs = ts; best = d; }
  });
  if(best){
    e.preventDefault();
    try{ best.undo(); }catch(err){ console.warn('[BNUndo] undo失敗:', err); }
  }
});

