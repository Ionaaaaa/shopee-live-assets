'use strict';

function buildCanvasArea(){
  var area = document.getElementById('canvas-area');
  area.innerHTML = '';
  LAYOUTS.forEach(function(layout){
    var block = document.createElement('div');
    block.className = 'canvas-block';
    block.id = 'canvas-block-'+layout.id;

    var areaW = area.getBoundingClientRect().width || (window.innerWidth - 268);
    var padding = 72; // 左右 padding 各 36px
    var scaleByW = Math.min(1, (areaW - padding) / layout.w);

    /* 高度縮放：可用高度 = 視窗高度 - topbar(44) - canvas-nav(48) - meta列(~36) - 上下gap */
    var availH = window.innerHeight - 44 - 48 - 36 - 56;
    var scaleByH = Math.min(1, availH / layout.h);

    var scale = Math.min(scaleByW, scaleByH);

    block.innerHTML =
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
      '</div>';

    area.appendChild(block);

    var wrap = block.querySelector('#wrap-'+layout.id);
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
}

function updateAssetList(){
  var body = document.getElementById('asset-list-body');
  if(!body) return;
  var layouts = getLayouts();
  if(!layouts.length){ body.innerHTML = '<div style="padding:20px 16px;font-size:12px;color:var(--text-dim);text-align:center;">無素材</div>'; return; }
  body.innerHTML = layouts.map(function(l){
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

function scrollToCanvas(id){
  var block = document.getElementById('canvas-block-'+id);
  if(block) block.scrollIntoView({behavior:'smooth', block:'start'});
}

function updateActiveAsset(){
  var area = document.getElementById('canvas-area');
  if(!area) return;
  var areaTop = area.getBoundingClientRect().top;
  var closest = null, closestDist = Infinity;
  Object.keys(iframes).forEach(function(id){
    var block = document.getElementById('canvas-block-'+id);
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
    bgBase:  bgBaseFor(S.theme),  // e.g. '../backgrounds/A/'
    main:    v('txt-main'),
    sub:     v('txt-sub'),
    date:    v('txt-date'),
    time:    v('txt-time'),
    brand:   v('txt-brand'),
    flText:  v('txt-fl'),
    combo:   (window.ShadowEditor && window.ShadowEditor.getCombo()) || null, // 目前版型A/B/C/D，給host-scene-scale.js依版型查詢用
    cSub:    v('cSub'),
    cMain:   v('cMain'),
    cDate:   v('cDate'),
    sepColor: v('cSep'),
    barColor: v('cBar'),
    barTextColor: v('cBarText'),
    barOpacity: parseFloat(v('cBarOpacity'))||1,
    logo1Url: themeAssetUrl(S.theme, 'logo1', 'logos/logo_shopee_live.png'),
    ctaUrl:   themeAssetUrl(S.theme, 'cta', 'logos/cta_btn.png'),
    maskOn:  S.maskOn,
    /* showCTA 由各 layout 自己控制，不從 editor 傳入 */
  });
}

function broadcastFull(){
  broadcastPayload({
    theme:   S.theme,
    bgBase:  bgBaseFor(S.theme),  // e.g. '../backgrounds/A/'
    main:    v('txt-main'),
    sub:     v('txt-sub'),
    date:    v('txt-date'),
    time:    v('txt-time'),
    brand:   v('txt-brand'),
    flText:  v('txt-fl'),
    combo:   (window.ShadowEditor && window.ShadowEditor.getCombo()) || null, // 目前版型A/B/C/D，給host-scene-scale.js依版型查詢用
    cSub:    v('cSub'),
    cMain:   v('cMain'),
    cDate:   v('cDate'),
    sepColor: v('cSep'),
    barColor: v('cBar'),
    barTextColor: v('cBarText'),
    barOpacity: parseFloat(v('cBarOpacity'))||1,
    logo1Url: themeAssetUrl(S.theme, 'logo1', 'logos/logo_shopee_live.png'),
    ctaUrl:   themeAssetUrl(S.theme, 'cta', 'logos/cta_btn.png'),
    maskOn:  S.maskOn,
    /* showCTA 由各 layout 自己控制 */
    host:    S.imgs.host,
    logo1:   S.imgs.logo1,
    logo2:   S.imgs.logo2,
    logo2Shape: S.logo2Shape, // 'square' 或 'wide'，讓版位決定 logo2 該用哪組高度比例
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
            bgBase:  bgBaseFor(S.theme),
            main:    v('txt-main'),
            sub:     v('txt-sub'),
            date:    v('txt-date'),
            time:    v('txt-time'),
            brand:   v('txt-brand'),
    flText:  v('txt-fl'),
    combo:   (window.ShadowEditor && window.ShadowEditor.getCombo()) || null, // 目前版型A/B/C/D，給host-scene-scale.js依版型查詢用
            cSub:    v('cSub'),
            cMain:   v('cMain'),
            cDate:   v('cDate'),
            sepColor: v('cSep'),
            barColor: v('cBar'),
            barTextColor: v('cBarText'),
            barOpacity: parseFloat(v('cBarOpacity'))||1,
            logo1Url: themeAssetUrl(S.theme, 'logo1', 'logos/logo_shopee_live.png'),
            ctaUrl:   themeAssetUrl(S.theme, 'cta', 'logos/cta_btn.png'),
            maskOn:  S.maskOn,
            host:    S.imgs.host,
            logo1:   S.imgs.logo1,
            logo2:   S.imgs.logo2,
            logo2Shape: S.logo2Shape,
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

