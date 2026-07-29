'use strict';

var S = {
  theme:'A',
  bgUrls:{ A:'../backgrounds/', B:'../backgrounds/', C:'../backgrounds/' }, // backgrounds/ 底下沒有 A/B/C 子資料夾，全部檔案都在同一層
  imgs:{ host:null, logo1:null, logo2:null },
  // logo2 編輯面板用：原圖（未合成）＋當時的縮放位移/形狀，供「編輯 Logo2」重新叫出面板還原
  logo2Raw:null, logo2Scale:undefined, logo2OffX:undefined, logo2OffY:undefined, logo2Shape:undefined,
  // 雙logo（共播）模式的第二格，logo2Shape==='double'時才有值
  logo2RawB:null, logo2ScaleB:undefined, logo2OffXB:undefined, logo2OffYB:undefined,
  logo2TopSlot:'B', // 雙logo共用範圍模式：誰疊在上面（'A'或'B'）
  maskOn:false, // 底部遮罩（補主持人身體過短）：一鍵開關套用到所有版位，預設關閉
  flTheme:'A',  // 直播間FL 公版切換（A/B/C/D/N），跟縮圖/LPBN的 theme 分開，各廠商分頁各自獨立
  flStyle:'無', // 直播間FL 版型：'LOGO' | '無' | '案型'（來自工單「05_直播間FL/版型」欄位）
  /* 直播間FL「LOGO」版型專用：底色類型（'white'=白底+橘框／'sampled'=吸Logo素材本身底色，不加框）
     跟「FL額外放大／位移」——Logo2編輯畫布本身的縮放跟FL色塊的長寬比不一樣，光靠logo2那組
     數字有時候怎麼調都填不滿FL膠囊框，這裡另外留一組獨立的旋鈕給使用者在FL示意圖上直接調整。 */
  flLogoBgMode:'white', flLogoSampledColor:'#ffffff',
  flLogoExtraScale:1, flLogoExtraOffX:0, flLogoExtraOffY:0,
};
var BG_TEXT_DEF={ // 主標/日期/副標顏色已固定，三個款式都用同一組，避免 setTheme 被觸發時覆蓋掉
  A:{s:'#ffffff',m:'#ffe933'},
  B:{s:'#ffffff',m:'#ffe933'},
  C:{s:'#ffffff',m:'#ffe933'},
};

/* ── iframe 清單 ── */
/* LAYOUTS 從後台 localStorage 讀取啟用的版位 */
var STORE_KEY = 'bn_admin_shrimp2choice_v1';
var DEFAULT_LAYOUTS = [
  { id:'01_thumbnail', name:'直播時縮圖',                  file:'01_thumbnail.html', w:720,  h:720,  enabled:true },
  { id:'02_lpbn',      name:'直播大廳 LPBN',               file:'02_lpbn.html',      w:1125, h:360,  enabled:true },
  { id:'04_opening',   name:'開播字卡',                    file:'04_opening.html',   w:1080, h:1920, enabled:true },
  { id:'05_fl',        name:'直播間FL',                    file:'05_fl.html',        w:336,  h:120,  enabled:true },
  /* 06_案型字卡刻意不放進這個清單——它一個廠商可能有1~4張，不是「一個版位一個iframe」
     的固定模式，是另外用 card-plugin.js 的 buildCardStrip() 動態產生 06_card_1~4
     這幾個獨立iframe，接在畫布區最下面。放進這裡會多長出一個沒資料的重複iframe。 */
];
/* 版本號：每次更新 DEFAULT_LAYOUTS 時遞增，強制後台讀新清單 */
var DEFAULT_LAYOUTS_VERSION = 11; // v11: LPBN名稱移除「（有/無CTA）2版」文案

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
  /* initialIndex：目前工單匯入用不到，保留參數是跟 personal-event 那份共用同一套
     buildTabs() 介面，之後如果蝦殺這邊也要「匯入時跳到指定分頁」可以直接用，
     沒指定就維持原本行為用0。 */
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
      '<button class="nav-add-btn" onclick="openImportModal()" title="匯入工單建立分頁">+</button>'+
      '<span style="font-size:12px;color:var(--text-dim);">點 + 匯入工單，自動建立分頁</span>'+
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
    '</button>'+
    '<button class="nav-add-btn" onclick="openImportModal()" title="匯入工單建立分頁">+</button>';

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

/* 分頁下拉選單：純攤平清單橫向換行排列（蝦殺廠商分頁不分級，
   跟個人專場那套依A級/B級分組的版本不一樣，故意不套用分組邏輯）。 */
function renderNavDropdown(){
  var panel = document.getElementById('nav-dropdown-panel');
  if(!panel) return;
  panel.innerHTML = '<div class="nav-dropdown-grid">'+
    TABS.map(function(tab, i){
      return '<button class="nav-btn'+(i===ACTIVE_TAB?' active':'')+'" onclick="switchTab('+i+')">'+tab.label+'</button>';
    }).join('')+
  '</div>';
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
  tab.data.main  = v('txt-main')  || tab.data.main;
  tab.data.sub   = v('txt-sub')   || tab.data.sub;
  tab.data.date  = v('txt-date')  || tab.data.date;
  tab.data.time  = v('txt-time')  || tab.data.time;
  tab.data.brand = v('txt-brand') || tab.data.brand;
  tab.data.guest = v('txt-guest') || tab.data.guest;
  tab.data.flText = v('txt-fl') || tab.data.flText;
  tab.data.flTheme = S.flTheme;
  tab.data.flStyle = S.flStyle;
  if(S.imgs.logo1) tab.data.logo1 = S.imgs.logo1;
  /* logo2（廠商自己的Logo）也要跟著分頁各自獨立存——之前只有logo1有存，
     logo2Raw/scale/offset/shape這組完全沒接，切分頁會全部共用同一份，
     等於每個廠商都被上一個廠商調整過的Logo2蓋掉 */
  tab.data.logo2Raw = S.logo2Raw || null;
  tab.data.logo2Scale = S.logo2Scale;
  tab.data.logo2OffX = S.logo2OffX;
  tab.data.logo2OffY = S.logo2OffY;
  tab.data.logo2Shape = S.logo2Shape;
  // 雙logo（共播）模式的第二格，跟A格用同一套邏輯各自獨立存
  tab.data.logo2RawB = S.logo2RawB || null;
  tab.data.logo2ScaleB = S.logo2ScaleB;
  tab.data.logo2OffXB = S.logo2OffXB;
  tab.data.logo2OffYB = S.logo2OffYB;
  tab.data.logo2TopSlot = S.logo2TopSlot || 'B';
  /* 直播間FL「LOGO」版型的底色模式/額外縮放位移，也是每個廠商分頁各自獨立
     （不同廠商Logo形狀不同，調的量也不一樣，不該共用同一份） */
  tab.data.flLogoBgMode = S.flLogoBgMode;
  tab.data.flLogoSampledColor = S.flLogoSampledColor;
  tab.data.flLogoExtraScale = S.flLogoExtraScale;
  tab.data.flLogoExtraOffX = S.flLogoExtraOffX;
  tab.data.flLogoExtraOffY = S.flLogoExtraOffY;
  if(S.imgs.logo2) tab.data.logo2 = S.imgs.logo2;
  if(S.imgs.logo2Fl) tab.data.logo2Fl = S.imgs.logo2Fl;
  if(window.ShadowEditor) tab.data.combo = window.ShadowEditor.getCombo() || tab.data.combo;
  /* 完整商品/主持人 slots 也要存，不然切分頁時圖片會殘留上一個廠商的 */
  if(window.ShadowEditor) tab.data.shadowState = window.ShadowEditor.getFullState();
  if(S.imgs.host) tab.data.hostImg = S.imgs.host;

  /* 用 BN_GET_STATE／BN_CANVAS_STATE 非同步問答取得各版位真正的畫布位置，
     不能直接同步讀 iframe.contentWindow.D——broadcastFull() 剛送出的postMessage
     是fire-and-forget，呼叫端同步往下執行時iframe大多還沒收到/處理那則訊息，
     這裡如果同步讀，讀到的會是上一個分頁殘留的舊值、或這個分頁從沒被
     initHostPos() 定位過的原始預設值，之後切分頁/批次匯出重新套用時，
     這組過期數字就會蓋掉 initHostPos() 剛算好的正確結果（完整根因見調查紀錄）。 */
  getAllCanvasStates(function(states){
    tab.data.canvasState = states;

    /* 案型字卡：每個廠商分頁各自獨立的張數/文案，用深拷貝存，避免切分頁時互相污染 */
    if(S.cards) tab.data.cards = JSON.parse(JSON.stringify(S.cards));
    // 用 != null 而不是單純 if(S.cardCount)：cardCount=0（工單全部fault，整組隱藏）
    // 也要能正確存回去，不然切分頁再切回來會被下面 applyTabData 的 fallback 誤救回1張
    if(S.cardCount != null) tab.data.cardCount = S.cardCount;
    if(S.activeCard != null) tab.data.activeCard = S.activeCard;

    if(cb) cb();
  });
}

function applyTabData(tab, loadHost){
  var d = tab.data || {};
  if(d.theme) setTheme(d.theme);
  var fields = {
    'txt-main': d.main  || '',
    'txt-sub':  d.sub   || '',
    'txt-brand':d.brand || '',
    'txt-guest':d.guest || '',
    'txt-fl':   d.flText|| ''
  };
  Object.keys(fields).forEach(function(id){
    var el = document.getElementById(id);
    if(el && fields[id]) el.value = fields[id];
  });
  setFlTheme(d.flTheme || 'A');
  setFlStyle(d.flStyle || '無');
  /* 日期／時間是兩個獨立欄位（txt-date + txt-time），跟工單解析出來的
     date/time 兩個欄位一一對應（見 workorder-parser-shrimp.js 的 excelDateToParts）。
     這裡不能跟上面一樣「只有值才覆蓋」，不然切換分頁/重新匯入時，
     舊分頁殘留的日期或時間字串不會被清掉，會跟新分頁的內容重複/混雜顯示。
     所以這兩欄每次都直接同步（含清空），不管 d.date/d.time 有沒有值。 */
  var elDate = document.getElementById('txt-date');
  if(elDate) elDate.value = d.date || '';
  var elTime = document.getElementById('txt-time');
  if(elTime) elTime.value = d.time || '';

  /* 案型字卡：切分頁時換成這個廠商自己的張數/文案。
     d.cardCount 完全沒存過（undefined/null，例如全新分頁）才退回預設1張；
     0 是工單判定「案型字卡全部fault」的正常結果，要維持0（整組隱藏），不能被||1誤救回1張 */
  S.cards = (d.cards && d.cards.length) ? JSON.parse(JSON.stringify(d.cards)) : [];
  S.cardCount = (d.cardCount != null) ? d.cardCount : 1;
  S.activeCard = d.activeCard || 0;
  if(typeof ensureCards === 'function') ensureCards();
  if(typeof buildCardStrip === 'function') buildCardStrip();
  if(typeof renderCardPanel === 'function') renderCardPanel();
  if(typeof broadcastAllCards === 'function') setTimeout(broadcastAllCards, 300);

  /* 陰影套件：優先用完整 snapshot 還原（slots+combo+order 一次到位）；
     沒有 snapshot（例如全新分頁）才退回只設定 combo，並清空 slots，
     避免殘留上一個廠商分頁的商品/主持人圖片 */
  if(window.ShadowEditor){
    if(d.shadowState){
      window.ShadowEditor.setFullState(d.shadowState);
    } else if(d.combo){
      window.ShadowEditor.setCombo(d.combo);
    }
  }

  /* 恢復主持人圖片：這裡的「主持人」圖層現在專門給陰影編輯 popup 匯出的合成圖使用，
     不再依 Excel 主持人姓名自動從圖庫載入單張人像照（避免跟陰影套件的圖重複出現） */
  if(loadHost){
    S.imgs.logo1 = d.logo1 || null; // 廠商 Logo 也是每個廠商分頁各自獨立，切分頁要跟著換
    /* logo2 一樣要跟著分頁還原——沒有的話清空，不然會殘留上一個廠商調整過的Logo2 */
    S.imgs.logo2 = d.logo2 || null;
    /* 直播間FL「LOGO」版型專用：透明底、只有logo本身的合成圖（不含Logo2小卡的白底），
       確認並套用時才會烤出來，見 logo2ComposeFlVariant() */
    S.imgs.logo2Fl = d.logo2Fl || null;
    S.logo2Raw = d.logo2Raw || null;
    S.logo2Scale = d.logo2Scale;
    S.logo2OffX = d.logo2OffX;
    S.logo2OffY = d.logo2OffY;
    S.logo2Shape = d.logo2Shape;
    // 雙logo（共播）模式的第二格
    S.logo2RawB = d.logo2RawB || null;
    S.logo2ScaleB = d.logo2ScaleB;
    S.logo2OffXB = d.logo2OffXB;
    S.logo2OffYB = d.logo2OffYB;
    S.logo2TopSlot = d.logo2TopSlot || 'B';
    S.flLogoBgMode = d.flLogoBgMode || 'white';
    S.flLogoSampledColor = d.flLogoSampledColor || '#ffffff';
    S.flLogoExtraScale = d.flLogoExtraScale !== undefined ? d.flLogoExtraScale : 1;
    S.flLogoExtraOffX = d.flLogoExtraOffX || 0;
    S.flLogoExtraOffY = d.flLogoExtraOffY || 0;
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
}
var iframes = {}; // id -> iframe element


function setFlTheme(t){
  S.flTheme = t;
  ['A','B','C','D','N'].forEach(function(k){
    var btn = document.getElementById('fl-theme-btn-'+k);
    if(btn) btn.classList.toggle('active', k===t);
  });
  broadcast();
}

function setFlStyle(s){
  S.flStyle = s;
  var sel = document.getElementById('fl-style-sel');
  if(sel) sel.value = s;
  /* FL ICON文案欄位：只有版型選「無（顯示文案）」才需要輸入文字，
     LOGO／案型這兩種版型顯示的是圖片，文字欄位沒有意義，不顯示 */
  var textField = document.getElementById('fl-text-field');
  if(textField) textField.style.display = (s === '無') ? '' : 'none';
  broadcast();
  if(typeof logo2UpdateFlPreview === 'function') logo2UpdateFlPreview();
}

function setTheme(t){
  S.theme=t;
  var def=BG_TEXT_DEF[t];
  document.getElementById('cSub').value=def.s;
  document.getElementById('cMain').value=def.m;
  document.getElementById('cDate').value=def.s;
  /* 更新 theme 按鈕 active */
  ['A','B','C'].forEach(function(k){
    var btn = document.getElementById('theme-btn-'+k);
    if(btn) btn.classList.toggle('active', k===t);
  });
  broadcast();
}

/* ── Upload ── */

function collectState(){
  return {
    version:1,ts:Date.now(),theme:S.theme,
    texts:{brand:v('txt-brand'),guest:v('txt-guest'),main:v('txt-main'),sub:v('txt-sub'),date:v('txt-date'),time:v('txt-time'),flText:v('txt-fl')},
    colors:{cSub:v('cSub'),cMain:v('cMain'),cDate:v('cDate')},
    fmt:'jpeg', /* 格式由各版位 spec.fmt 決定 */
    imgs:{ host:S.imgs.host, logo1:S.imgs.logo1, logo2:S.imgs.logo2, logo2Fl:S.imgs.logo2Fl },
    logo2Edit:{ raw:S.logo2Raw, scale:S.logo2Scale, offX:S.logo2OffX, offY:S.logo2OffY, shape:S.logo2Shape,
      rawB:S.logo2RawB, scaleB:S.logo2ScaleB, offXB:S.logo2OffXB, offYB:S.logo2OffYB, topSlot:S.logo2TopSlot },
    flLogo:{ bgMode:S.flLogoBgMode, sampledColor:S.flLogoSampledColor, extraScale:S.flLogoExtraScale, extraOffX:S.flLogoExtraOffX, extraOffY:S.flLogoExtraOffY }
  };
}

function applyState(data){
  if(!data||data.version!==1) return;
  setTheme(data.theme||'A');
  function set(id,val){ var el=document.getElementById(id); if(el&&val!==undefined){el.value=val;} }
  if(data.texts){ set('txt-brand',data.texts.brand);set('txt-guest',data.texts.guest);set('txt-main',data.texts.main);set('txt-sub',data.texts.sub);set('txt-date',data.texts.date);set('txt-time',data.texts.time);set('txt-fl',data.texts.flText); }
  if(data.colors){ set('cSub',data.colors.cSub);set('cMain',data.colors.cMain);set('cDate',data.colors.cDate); }
  if(data.logo2Edit){
    S.logo2Raw=data.logo2Edit.raw; S.logo2Scale=data.logo2Edit.scale;
    S.logo2OffX=data.logo2Edit.offX; S.logo2OffY=data.logo2Edit.offY; S.logo2Shape=data.logo2Edit.shape;
    S.logo2RawB=data.logo2Edit.rawB||null; S.logo2ScaleB=data.logo2Edit.scaleB;
    S.logo2OffXB=data.logo2Edit.offXB; S.logo2OffYB=data.logo2Edit.offYB;
    S.logo2TopSlot=data.logo2Edit.topSlot||'B';
  }
  if(data.flLogo){
    S.flLogoBgMode=data.flLogo.bgMode||'white'; S.flLogoSampledColor=data.flLogo.sampledColor||'#ffffff';
    S.flLogoExtraScale=data.flLogo.extraScale!==undefined?data.flLogo.extraScale:1;
    S.flLogoExtraOffX=data.flLogo.extraOffX||0; S.flLogoExtraOffY=data.flLogo.extraOffY||0;
  }
  /* showCTA 由 layout 自己控制 */
  if(data.imgs){
    Object.keys(data.imgs).forEach(function(key){
      var src=data.imgs[key]; if(!src) return;
      S.imgs[key]=src;
      var imgEl=document.getElementById(key+'-img');
      if(imgEl){ imgEl.src=src; imgEl.dataset.baseSrc=src; }
      var item=document.getElementById(key+'-item');
      if(item) item.style.display='block';
      var labels={host:'主持人已載入',logo1:'蝦皮直播 Logo 已載入',logo2:'明星直播間 Logo 已載入'};
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
    a.download='蝦殺二選一_暫存_'+(v('txt-date')||'draft').replace(/\//g,'-')+'.json';
    a.click(); setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
    pm.done('暫存已下載');
    pm.hide();
  });
});


function clearAllStorage(){
  if(!confirm('確定清除所有暫存？\n（版位清單、主持人圖庫將重設）')) return;
  localStorage.removeItem('bn_admin_shrimp2choice_v1');
  localStorage.removeItem('bn_hosts_shrimp2choice_v1');
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

