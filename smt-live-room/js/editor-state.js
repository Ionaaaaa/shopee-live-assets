'use strict';

var S = {
  seedHex:'#1E6EB4',
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
};
var DEFAULT_BG_COLOR = '#1E6EB4';

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
} // 頁面載入、或分頁沒有記錄背景色時的預設值

/* 依目前的背景顏色（S.seedHex）取得 logo1／CTA 圖檔路徑（相對於 layout iframe，所以要補 '../'）。
   自動配色引擎（color-theme-engine.js）依亮度門檻挑橘色版或白色版，詳見該檔案 THEME_ENGINE_CONFIG。 */
function logoAssetUrl(field, fallback){
  if(S.seedHex && window.ColorThemeEngine){
    var picked = window.ColorThemeEngine.pickLogoAssets(S.seedHex);
    var rel = picked[field];
    if(rel) return '../'+rel;
  }
  return '../'+fallback;
}

/* ── 背景顏色 → 全套配色（唯一入口，頁面初始化／側欄色票／工單指定色號都呼叫這裡，
   確保三個來源套用出來的邏輯永遠一致，不會各寫各的） ── */
/* ── 底色 → 全套配色（唯一入口）──
   forceColors: true  → 強制覆蓋主副標色票（底色確實改變時）
                false → 只更新底色本身，不蓋掉使用者手動調過的主副標顏色
   正常呼叫路徑（側欄色票、工單匯入）都走 forceColors=true；
   切分頁還原時若分頁有存過手動顏色則走 false，這樣切回來不會洗掉之前調好的色。 */
function applySeedHex(hex, forceColors){
  var normalized = window.ColorThemeEngine && window.ColorThemeEngine.normalizeHex(hex);
  if(!normalized){ console.warn('[applySeedHex] 色碼格式錯誤，略過：', hex); return; }

  var bgChanged = (normalized !== S.seedHex);
  S.seedHex = normalized;

  /* 主副標色票：底色有變動，或外部明確要求強制覆蓋，才重算自動配色並寫入 */
  if(bgChanged || forceColors){
    var palette = window.ColorThemeEngine.generateFromSeed(normalized);
    if(palette){
      document.getElementById('cSub').value  = palette.cSub;
      document.getElementById('cMain').value = palette.cMain;
      document.getElementById('cDate').value = palette.cDate;
      var elSep = document.getElementById('cSep'); if(elSep) elSep.value = palette.sepColor;
      S.shadowRgba = palette.shadowRgba;
      /* 底色改變後，把「手動覆蓋」旗標清掉，讓下一次底色變動可以正常重算 */
      S.textColorManual = false;
    }
  } else {
    /* 底色沒變（例如切分頁還原同一個底色），只更新陰影色，不動主副標色票 */
    var palette2 = window.ColorThemeEngine.generateFromSeed(normalized);
    if(palette2) S.shadowRgba = palette2.shadowRgba;
  }

  /* 背景顏色色票／文字輸入框同步（側欄「背景顏色」那組 UI） */
  var swatch = document.getElementById('theme-seed-swatch');
  var hexInput = document.getElementById('theme-seed-hex');
  if(swatch) swatch.value = normalized;
  if(hexInput) hexInput.value = normalized;

  broadcast();
}


/* ── iframe 清單 ── */
/* LAYOUTS 從後台 localStorage 讀取啟用的版位 */
/* 專案各自獨立的 store key，不跟其他姊妹專案（賣家資源／star_studio系）共用，
   避免瀏覽器裡其他專案殘留的 localStorage（含已刪除的版位）被誤讀進來 */
var STORE_KEY = 'bn_admin_smt_live_room_v1';
/* 主持人圖庫 key —— admin.html 是獨立單檔（沒有 <script src>），這裡沒辦法共用
   同一份變數，只能手動保持字串跟 admin.html 的 HOST_LIST_KEY 完全一致 */
var HOST_LIST_KEY = 'bn_hosts_smt_live_room_v1';
var DEFAULT_LAYOUTS = [
  { id:'02_lpbn', name:'直播大廳 LPBN（有/無CTA）2版', file:'02_lpbn.html', w:1125, h:360, enabled:true },
  { id:'03_fl',   name:'FL Icon 336×120',               file:'03_fl.html',   w:336,  h:120, enabled:true },
];
/* v2：新增 03_fl 版位 */
var DEFAULT_LAYOUTS_VERSION = 2;

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
  tab.data.bgColor = S.seedHex;
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
  if(window.ShadowEditor) tab.data.shadowState = window.ShadowEditor.getFullState();
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

function applyTabData(tab, loadHost){
  var d = tab.data || {};
  S.sellerName = d.sellerName || d.logoName || '';
  S.flLogoBgMode = resolveFlLogoBgMode(d);
  S.flLogoSampledColor = d.flLogoSampledColor || '#ffffff';
  S.flLogoExtraScale = d.flLogoExtraScale !== undefined ? d.flLogoExtraScale : 1;
  S.flLogoExtraOffX  = d.flLogoExtraOffX  !== undefined ? d.flLogoExtraOffX  : 0;
  S.flLogoExtraOffY  = d.flLogoExtraOffY  !== undefined ? d.flLogoExtraOffY  : 0;
  applySeedHex(d.bgColor || DEFAULT_BG_COLOR);
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
}
var iframes = {}; // id -> iframe element


/* ── Upload ── */

function collectState(){
  return {
    version:1,ts:Date.now(),bgColor:S.seedHex,
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
  applySeedHex(data.bgColor || DEFAULT_BG_COLOR);
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
    a.download='SMT直播間_暫存_'+(v('txt-date')||'draft').replace(/\//g,'-')+'.json';
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

