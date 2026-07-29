'use strict';

var S = {
  theme:'A',
  bgUrls:{ A:'../backgrounds/', B:'../backgrounds/', C:'../backgrounds/' }, // backgrounds/ 底下沒有 A/B/C 子資料夾，全部檔案都在同一層
  /* 底色吸取（毛孩衝蝦米新增）：LPBN／縮圖／開播字卡／FL Icon／Tab 這幾個版位改吃這顆種子色，
     不再用 backgrounds/ 圖片；IG／MSBN／天空標維持原本 theme(A/B/C)+bg圖 系統不受影響。
     seedHex 來源：側欄「背景顏色」色票 或 Excel 工單「背景色碼」欄位，都走 applySeedHex() 這個入口。 */
  seedHex: '#0D3165',
  seedPalette: null, // ColorThemeEngine.generateFromSeed() 算出來的整套配色，applySeedHex() 時更新
  imgs:{ host:null, logo1:null, logo2:null },
  // logo2 編輯面板用：原圖（未合成）＋當時的縮放位移/形狀，供「編輯 Logo2」重新叫出面板還原
  logo2Raw:null, logo2Scale:undefined, logo2OffX:undefined, logo2OffY:undefined, logo2Shape:undefined,
  /* 直播間FL(07_fl) LOGO版型專用：底色類型（white=白底＋橘框／sampled=吸Logo底色填滿）
     ＋吸出來的顏色＋FL示意圖專屬的額外縮放/位移（跟logo2Scale/OffX/OffY分開，
     因為logo2編輯畫布跟FL色塊長寬比不一樣，光靠那組數字有時候怎麼調都填不滿FL） */
  flLogoBgMode:'white', flLogoSampledColor:'#ffffff',
  flLogoExtraScale:1, flLogoExtraOffX:0, flLogoExtraOffY:0,
  maskOn:false, // 底部遮罩（補主持人身體過短）：一鍵開關套用到所有版位，預設關閉
};
var BG_TEXT_DEF={ // 主標/日期/副標顏色已固定，三個款式都用同一組，避免 setTheme 被觸發時覆蓋掉
  // 注意：欄位命名跟顯示標籤是反的——s 對應「主標／日期」色票，m 對應「副標」色票
  A:{s:'#0074b3',m:'#ce3775'},
  B:{s:'#0074b3',m:'#ce3775'},
  C:{s:'#0074b3',m:'#ce3775'},
};

/* ── iframe 清單 ── */
/* LAYOUTS 從後台 localStorage 讀取啟用的版位 */
var STORE_KEY = 'bn_admin_pet_frenzy_v1';
var DEFAULT_LAYOUTS = [
  { id:'01_thumbnail', name:'直播時縮圖',                  file:'01_thumbnail.html', w:720,  h:720,  enabled:true },
  { id:'02_lpbn',      name:'直播大廳 LPBN（有/無CTA）2版', file:'02_lpbn.html',      w:1125, h:360,  enabled:true },
  { id:'05_opening',   name:'開播字卡',                    file:'05_opening.html',   w:1080, h:1920, enabled:true },
  { id:'07_fl',        name:'直播間FL',                    file:'07_fl.html',        w:336,  h:120,  enabled:true },
  { id:'09_tab',       name:'直播大廳Tab',                file:'09_tab.html',       w:339,  h:144,  enabled:true },
];
/* 版本號：每次更新 DEFAULT_LAYOUTS 時遞增，強制後台讀新清單 */
/* v1（佳宜好朋友專案獨立版本號起算）：從 lifestyle-channel-split 拆出，照工單順序重新編號
   （05_opening／06_msbn／07_fl），移除工單沒有的 05_fb_post、08_sbn；
   08_天空標字卡（新版位，設計稿確認後補上）目前尚未加入清單。
   v2：08_天空標字卡設計稿已確認，加入清單（固定背景圖＋logo置中，見 08_sky.html）。
   v3（毛孩衝蝦米新專案）：新增 09_tab（直播大廳Tab，339×144，白底＋置中logo）。
   v4：跟 Iona 對照這份工單「總製作內容」（B7:F7：LP BN／縮圖／開播字卡／Tab／FL Icon
   共5項），移除工單沒有列出的 04_ig、06_msbn、08_sky。這裡只是從清單移除、不會廣播
   給不存在的版位，04_ig.html/06_msbn.html/08_sky.html 檔案本身沒有刪除，之後這個工單
   或下一個工單如果又要用，把這三行加回來即可（沿用同一套「移除工單沒有的版位」慣例，
   見上面 v1 的做法）。*/
var DEFAULT_LAYOUTS_VERSION = 4;

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

/* 取 FL ICON 指定的商品 dataUrl（下拉選單選 '1'/'2'/'3' → product1/2/3 的陰影套件素材，
   'gift' → 後台固定的禮物盒 icon，不是使用者上傳的商品）
   若選的是「純文案」／「LOGO」／「不製作」（空字串/'logo'/'skip'）就回 null，
   FL版位收到 null 就不畫商品，只當純文案版型（版型T）處理。 */
function _flProductSlot(){
  var slot = window._flProductSlotValue;
  if(!slot || slot === 'logo' || slot === 'skip') return null;
  if(slot === 'gift') return '../logos/fl-gift-box.png'; // 固定內建圖示，跟商品1-3的來源（ShadowEditor素材）分開
  var slotId = 'product' + slot; // '1' → 'product1'
  if(window.ShadowEditor) return window.ShadowEditor.getSlotDataUrl(slotId) || null;
  return null;
}

/* ── 分頁（每天一組工單資料）── */
var TABS = [
  { id:'tab-1', label:'分頁 1', data:{} }
];
var ACTIVE_TAB = 0;

function buildTabs(tabs){
  TABS = tabs;
  ACTIVE_TAB = 0;
  renderTabBar();
  /* 等 iframe 就緒再套用第一個分頁 */
  setTimeout(function(){
    applyTabData(TABS[0], true);
  }, 800);
}

function renderTabBar(){
  var nav = document.getElementById('canvas-nav');
  if(!nav) return;
  nav.innerHTML = TABS.map(function(tab, i){
    return '<button class="nav-btn'+(i===ACTIVE_TAB?' active':'')+'" onclick="switchTab('+i+')">'+tab.label+'</button>';
  }).join('');
}

function switchTab(i){
  saveCurrentTabState(function(){
    ACTIVE_TAB = i;
    renderTabBar();
    applyTabData(TABS[i], true);
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
  tab.data.flProductSlot = (window._flProductSlotValue !== undefined && window._flProductSlotValue !== null) ? window._flProductSlotValue : tab.data.flProductSlot;
  if(window.ShadowEditor) tab.data.combo = window.ShadowEditor.getCombo() || tab.data.combo;
  if(S.imgs.host) tab.data.hostImg = S.imgs.host;

  /* 直接讀 iframe 的 D 物件，不用 postMessage */
  tab.data.canvasState = {};
  Object.keys(iframes).forEach(function(id){
    try{
      var D = iframes[id].contentWindow.D;
      if(D) tab.data.canvasState[id] = { imgX:D.imgX, imgY:D.imgY, imgScale:D.imgScale };
    }catch(e){}
  });

  if(cb) cb();
}

function applyTabData(tab, loadHost){
  var d = tab.data || {};
  if(d.theme) setTheme(d.theme);
  var fields = {
    'txt-main': d.main  || '',
    'txt-sub':  d.sub   || '',
    'txt-time': d.time  || '',
    'txt-brand':d.brand || '',
    'txt-guest':d.guest || '',
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

  /* 直播間FL ICON 選單（純文案／商品1-3／LOGO／不製作）跟 txt-fl 是分開的兩組欄位，
     txt-fl 已經在上面 fields 物件裡處理，這裡另外還原選單本身的值＋畫布/欄位顯示狀態 */
  var flSlotEl = document.getElementById('fl-product-slot');
  if(flSlotEl) flSlotEl.value = d.flProductSlot || '';
  window._flProductSlotValue = d.flProductSlot || null;
  if(typeof ccFl === 'function') ccFl();
  if(typeof updateFlCanvasVisibility === 'function') updateFlCanvasVisibility();
  /* 2026-07-29 跟 Iona 確認的bug：Excel 匯入LOGO版型時，buildTabs() 用 setTimeout 延遲
     800ms 才跑到這裡設定 fl-product-slot/txt-fl，但 Logo2 編輯popup（openLogo2Popup(true)）
     在那之前就已經開啟並讀過一次這兩個欄位的值，當下還是空的，示意圖因此判斷成「不是LOGO
     模式」而被藏起來，之後也沒人再刷新它——這裡補刷新一次，popup沒開著時
     logo2UpdateFlPreview() 內部會自己early return，不影響其他情況 */
  if(typeof logo2UpdateFlPreview === 'function') logo2UpdateFlPreview();

  /* 陰影套件：套用工單指定的版型組合（A/B/C/D） */
  if(d.combo && window.ShadowEditor){
    window.ShadowEditor.setCombo(d.combo);
  }

  /* A（2人）／B（2人+1品）／C（1人+2品）都有主持人，預設直接開啟底部遮罩
     （補主持人身體過短），不用每次匯入後還要手動勾選；D（3品，純商品沒有人物）
     不需要，維持預設關閉。 */
  if(d.combo === 'A' || d.combo === 'B' || d.combo === 'C'){
    S.maskOn = true;
    var maskInput = document.getElementById('mask-toggle-input');
    if(maskInput) maskInput.checked = true;
    broadcastPayload({ maskOn: true });
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
}
var iframes = {}; // id -> iframe element


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

/* ── 底色吸取（毛孩衝蝦米新增）──
   唯一入口：側欄「背景顏色」色票／文字輸入框、Excel工單「背景色碼」欄位，都呼叫這裡。
   只影響 S.seedHex／S.seedPalette，並更新 cSub/cMain/cDate 這三個共用欄位（跟 setTheme 共用同一組欄位，
   同一批工單只會有一顆背景色，LPBN/縮圖/開播字卡/FL Icon/Tab 用同一套文字色是合理的）。
   IG/MSBN/天空標目前還是吃 cSub/cMain/cDate 這幾個共用欄位，套用底色吸取後文字色也會跟著變，
   如果之後想讓這幾個版位維持原本 theme(A/B/C) 固定色不受影響，要另外拆欄位，先不做。 */
function applySeedHex(hex){
  if(!window.ColorThemeEngine){ console.warn('ColorThemeEngine 未載入，略過底色吸取'); return; }
  var normalized = window.ColorThemeEngine.normalizeHex(hex);
  if(!normalized) return;
  var palette = window.ColorThemeEngine.generateFromSeed(normalized);
  if(!palette) return;
  S.seedHex = normalized;
  S.seedPalette = palette;
  var elSub = document.getElementById('cSub'); if(elSub) elSub.value = palette.cSub;
  var elMain = document.getElementById('cMain'); if(elMain) elMain.value = palette.cMain;
  var elDate = document.getElementById('cDate'); if(elDate) elDate.value = palette.cDate;
  var elSeed = document.getElementById('seed-hex-input'); if(elSeed) elSeed.value = normalized;
  var elSwatch = document.getElementById('seed-hex-swatch'); if(elSwatch) elSwatch.style.background = normalized;
  if(typeof drawShadowBigCanvas === 'function') drawShadowBigCanvas(); // 1200畫布背景/舞台也要跟著換色（editor-shadow-canvas.js）
  broadcast();
}

/* ── Upload ── */

function collectState(){
  return {
    version:1,ts:Date.now(),theme:S.theme,
    texts:{brand:v('txt-brand'),guest:v('txt-guest'),main:v('txt-main'),sub:v('txt-sub'),date:v('txt-date'),time:v('txt-time'),flText:v('txt-fl'),flProductSlot:window._flProductSlotValue||''},
    colors:{cSub:v('cSub'),cMain:v('cMain'),cDate:v('cDate')},
    fmt:'jpeg', /* 格式由各版位 spec.fmt 決定 */
    imgs:{ host:S.imgs.host, logo1:S.imgs.logo1, logo2:S.imgs.logo2 },
    logo2Edit:{ raw:S.logo2Raw, scale:S.logo2Scale, offX:S.logo2OffX, offY:S.logo2OffY, shape:S.logo2Shape }
  };
}

function applyState(data){
  if(!data||data.version!==1) return;
  setTheme(data.theme||'A');
  function set(id,val){ var el=document.getElementById(id); if(el&&val!==undefined){el.value=val;} }
  if(data.texts){ set('txt-brand',data.texts.brand);set('txt-guest',data.texts.guest);set('txt-main',data.texts.main);set('txt-sub',data.texts.sub);set('txt-date',data.texts.date);set('txt-time',data.texts.time);set('txt-fl',data.texts.flText);
    var flSlotEl2 = document.getElementById('fl-product-slot');
    if(flSlotEl2) flSlotEl2.value = data.texts.flProductSlot || '';
    window._flProductSlotValue = data.texts.flProductSlot || null;
    if(typeof ccFl === 'function') ccFl();
    if(typeof updateFlCanvasVisibility === 'function') updateFlCanvasVisibility();
  }
  if(data.colors){ set('cSub',data.colors.cSub);set('cMain',data.colors.cMain);set('cDate',data.colors.cDate); }
  if(data.logo2Edit){
    S.logo2Raw=data.logo2Edit.raw; S.logo2Scale=data.logo2Edit.scale;
    S.logo2OffX=data.logo2Edit.offX; S.logo2OffY=data.logo2Edit.offY; S.logo2Shape=data.logo2Edit.shape;
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

/* 組出目前暫存狀態的 JSON blob——「儲存暫存」按鈕、跟整包下載時要一起打包進 zip
   的暫存檔，都共用這支，不要各自組一份，避免兩邊欄位之後改了卻只改到一邊。 */
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
    a.download=ACTIVITY_NAME+'_暫存_'+(v('txt-date')||'draft').replace(/\//g,'-')+'.json';
    a.click(); setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
    pm.done('暫存已下載');
    pm.hide();
  });
});


function clearAllStorage(){
  if(!confirm('確定清除所有暫存？\n（版位清單、主持人圖庫將重設）')) return;
  localStorage.removeItem('bn_admin_pet_frenzy_v1');
  localStorage.removeItem('bn_hosts_pet_frenzy_v1');
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

