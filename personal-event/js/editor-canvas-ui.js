'use strict';

/* 每次頁面載入都用當下時間戳當版本號，強制瀏覽器每次都重新抓取
   layouts/ 底下的檔案，不會被快取卡住「明明換了新檔案、畫面卻還是舊的」。 */
var LAYOUT_CACHE_BUST = Date.now();

function buildCanvasArea(){
  var area = document.getElementById('canvas-area');
  area.innerHTML = '';
  LAYOUTS.forEach(function(layout){
    var block = document.createElement('div');
    block.className = 'canvas-block';
    block.id = 'canvas-block-'+layout.id;

    var areaW = area.getBoundingClientRect().width || (window.innerWidth - 381);
    var padding = 72; // 左右 padding 各 36px
    var scaleByW = Math.min(1, (areaW - padding) / layout.w);

    /* 高度縮放：可用高度 = 視窗高度 - topbar(44) - canvas-nav(48) - meta列(~36) - 上下留白。
       這個上下留白原本是56，太貼螢幕下緣，加大到110，讓畫布區跟視窗下緣之間
       固定留一段空間，不管哪個版位都不會直接頂到螢幕最下面。 */
    var availH = window.innerHeight - 44 - 48 - 36 - 110;
    var scaleByH = Math.min(1, availH / layout.h);

    var scale = Math.min(scaleByW, scaleByH);

    /* FL ICON類版位（03_fl／04_fl_a1）畫面上顯示的框再縮小一點——這裡只是
       再乘一個縮小係數影響「畫面上看起來多大」（iframe transform scale），
       不是改 layout.w/layout.h 那組原始尺寸，所以匯出/下載出來的實際像素
       完全不受影響，純粹只是螢幕上顯示得更小、不會頂到下緣。 */
    if(layout.id === '03_fl' || layout.id === '04_fl_a1'){
      scale = scale * 0.8;
    }

    block.innerHTML =
      '<div class="canvas-frame">'+
        '<div class="canvas-meta">'+
          '<span class="canvas-name">'+layout.name+'</span>'+
          '<span class="canvas-size">'+layout.w+' × '+layout.h+' px</span>'+
          '<button class="canvas-dl-btn" onclick="downloadSingle(\''+layout.id+'\')">⬇ 下載</button>'+
        '</div>'+
        '<div class="iframe-wrap" id="wrap-'+layout.id+'" style="position:relative;">'+
          '<img id="ref-'+layout.id+'" style="display:none;position:absolute;top:0;left:0;width:100%;height:100%;object-fit:contain;pointer-events:none;z-index:999;" />'+
        '</div>'+
      '</div>';

    area.appendChild(block);

    var wrap = block.querySelector('#wrap-'+layout.id);
    /* FL ICON類版位（03_fl／04_fl_a1）匯出的是透明底PNG，改用跟外面.canvas-frame
       同一個 --canvas-frame 淺灰色墊底（而不是原本的 --bg），讓畫布跟外框圓角
       是同一片顏色、看起來像一體成形，不會有色差接縫；其他版位（LPBN等本來就
       是滿版不透明的JPEG）維持原本白底。 */
    if(layout.id === '03_fl' || layout.id === '04_fl_a1'){
      wrap.style.background = 'var(--canvas-frame)';
    }
    var iframe = document.createElement('iframe');
    iframe.src = 'layouts/'+layout.file+'?v='+LAYOUT_CACHE_BUST;
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
  if(typeof updateFlCanvasVisibility === 'function') updateFlCanvasVisibility();
  if(typeof updateFlA1CanvasVisibility === 'function') updateFlA1CanvasVisibility();
}

/* 「FL ICON」下拉選單選「不製作」時：
   - 側欄「FL 文案」那個輸入框整塊隱藏，不用讓使用者對著一個不會被匯出的
     欄位打字
   - 畫布區裡的 03_fl 那個canvas-block也隱藏，不佔畫面空間
   canvas-block-03_fl 只在 buildCanvasArea() 時建立一次（不會每次切分頁重建），
   所以這裡只是切換 display，不用重新產生 iframe。
   呼叫時機：下拉選單onchange（handleFlSlotChange）、Excel匯入完成後
   （editor-import.js的afterExcel）、切換分頁後（editor-state.js的applyTabData）、
   以及這裡的初次建立畫布之後。

   個人專場A/B級分頁另外還要依「等級」決定要不要整個隱藏另一個版位（見下面
   updateCanvasVisibilityForLevel）：B級沒有LPBN、A級目前沒有圓形FL（見
   editor-export.js layoutsForTab 的說明），這裡的「不製作」判斷只處理FL本身
   要不要顯示，兩者互不衝突、各自呼叫。 */
function updateFlCanvasVisibility(){
  var slot = (document.getElementById('fl-product-slot') || {}).value || '';
  var isSkip = (slot === 'skip');

  var flTextField = document.getElementById('fl-text-field');
  if(flTextField) flTextField.style.display = isSkip ? 'none' : '';

  var flBlock = document.getElementById('canvas-block-03_fl');
  if(flBlock) flBlock.style.display = isSkip ? 'none' : '';

  updateCanvasVisibilityForLevel();
  updateAssetList(); // 畫布區顯示/隱藏切換完了，左側素材清單要跟著同步（見 updateAssetList 說明）
}

/* 個人專場：B級專場只做FL Icon、沒有LPBN，切到B級分頁時要把LPBN那塊畫布
   整個隱藏——不隱藏的話，那塊iframe還留著上一個A級分頁廣播過去的最後畫面，
   看起來像「B級套用了A級的東西」，其實只是舊畫面沒清掉/沒藏起來而已。

   A級專場改用新的方形FL ICON（04_fl_a1）取代原本橫式03_fl，兩者互斥：
   A級隱藏03_fl、只顯示04_fl_a1；B級維持原樣顯示03_fl、隱藏04_fl_a1；
   沒有level標記的舊格式分頁維持原本行為（03_fl顯示，04_fl_a1本來就不
   存在資料，一併隱藏，避免顯示一個永遠空白的畫布）。 */
function updateCanvasVisibilityForLevel(){
  var level = (TABS[ACTIVE_TAB] && TABS[ACTIVE_TAB].data) ? TABS[ACTIVE_TAB].data.level : null;
  var lpbnBlock = document.getElementById('canvas-block-02_lpbn');
  if(lpbnBlock) lpbnBlock.style.display = (level === 'B') ? 'none' : '';
  var flBlock = document.getElementById('canvas-block-03_fl');
  if(flBlock) flBlock.style.display = (level === 'A') ? 'none' : '';

  /* 右側側欄的FL ICON控制面板也要跟著切換，跟上面畫布區的邏輯是同一組
     判斷、同一時機一起切，避免A級分頁還看得到B級的「商品1/2/3」下拉選單
     （04_fl_a1沒有這幾個選項），或B級分頁看不到自己該有的控制項。 */
  var flBPanel  = document.getElementById('fl-b-panel');
  var flA1Panel = document.getElementById('fl-a1-panel');
  if(flBPanel)  flBPanel.style.display  = (level === 'A') ? 'none' : '';
  if(flA1Panel) flA1Panel.style.display = (level === 'A') ? '' : 'none';

  /* B級專場沒有LPBN這個版位，主標/副標/購物專家名稱/日期時間這幾個欄位
     填了也不會被匯出，一併隱藏，右側只留「編輯 LOGO＋曝品區」跟FL文案編輯。 */
  var lpbnFields = document.getElementById('lpbn-text-fields');
  if(lpbnFields) lpbnFields.style.display = (level === 'B') ? 'none' : '';
}

/* 04_fl_a1（A級專場方形FL ICON）畫布區顯示邏輯：只有A級分頁、且這一包
   FL ICON不是「不製作」時才顯示，跟 updateFlCanvasVisibility() 的03_fl
   skip判斷是各自獨立的兩組邏輯，互不影響。 */
function updateFlA1CanvasVisibility(){
  var level = (TABS[ACTIVE_TAB] && TABS[ACTIVE_TAB].data) ? TABS[ACTIVE_TAB].data.level : null;
  var flABlock = document.getElementById('canvas-block-04_fl_a1');
  if(flABlock) flABlock.style.display = (level === 'A' && S.flAVariant !== 'skip') ? '' : 'none';
  var flA1TextField = document.getElementById('fl-a1-text-field');
  if(flA1TextField) flA1TextField.style.display = (S.flAVariant === 'skip') ? 'none' : '';
  var flA1SelEl = document.getElementById('fl-a1-variant');
  if(flA1SelEl) flA1SelEl.value = S.flAVariant || 'skip';
  var flA1TextEl = document.getElementById('txt-fl-a1');
  if(flA1TextEl && document.activeElement !== flA1TextEl) flA1TextEl.value = S.flAText || '';
  if(typeof ccFlA1 === 'function') ccFlA1();
  updateCanvasVisibilityForLevel();
  updateAssetList(); // 畫布區顯示/隱藏切換完了，左側素材清單要跟著同步（見 updateAssetList 說明）
}

/* 左側「素材清單」：只列出目前分頁畫布區「實際會顯示」的版位，不是後台
   啟用清單的全部版位。例如A級專場分頁畫布區的03_fl（橫式FL Icon）已經被
   updateCanvasVisibilityForLevel() 藏起來（A級改用方形04_fl_a1），這裡也要
   跟著不列出，不然選單上會看到一個點了也捲不到、頁面上根本沒有對應畫布的
   項目。判斷方式直接讀對應 canvas-block 的 display 狀態（而不是重新複製一份
   「A級/B級該顯示什麼」的規則），這樣不管以後版位顯示邏輯怎麼調整，這裡都
   自動跟著同步、不用兩邊各改一次。canvas-block還沒建立（buildCanvasArea()
   第一次執行、呼叫這支時canvas-block尚未插入DOM）時視為有效，避免清單瞬間
   被清空。 */
function updateAssetList(){
  var body = document.getElementById('asset-list-body');
  if(!body) return;
  var layouts = getLayouts().filter(function(l){
    var block = document.getElementById('canvas-block-'+l.id);
    return !block || block.style.display !== 'none';
  });
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
    theme:    S.theme,
    bgBase:   bgBaseFor(S.theme),
    flBgColor: flBgColorFor(S.theme),
    flBBgColor: flBBgColorFor(S.theme), // B級專場FL Icon純文案/商品版型專用背景色，跟公版款式flBgColor脫鉤
    flBTextColor: flBTextColorFor(S.theme), // 同上，B級FL Icon專用文字色
    shadowRgba: S.shadowRgba,
    main:    v('txt-main'),
    sub:     v('txt-sub'),
    date:    v('txt-date'),
    time:    v('txt-time'),
    brand:   v('txt-brand'),
    flText:  v('txt-fl'),
    flProduct: _flProductSlot(), // FL商品圖 dataUrl（版型P用，null=無商品）
    flLogoBgMode: S.flLogoBgMode, // 直播間FL純Logo版型底色類型：white/sampled
    flLogoSampledColor: S.flLogoSampledColor, // 'sampled'模式實際要用的顏色
    /* FL示意圖專用的額外縮放/位移，跟 logo2Scale 分開，解決logo2畫布跟FL長寬比
       不一樣、光靠logo2那組數字有時候怎麼調都填不滿FL的問題 */
    flLogoExtraScale: S.flLogoExtraScale,
    flLogoExtraOffX:  S.flLogoExtraOffX,
    flLogoExtraOffY:  S.flLogoExtraOffY,
    /* A級專場方形FL ICON（04_fl_a1）專用，跟上面直播間FL(03_fl)的flText互不影響 */
    flAVariant: S.flAVariant,
    flAText:    S.flAText,
    combo:   (window.ShadowEditor && window.ShadowEditor.getCombo()) || null, // 目前版型A/B/C/D，給host-scene-scale.js依版型查詢用
    cSub:    v('cSub'),
    cMain:   v('cMain'),
    cDate:   v('cDate'),
    sepColor: v('cSep'),
    logo1Url: logoAssetUrl('logo1', 'logos/logo_shopee_live.png'),
    ctaUrl:   logoAssetUrl('cta', 'logos/cta_btn.png'),
    maskOn:  S.maskOn,
    /* showCTA 由各 layout 自己控制，不從 editor 傳入 */
  });
}

/* 非同步問每個 iframe「現在真正的」商品定位狀態（imgX/imgY/imgScale），
   不要直接同步戳 iframe.contentWindow.D——postMessage 送出去是非同步的，
   如果剛廣播完新的合成圖（composeShadow → broadcastFull），iframe 這時候
   通常還沒收到/處理完那則訊息，D 還停在「這次還沒生效」的舊值（可能是這個
   分頁從沒定位過的預設值，或上一個分頁殘留的值）。同步讀到這組舊值存起來，
   之後 applyTabData() 的 BN_RESTORE_STATE 就會拿這組舊值蓋掉 initHostPos()
   剛算對的結果——這正是「commit 完，位置卻跑掉」的根因。
   改成送 BN_GET_STATE、等 iframe 真的回覆 BN_CANVAS_STATE 才算數：
   02_lpbn.html 有實作這組問答；03_fl／04_fl_a1 沒有可拖曳定位、不會回覆，
   逾時後直接跳過那個版位，不影響其他版位、也不會卡住呼叫端。
   用法：getAllCanvasStates(function(states){ ... states = {id:{imgX,imgY,imgScale}} }) */
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

function broadcastFull(){
  broadcastPayload({
    theme:    S.theme,
    bgBase:   bgBaseFor(S.theme),
    flBgColor: flBgColorFor(S.theme),
    flBBgColor: flBBgColorFor(S.theme), // B級專場FL Icon純文案/商品版型專用背景色，跟公版款式flBgColor脫鉤
    flBTextColor: flBTextColorFor(S.theme), // 同上，B級FL Icon專用文字色
    shadowRgba: S.shadowRgba,
    main:    v('txt-main'),
    sub:     v('txt-sub'),
    date:    v('txt-date'),
    time:    v('txt-time'),
    brand:   v('txt-brand'),
    flText:  v('txt-fl'),
    flProduct: _flProductSlot(), // FL商品圖 dataUrl（版型P用，null=無商品）
    flLogoBgMode: S.flLogoBgMode, // 直播間FL純Logo版型底色類型：white/sampled
    flLogoSampledColor: S.flLogoSampledColor, // 'sampled'模式實際要用的顏色
    /* FL示意圖專用的額外縮放/位移，跟 logo2Scale 分開，解決logo2畫布跟FL長寬比
       不一樣、光靠logo2那組數字有時候怎麼調都填不滿FL的問題 */
    flLogoExtraScale: S.flLogoExtraScale,
    flLogoExtraOffX:  S.flLogoExtraOffX,
    flLogoExtraOffY:  S.flLogoExtraOffY,
    /* A級專場方形FL ICON（04_fl_a1）專用，跟上面直播間FL(03_fl)的flText互不影響 */
    flAVariant: S.flAVariant,
    flAText:    S.flAText,
    combo:   (window.ShadowEditor && window.ShadowEditor.getCombo()) || null, // 目前版型A/B/C/D，給host-scene-scale.js依版型查詢用
    cSub:    v('cSub'),
    cMain:   v('cMain'),
    cDate:   v('cDate'),
    sepColor: v('cSep'),
    logo1Url: logoAssetUrl('logo1', 'logos/logo_shopee_live.png'),
    ctaUrl:   logoAssetUrl('cta', 'logos/cta_btn.png'),
    maskOn:  S.maskOn,
    /* showCTA 由各 layout 自己控制 */
    host:    S.imgs.host,
    logo1:   S.imgs.logo1,
    logo2:   S.imgs.logo2,
    logo2Shape: S.logo2Shape, // 'square' 或 'wide'，讓版位決定 logo2 該用哪組高度比例
    /* 原圖＋縮放位移：直接給 03_fl.html 用「跟 Logo2 編輯畫布一樣的比例／位移」重算，
       FL 裡的 Logo 才會跟編輯畫布連動——放大就直接放大、偏左偏右就直接偏左偏右，
       不用再把合成好的白底小卡整張拿去 contain 縮放（那樣位移量對不齊）。 */
    logo2Raw:   S.logo2Raw,
    logo2Scale: S.logo2Scale,
    logo2OffX:  S.logo2OffX,
    logo2OffY:  S.logo2OffY,
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
            theme:    S.theme,
    bgBase:   bgBaseFor(S.theme),
    flBgColor: flBgColorFor(S.theme),
    flBBgColor: flBBgColorFor(S.theme), // B級專場FL Icon純文案/商品版型專用背景色，跟公版款式flBgColor脫鉤
    flBTextColor: flBTextColorFor(S.theme), // 同上，B級FL Icon專用文字色
            shadowRgba: S.shadowRgba,
            main:    v('txt-main'),
            sub:     v('txt-sub'),
            date:    v('txt-date'),
            time:    v('txt-time'),
            brand:   v('txt-brand'),
    flText:  v('txt-fl'),
    flProduct: _flProductSlot(), // FL商品圖 dataUrl（版型P用，null=無商品）
    flLogoBgMode: S.flLogoBgMode, // 直播間FL純Logo版型底色類型：white/sampled
    flLogoSampledColor: S.flLogoSampledColor, // 'sampled'模式實際要用的顏色
    /* FL示意圖專用的額外縮放/位移，跟 logo2Scale 分開，解決logo2畫布跟FL長寬比
       不一樣、光靠logo2那組數字有時候怎麼調都填不滿FL的問題 */
    flLogoExtraScale: S.flLogoExtraScale,
    flLogoExtraOffX:  S.flLogoExtraOffX,
    flLogoExtraOffY:  S.flLogoExtraOffY,
    flAVariant: S.flAVariant,
    flAText:    S.flAText,
    combo:   (window.ShadowEditor && window.ShadowEditor.getCombo()) || null, // 目前版型A/B/C/D，給host-scene-scale.js依版型查詢用
            cSub:    v('cSub'),
            cMain:   v('cMain'),
            cDate:   v('cDate'),
            sepColor: v('cSep'),
            logo1Url: logoAssetUrl('logo1', 'logos/logo_shopee_live.png'),
            ctaUrl:   logoAssetUrl('cta', 'logos/cta_btn.png'),
            maskOn:  S.maskOn,
            host:    S.imgs.host,
            logo1:   S.imgs.logo1,
            logo2:   S.imgs.logo2,
            logo2Shape: S.logo2Shape,
            logo2Raw:   S.logo2Raw,
            logo2Scale: S.logo2Scale,
            logo2OffX:  S.logo2OffX,
            logo2OffY:  S.logo2OffY,
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

