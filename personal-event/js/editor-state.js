'use strict';

var S = {
  theme:'A',
  shadowRgba:null,
  textColorManual:false, // 使用者手動改過主副標色票後設為 true，下次底色沒變就不再自動覆蓋
  sellerName:'', // 賣家/店家名稱（工單「LOGO」欄位），匯出檔名用，見 editor-import.js
  imgs:{ host:null, logo1:null, logo2:null },
  // logo2 編輯面板用：原圖（未合成）＋當時的縮放位移/形狀，供「編輯 Logo2」重新叫出面板還原
  logo2Raw:null, logo2Scale:undefined, logo2OffX:undefined, logo2OffY:undefined, logo2Shape:undefined,
  maskOn:false, // 底部遮罩（補人物身體過短）：一鍵開關套用到所有版位，預設關閉
  /* 直播間FL純Logo版型（版型L）的底色類型，使用者在「Logo2 編輯」popup裡選，二選一：
     'white'（預設）＝黑字/單色Logo，白底＋橘框；
     'sampled'＝Logo本身已有顏色，吸取Logo素材本身的底色來填滿，不加框
                （見 flLogoSampledColor）。
     沒辦法用程式自動可靠判斷該用哪一種（黑字Logo去背後常被誤判成黑色底），所以交給使用者選。
     （這裡曾經多加過一個'colored'＝完全透明不畫背景的選項，後來確認那個理解是錯的──
     「Logo本身有顏色」指的就是這裡的'sampled'，不是另外一種模式，已經拿掉。） */
  flLogoBgMode: 'white',
  flLogoSampledColor: '#ffffff', // 'sampled'模式時實際要填的顏色，從Logo素材本身吸出來的
  /* FL示意圖專用的「額外」縮放/位移，跟 logo2Scale/OffX/OffY（Logo2編輯畫布本身的）
     分開存——因為logo2畫布跟FL色塊長寬比不一樣，光靠logo2那組數字，Logo有時候
     怎麼調都填不滿FL，所以另外開一組讓使用者在FL示意圖上直接拖曳/用滑桿調，
     兩組互不影響，也不會被logo2重新上傳/調整洗掉。 */
  flLogoExtraScale: 1,
  flLogoExtraOffX: 0, // FL_PREVIEW.LOGO_ZONE寬度的比例（-1~1大約是左右可拖的範圍）
  flLogoExtraOffY: 0,
  /* A級專場方形FL ICON（04_fl_a1.html）專用：'skip'|'caption'|'logoBar'，
     跟直播間FL(03_fl)的flText/flProductSlot是分開的兩組欄位，互不影響──
     這個版位純粹由Excel批次匯入驅動，沒有側欄手動輸入框，見 editor-import.js
     parsePersonalEventALevel() 的解析規則。 */
  flAVariant: 'skip',
  flAText: '',
};
var DEFAULT_THEME = 'A';

/* 取 FL icon 指定的商品 dataUrl（工單填 '1'/'2'/'3' → product1/2/3 的陰影套件素材）
   若沒指定或找不到就回 null，FL版位收到 null 就不顯示商品（版型T）。

   注意：資料存放在 window._flProductSlotValue，不能跟這支函式同名（以前叫
   window._flProductSlot，跟這支 function _flProductSlot 撞名，會把函式本身
   蓋成 null，導致所有呼叫 _flProductSlot() 的地方全部丟 TypeError，
   進而讓 broadcast() 整個中斷、畫布收不到任何更新──背景色、文字、Logo都
   套不上去，連 applySeedHex() 內部呼叫 broadcast() 失敗都會讓它後面那行
   setTimeout(openImportModal,...) 一起被跳過、匯入視窗因此不會自動彈出來。
   這裡改名成 _flProductSlotValue 徹底避開撞名。 */
function _flProductSlot(){
  var slot = window._flProductSlotValue;
  if(!slot || slot === 'logo' || slot === 'skip') return null; // LOGO／不製作都沒有商品圖，不用查
  var slotId = 'product' + slot; // '1' → 'product1'
  if(window.ShadowEditor) return window.ShadowEditor.getSlotDataUrl(slotId) || null;
  return null;
}

/* 依 theme key 取得對應的背景圖資料夾路徑（相對於 layout iframe，所以要補 '../'）。
   各 layout 自己補上版位檔名（例如 bgBase+'02_lpbn.jpg'），找不到圖檔會自動退回
   layout 自己的 BG_FALLBACK 純色，不會整張空白，細節見 js/layout-common.js 的 loadBg()。 */
function bgBaseFor(t){ return '../backgrounds/'+t+'/'; }
/* FL Icon(03_fl.html)色塊填色：跟02_lpbn不同，FL是膠囊色塊不是整張背景圖，
   直接用theme指定的flBgColor當填色，不用另外找圖檔。 */
function flBgColorFor(t){
  var def = BN_THEME_MAP[t];
  return (def && def.flBgColor) || '#1E6EB4';
}

/* 依目前的公版款式（S.theme）取得 logo1／CTA 圖檔路徑（相對於 layout iframe，所以要補 '../'）。
   固定由 themes.js 每個款式直接指定，不用色彩引擎現算亮度。 */
function themeAssetUrl(theme, field, fallback){
  var def = BN_THEME_MAP[theme];
  var rel = def && def[field];
  return '../'+(rel || fallback);
}
function logoAssetUrl(field, fallback){
  return themeAssetUrl(S.theme, field, fallback);
}

/* ── 公版款式切換（唯一入口，頁面初始化／側欄下拉選單／工單匯入都呼叫這裡，
   確保三個來源套用出來的邏輯永遠一致，不會各寫各的） ──
   跟賣家資源那套「種子色自動配色」不同，這裡完全比照 MCN代播：色票／背景圖
   都是 themes.js 裡固定寫死的，不用现算，找不到對應 key 就跳警告、不套用。 */
function setTheme(t){
  var def = BN_THEME_MAP[t];
  if(!def){
    console.warn('[setTheme] 找不到公版 key「'+t+'」，請確認 js/themes.js 有這筆設定，暫時維持目前款式');
    return;
  }
  S.theme = t;
  S.shadowRgba = def.shadowRgba || null;
  var elSub = document.getElementById('cSub'); if(elSub) elSub.value = def.cSub;
  var elMain = document.getElementById('cMain'); if(elMain) elMain.value = def.cMain;
  var elDate = document.getElementById('cDate'); if(elDate) elDate.value = def.cDate;
  var elSep = document.getElementById('cSep'); if(elSep) elSep.value = def.sepColor;
  /* 更新下拉選單目前值（畫面上還沒渲染選單也沒關係，之後 renderThemeChips 會補上） */
  var sel = document.getElementById('theme-select');
  if(sel) sel.value = t;
  broadcast();
}

/* 頁面載入時，依 BN_THEMES 動態產生「公版款式」下拉選單，不寫死選項──
   themes.js 加新公版，這裡自動吃得到，不用改這支函式。 */
function renderThemeChips(){
  var sel = document.getElementById('theme-select');
  if(!sel) return;
  sel.innerHTML = BN_THEMES.map(function(t){
    return '<option value="'+t.key+'">'+t.label+'</option>';
  }).join('');
}



/* ── iframe 清單 ── */
/* LAYOUTS 從後台 localStorage 讀取啟用的版位 */
/* 專案各自獨立的 store key，不跟其他姊妹專案（賣家資源／star_studio系）共用，
   避免瀏覽器裡其他專案殘留的 localStorage（含已刪除的版位）被誤讀進來 */
var STORE_KEY = 'bn_admin_personal_event_v1';
/* 主持人圖庫 key —— admin.html 是獨立單檔（沒有 <script src>），這裡沒辦法共用
   同一份變數，只能手動保持字串跟 admin.html 的 HOST_LIST_KEY 完全一致 */
var HOST_LIST_KEY = 'bn_hosts_personal_event_v1';
var DEFAULT_LAYOUTS = [
  { id:'02_lpbn',  name:'直播大廳 LPBN（有/無CTA）2版',    file:'02_lpbn.html',  w:1125, h:360, enabled:true },
  { id:'03_fl',    name:'FL Icon 336×120',                 file:'03_fl.html',    w:336,  h:120, enabled:true },
  { id:'04_fl_a1', name:'FL Icon A1（方形）360×360',        file:'04_fl_a1.html', w:360,  h:360, enabled:true },
];
/* v3：新增 04_fl_a1 版位（A級專場方形FL ICON） */
var DEFAULT_LAYOUTS_VERSION = 3;

function getLayouts(){
  try{
    var stored = JSON.parse(localStorage.getItem(STORE_KEY)||'null');
    if(stored && stored.layouts && stored.layouts.length){
      /* 版本不符：合併新版位進去，但保留後台的 enabled 設定 */
      if(stored.version !== DEFAULT_LAYOUTS_VERSION){
        var existingMap = {};
        stored.layouts.forEach(function(l){ existingMap[l.id] = l; });
        var merged = DEFAULT_LAYOUTS.map(function(d){
          return existingMap[d.id] || d;
        });
        var updated = { layouts: merged, version: DEFAULT_LAYOUTS_VERSION };
        localStorage.setItem(STORE_KEY, JSON.stringify(updated));
        return merged.filter(function(l){ return l.enabled; });
      }
      return stored.layouts.filter(function(l){ return l.enabled; });
    }
  }catch(e){}
  /* 沒有資料，寫入預設清單 */
  localStorage.setItem(STORE_KEY, JSON.stringify({
    layouts: DEFAULT_LAYOUTS,
    version: DEFAULT_LAYOUTS_VERSION
  }));
  return DEFAULT_LAYOUTS.filter(function(l){ return l.enabled; });
}

var LAYOUTS = getLayouts();

/* ── 分頁（每天一組工單資料）── */
var TABS = [
  { id:'tab-1', label:'分頁 1', data:{} }
];
var ACTIVE_TAB = 0;

function buildTabs(tabs, initialIndex){
  TABS = tabs;
  /* initialIndex：個人專場匯入時會指定「第一個A/B級分頁」的位置，不一定是0──
     如果Excel裡混雜了其他舊格式分頁、公版分頁排在後面，硬套0會套到不相關的
     分頁資料。沒有指定（舊格式工單、或asset-only匯入）就維持原本行為用0。 */
  ACTIVE_TAB = (typeof initialIndex === 'number' && TABS[initialIndex]) ? initialIndex : 0;
  renderTabBar();
  /* 等 iframe 就緒再套用目前作用中的分頁 */
  setTimeout(function(){
    applyTabData(TABS[ACTIVE_TAB], true);
  }, 800);
}

/* 可見分頁列目前顯示的視窗：從 TABS[NAV_VISIBLE_START] 開始，往後塞得下幾個算幾個
   （NAV_VISIBLE_COUNT 由 renderTabBar() 量測畫面實際寬度後回填，不是寫死的數字，
   畫面變寬變窄、以後改樣式，這裡都會自動跟著對）。 */
var NAV_VISIBLE_START = 0;
var NAV_VISIBLE_COUNT = 0;

function renderTabBar(slide){
  var nav = document.getElementById('canvas-nav');
  if(!nav) return;
  closeNavDropdown();

  if(!TABS.length){
    nav.innerHTML = '<div id="nav-placeholder" style="display:flex;align-items:center;gap:8px;width:100%;">'+
      '<span style="font-size:12px;color:var(--text-dim);">點右上角「匯入工單」，自動建立分頁</span>'+
    '</div>';
    NAV_VISIBLE_START = 0; NAV_VISIBLE_COUNT = 0;
    renderNavDropdown();
    return;
  }

  if(NAV_VISIBLE_START >= TABS.length) NAV_VISIBLE_START = 0;

  nav.innerHTML =
    '<div id="nav-visible-tabs" style="display:flex;align-items:center;gap:4px;"></div>'+
    '<button id="nav-more-btn" class="nav-more-btn" style="display:none;" onclick="toggleNavDropdown()">'+
      '更多<span id="nav-more-count"></span><span id="nav-more-chev">▾</span>'+
    '</button>';

  var visibleWrap = document.getElementById('nav-visible-tabs');
  var moreBtn = document.getElementById('nav-more-btn');

  TABS.slice(NAV_VISIBLE_START).forEach(function(tab, i){
    var idx = NAV_VISIBLE_START + i;
    var btn = document.createElement('button');
    btn.className = 'nav-btn'+(idx===ACTIVE_TAB?' active':'');
    btn.textContent = tab.label;
    btn.onclick = (function(idx){ return function(){ switchTab(idx); }; })(idx);
    visibleWrap.appendChild(btn);
  });

  /* 先把「更多」鈕顯示出來，讓它的寬度也一起被量進 nav.scrollWidth，
     不然量測完才顯示更多鈕，剛好卡在臨界值時反而會擠出去。 */
  moreBtn.style.display = '';
  while(visibleWrap.children.length > 1 && nav.scrollWidth > nav.clientWidth){
    visibleWrap.removeChild(visibleWrap.lastElementChild);
  }

  NAV_VISIBLE_COUNT = visibleWrap.children.length;
  var hiddenCount = TABS.length - NAV_VISIBLE_COUNT;
  if(hiddenCount > 0){
    document.getElementById('nav-more-count').textContent = ' '+hiddenCount;
  } else {
    moreBtn.style.display = 'none';
  }

  if(slide){
    visibleWrap.classList.remove('nav-sliding');
    void visibleWrap.offsetWidth; // 強制reflow，讓移除/加回class能重新觸發動畫
    visibleWrap.classList.add('nav-sliding');
  }

  renderNavDropdown();
}

/* 分頁下拉選單：依 tab.data.level 分A級／B級兩塊，各自橫向換行排列
   （沒有level標記的舊格式分頁另外歸一塊，正常情況下不會出現）。 */
function renderNavDropdown(){
  var panel = document.getElementById('nav-dropdown-panel');
  if(!panel) return;
  var aIdx = [], bIdx = [], oIdx = [];
  TABS.forEach(function(tab, i){
    var lvl = tab.data && tab.data.level;
    if(lvl === 'A') aIdx.push(i);
    else if(lvl === 'B') bIdx.push(i);
    else oIdx.push(i);
  });
  function chipsHtml(idxList){
    return idxList.map(function(i){
      return '<button class="nav-btn'+(i===ACTIVE_TAB?' active':'')+'" onclick="switchTab('+i+')">'+TABS[i].label+'</button>';
    }).join('');
  }
  function sectionHtml(title, idxList, isFirst){
    if(!idxList.length) return '';
    return (isFirst?'':'<div class="nav-dropdown-divider"></div>')+
      '<div class="nav-dropdown-label">'+title+'</div>'+
      '<div class="nav-dropdown-grid">'+chipsHtml(idxList)+'</div>';
  }
  panel.innerHTML =
    sectionHtml('A級專場', aIdx, true)+
    sectionHtml('B級專場', bIdx, !aIdx.length)+
    sectionHtml('其他', oIdx, !aIdx.length && !bIdx.length);
}

function toggleNavDropdown(){
  var panel = document.getElementById('nav-dropdown-panel');
  if(!panel) return;
  var open = panel.style.display === 'block';
  panel.style.display = open ? 'none' : 'block';
  var chev = document.getElementById('nav-more-chev');
  if(chev) chev.textContent = open ? '▾' : '▴';
}
function closeNavDropdown(){
  var panel = document.getElementById('nav-dropdown-panel');
  if(panel) panel.style.display = 'none';
  var chev = document.getElementById('nav-more-chev');
  if(chev) chev.textContent = '▾';
}

/* 視窗resize時可見分頁列的容納數量可能改變，重新量測一次（debounce一下，
   不要每個resize事件都重算）。 */
var _navResizeTimer = null;
window.addEventListener('resize', function(){
  clearTimeout(_navResizeTimer);
  _navResizeTimer = setTimeout(function(){ renderTabBar(); }, 150);
});

function switchTab(i, cb){
  saveCurrentTabState(function(){
    ACTIVE_TAB = i;
    /* 選到的分頁如果本來就在可見列裡，只換亮燈、位置不動；不在的話，
       才把可見視窗整批滑到以這個分頁為第一個（見 renderTabBar 的 slide 參數）。 */
    var inWindow = (i >= NAV_VISIBLE_START && i < NAV_VISIBLE_START + NAV_VISIBLE_COUNT);
    if(!inWindow) NAV_VISIBLE_START = i;
    renderTabBar(!inWindow);
    applyTabData(TABS[i], true);
    if(cb) cb();
  });
}

function saveCurrentTabState(cb){
  var tab = TABS[ACTIVE_TAB];
  if(!tab) { if(cb) cb(); return; }
  tab.data = tab.data || {};
  tab.data.theme = S.theme;
  /* 手動覆蓋的主副標色：記住色碼與旗標，還原分頁時才知道要不要重算自動配色 */
  tab.data.textColorManual = S.textColorManual;
  if(S.textColorManual){
    tab.data.cSub  = v('cSub');
    tab.data.cMain = v('cMain');
    tab.data.cDate = v('cDate');
  }
  tab.data.main  = v('txt-main')  || tab.data.main;
  tab.data.sub   = v('txt-sub')   || tab.data.sub;
  tab.data.date  = v('txt-date')  || tab.data.date;
  tab.data.time  = v('txt-time')  || tab.data.time;
  tab.data.brand = v('txt-brand') || tab.data.brand;
  tab.data.flText = v('txt-fl') || tab.data.flText;
  /* FL ICON 下拉選單目前選的值（''=純文案／'1'~'3'=商品／'logo'／'skip'=不製作），
     之前只有 flText 有存，這顆選單本身的值完全沒存進分頁資料，切分頁再切回來
     時選單會對不上實際狀態（尤其是「不製作」，會影響畫布/匯出要不要跳過FL）。 */
  tab.data.flProductSlot = window._flProductSlotValue || '';
  tab.data.sellerName = S.sellerName;
  tab.data.flLogoBgMode = S.flLogoBgMode;
  tab.data.flLogoSampledColor = S.flLogoSampledColor;
  tab.data.flLogoExtraScale = S.flLogoExtraScale;
  tab.data.flLogoExtraOffX  = S.flLogoExtraOffX;
  tab.data.flLogoExtraOffY  = S.flLogoExtraOffY;
  tab.data.flAVariant = S.flAVariant;
  tab.data.flAText    = S.flAText;
  if(window.ShadowEditor) tab.data.shadowState = window.ShadowEditor.getFullState();
  if(S.imgs.host) tab.data.hostImg = S.imgs.host;
  /* LOGO編輯狀態（原圖＋縮放位移＋合成好的小卡）：每個分頁各自的廠商LOGO不同
     （尤其A級專場每包LOGO都不一樣），這裡沒有的話切分頁時S.logo2Raw只會是
     import當下比對到的那一份、或殘留上一個分頁的，不會跟著切換。 */
  if(S.logo2Raw !== undefined) tab.data.logo2Edit = {
    raw:S.logo2Raw, scale:S.logo2Scale, offX:S.logo2OffX, offY:S.logo2OffY, shape:S.logo2Shape
  };
  if(S.imgs.logo2) tab.data.logo2Img = S.imgs.logo2;

  /* 非同步問每個 iframe 目前真正的定位狀態，不能直接同步戳 contentWindow.D——
     這裡常常是 composeShadow() 剛 broadcastFull() 完就馬上呼叫到，iframe
     這時候可能還沒處理完剛廣播的合成圖，同步讀到的會是舊值（見
     getAllCanvasStates() 註解）。等真正問到結果才存、才呼叫 cb()。 */
  getAllCanvasStates(function(states){
    tab.data.canvasState = states;
    if(cb) cb();
  });
}

/* 舊存檔可能還是用 flLogoIsWhite（布林），新版改成 flLogoBgMode（字串二選一）。
   這裡統一處理相容轉換，兩個讀取的地方（applyTabData／applyState）都呼叫這裡，
   不要各自重複寫一份判斷。
   另外也把短暫存在過的 'colored'（完全透明不畫背景，後來確認理解錯誤已拿掉的選項）
   一併轉成 'sampled'，避免那段時間存的分頁/專案讀回來變成不存在的模式。 */
function resolveFlLogoBgMode(d){
  var mode = d.flLogoBgMode || (d.flLogoIsWhite === false ? 'sampled' : 'white');
  if(mode === 'colored') mode = 'sampled';
  return mode;
}

/* 記住「這個分頁的資料物件」是否已經被 applyTabData() 套用過至少一次——
   逐包確認流程（startALevelReview／startBLevelReview）要用這個判斷：只有
   「這個分頁在這次工單匯入後從來沒被畫布顯示過」才需要強制重套 tab.data
   （避免套到匯入當下還是空白畫面的問題，見那兩支函式的註解）；如果已經顯示
   過、使用者可能已經在1200畫布上手動調整過商品位置，就不能再重套，不然會把
   剛調好的位置蓋回 tab.data 裡「匯入當下比對出來的」舊位置，變成「一點就跳回
   初始排版」。用 tab.data 物件本身當 key，跟 shadow-canvas.js 的
   _canvasTabPositions 是同一種做法。 */
var _appliedTabDatas = new WeakSet();

function applyTabData(tab, loadHost){
  var d = tab.data || {};
  if(d) _appliedTabDatas.add(d);
  S.sellerName = d.sellerName || d.logoName || '';
  S.flLogoBgMode = resolveFlLogoBgMode(d);
  S.flLogoSampledColor = d.flLogoSampledColor || '#ffffff';
  S.flLogoExtraScale = d.flLogoExtraScale !== undefined ? d.flLogoExtraScale : 1;
  S.flLogoExtraOffX  = d.flLogoExtraOffX  !== undefined ? d.flLogoExtraOffX  : 0;
  S.flLogoExtraOffY  = d.flLogoExtraOffY  !== undefined ? d.flLogoExtraOffY  : 0;
  /* A級專場方形FL ICON：每次都直接同步（含清空），不能只在有值時才覆蓋──
     不然切到「不製作」或B級/舊格式分頁時，會沿用上一個A級分頁殘留的文案 */
  S.flAVariant = d.flAVariant || 'skip';
  S.flAText    = d.flAText    || '';
  setTheme(d.theme || DEFAULT_THEME);
  /* 手動調過的主副標色：直接套回去，不走自動配色 */
  if(d.textColorManual){
    S.textColorManual = true;
    var elSub  = document.getElementById('cSub');  if(elSub  && d.cSub)  elSub.value  = d.cSub;
    var elMain = document.getElementById('cMain'); if(elMain && d.cMain) elMain.value = d.cMain;
    var elDate = document.getElementById('cDate'); if(elDate && d.cDate) elDate.value = d.cDate;
  } else {
    S.textColorManual = false;
  }
  var fields = {
    'txt-main': d.main  || '',
    'txt-sub':  d.sub   || '',
    'txt-time': d.time  || '',
    'txt-brand':d.brand || '',
    'txt-fl':   d.flText|| ''
  };
  Object.keys(fields).forEach(function(id){
    var el = document.getElementById(id);
    if(el && fields[id]) el.value = fields[id];
  });
  /* 日期／時間已經合併成同一欄（工單只填「時間」，同時包含日期），
     txt-date 這格現在只是舊格式留下的殘餘欄位。這裡不能跟上面一樣「只有值才覆蓋」，
     不然切換分頁/重新匯入時，舊分頁殘留的日期字串不會被清掉，會跟新的合併時間重複顯示。
     所以 txt-date 每次都直接同步（含清空），不管 d.date 有沒有值。 */
  var elDate = document.getElementById('txt-date');
  if(elDate) elDate.value = d.date || '';

  /* FL ICON 下拉選單：每次都直接同步（含清空），跟 txt-date 同樣道理——
     不能只在有值時才覆蓋，不然切到「不製作」的分頁時，選單還停在上一個
     分頁的值（例如「商品1」），畫布/匯出判斷是否要跳過FL就會跟著錯。 */
  var flSlotEl = document.getElementById('fl-product-slot');
  if(flSlotEl) flSlotEl.value = d.flProductSlot || '';
  window._flProductSlotValue = d.flProductSlot || null;

  /* 陰影套件：還原這個分頁完整的素材/比例/疊放順序＋版型組合。
     shadowState 是新格式（包含素材圖片本身，不是只有版型代號），
     沒有的話（例如舊格式暫存檔）退回只還原版型代號 */
  if(window.ShadowEditor){
    if(d.shadowState) window.ShadowEditor.restoreState(d.shadowState);
    else if(d.combo) window.ShadowEditor.setCombo(d.combo);
  }

  /* LOGO編輯狀態：還原這個分頁自己存過的（logo2Edit，見 saveCurrentTabState）。
     每包A級專場的LOGO廠商都不一樣，沒存過的話要清空，不能沿用上一個分頁
     殘留的LOGO——沒清空的話切到新分頁時，「編輯LOGO」彈窗會誤顯示上一包的圖。 */
  if(d.logo2Edit && d.logo2Edit.raw){
    S.logo2Raw   = d.logo2Edit.raw;
    S.logo2Scale = d.logo2Edit.scale;
    S.logo2OffX  = d.logo2Edit.offX;
    S.logo2OffY  = d.logo2Edit.offY;
    S.logo2Shape = d.logo2Edit.shape;
    S.imgs.logo2 = d.logo2Img || null;
  } else {
    S.logo2Raw = null; S.imgs.logo2 = null;
    S.logo2Scale = undefined; S.logo2OffX = undefined; S.logo2OffY = undefined; S.logo2Shape = undefined;
  }

  /* 恢復主持人圖片：這裡的「主持人」圖層現在專門給陰影編輯 popup 匯出的合成圖使用，
     不再依 Excel 主持人姓名自動從圖庫載入單張人像照（避免跟陰影套件的圖重複出現） */
  if(loadHost){
    if(d.hostImg){
      S.imgs.host = d.hostImg;
      broadcastFull();
      /* broadcastFull 之後再恢復位置，避免被 initHostPos 蓋掉 */
      if(d.canvasState){
        setTimeout(function(){
          Object.keys(d.canvasState).forEach(function(id){
            var ifr = iframes[id];
            if(ifr && ifr.contentWindow){
              ifr.contentWindow.postMessage({type:'BN_RESTORE_STATE', state:d.canvasState[id]}, '*');
            }
          });
        }, 300);
      }
    } else {
      broadcast();
    }
  } else {
    broadcast();
  }

  if(typeof ccFl === 'function') ccFl();
  if(typeof updateFlCanvasVisibility === 'function') updateFlCanvasVisibility();
  if(typeof updateFlA1CanvasVisibility === 'function') updateFlA1CanvasVisibility();
}
var iframes = {}; // id -> iframe element


/* ── Upload ── */

function collectState(){
  return {
    version:1,ts:Date.now(),theme:S.theme,
    textColorManual: S.textColorManual,
    texts:{brand:v('txt-brand'),main:v('txt-main'),sub:v('txt-sub'),date:v('txt-date'),time:v('txt-time'),flText:v('txt-fl')},
    flProductSlot: window._flProductSlotValue || '',
    colors:{cSub:v('cSub'),cMain:v('cMain'),cDate:v('cDate'),cSep:v('cSep')},
    fmt:'jpeg',
    imgs:{ host:S.imgs.host, logo1:S.imgs.logo1, logo2:S.imgs.logo2 },
    logo2Edit:{ raw:S.logo2Raw, scale:S.logo2Scale, offX:S.logo2OffX, offY:S.logo2OffY, shape:S.logo2Shape },
    sellerName: S.sellerName,
    flLogoBgMode: S.flLogoBgMode,
    flLogoSampledColor: S.flLogoSampledColor,
    flLogoExtraScale: S.flLogoExtraScale,
    flLogoExtraOffX:  S.flLogoExtraOffX,
    flLogoExtraOffY:  S.flLogoExtraOffY
  };
}

function applyState(data){
  if(!data||data.version!==1) return;
  setTheme(data.theme || DEFAULT_THEME);
  function set(id,val){ var el=document.getElementById(id); if(el&&val!==undefined){el.value=val;} }
  if(data.texts){ set('txt-brand',data.texts.brand);set('txt-main',data.texts.main);set('txt-sub',data.texts.sub);set('txt-date',data.texts.date);set('txt-time',data.texts.time);set('txt-fl',data.texts.flText); }
  var flSlotEl2 = document.getElementById('fl-product-slot');
  if(flSlotEl2) flSlotEl2.value = data.flProductSlot || '';
  window._flProductSlotValue = data.flProductSlot || null;
  if(typeof ccFl === 'function') ccFl();
  if(typeof updateFlCanvasVisibility === 'function') updateFlCanvasVisibility();
  /* 手動覆蓋的主副標色：applySeedHex已算好自動配色，若有手動色則蓋掉 */
  if(data.colors){
    set('cSub',data.colors.cSub);set('cMain',data.colors.cMain);set('cDate',data.colors.cDate);set('cSep',data.colors.cSep);
  }
  S.textColorManual = !!data.textColorManual;
  if(data.logo2Edit){
    S.logo2Raw=data.logo2Edit.raw; S.logo2Scale=data.logo2Edit.scale;
    S.logo2OffX=data.logo2Edit.offX; S.logo2OffY=data.logo2Edit.offY; S.logo2Shape=data.logo2Edit.shape;
  }
  S.sellerName = data.sellerName || '';
  S.flLogoBgMode = resolveFlLogoBgMode(data);
  S.flLogoSampledColor = data.flLogoSampledColor || '#ffffff';
  S.flLogoExtraScale = data.flLogoExtraScale !== undefined ? data.flLogoExtraScale : 1;
  S.flLogoExtraOffX  = data.flLogoExtraOffX  !== undefined ? data.flLogoExtraOffX  : 0;
  S.flLogoExtraOffY  = data.flLogoExtraOffY  !== undefined ? data.flLogoExtraOffY  : 0;
  /* showCTA 由 layout 自己控制 */
  if(data.imgs){
    Object.keys(data.imgs).forEach(function(key){
      var src=data.imgs[key]; if(!src) return;
      S.imgs[key]=src;
      var imgEl=document.getElementById(key+'-img');
      if(imgEl){ imgEl.src=src; imgEl.dataset.baseSrc=src; }
      var item=document.getElementById(key+'-item');
      if(item) item.style.display='block';
      var labels={host:'人物已載入',logo1:'蝦皮直播 Logo 已載入',logo2:'明星直播間 Logo 已載入'};
      markUpload(key,labels[key]);
    });
  }
  /* 還原所有分頁 */
  if(data.tabs && data.tabs.length){
    buildTabs(data.tabs);
    /* buildTabs 會觸發 tab-0，若儲存時在其他頁則延遲切換 */
    var restoreTab = (typeof data.activeTab==='number') ? data.activeTab : 0;
    if(restoreTab > 0 && TABS[restoreTab]){
      setTimeout(function(){
        ACTIVE_TAB = restoreTab;
        renderTabBar();
        applyTabData(TABS[ACTIVE_TAB], true);
      }, 1000);
    }
  } else {
    broadcastFull(); // 舊格式（無 tabs）載入暫存時需要傳圖片
  }
}

/* 組出「暫存檔」的完整 JSON blob——存檔按鈕、下載zip時自動附帶的暫存檔
   都呼叫這裡，確保兩邊格式永遠一致。呼叫前務必先 saveCurrentTabState()，
   不然 TABS[ACTIVE_TAB].data 可能還是舊的，暫存檔裡的內容會對不上畫面現況。 */
function buildStateBlob(){
  var state = collectState();
  state.tabs = TABS;
  state.activeTab = ACTIVE_TAB;
  return new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
}

document.getElementById('btn-save').addEventListener('click',function(){
  pm.show('儲存暫存');
  pm.update(10, '收集狀態…');
  saveCurrentTabState(function(){
    pm.update(50, '產生檔案…');
    var blob = buildStateBlob();
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='個人專場_暫存_'+(v('txt-date')||'draft').replace(/\//g,'-')+'.json';
    a.click(); setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
    pm.done('暫存已下載');
    pm.hide();
  });
});


function clearAllStorage(){
  if(!confirm('確定清除所有暫存？\n（版位清單、主持人圖庫將重設）')) return;
  localStorage.removeItem(STORE_KEY);
  localStorage.removeItem(HOST_LIST_KEY);
  toast('暫存已清除，重新整理中...','ok',2000);
  setTimeout(function(){ location.reload(); }, 1200);
}

document.getElementById('loadFile').addEventListener('change',function(e){
  var file=e.target.files[0]; if(!file) return;
  var reader=new FileReader();
  reader.onload=function(ev){
    try{ applyState(JSON.parse(ev.target.result)); toast('暫存已載入','ok'); }
    catch(_){ toast('暫存格式錯誤','err'); }
  };
  reader.readAsText(file); this.value='';
});

/* ── Download ── */

