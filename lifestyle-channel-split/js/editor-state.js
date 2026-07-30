'use strict';

var S = {
  theme:'A',
  bgUrls:{ A:'../backgrounds/', B:'../backgrounds/', C:'../backgrounds/' }, // backgrounds/ 底下沒有 A/B/C 子資料夾，全部檔案都在同一層
  imgs:{ host:null, logo1:null, logo2:null },
  // logo2 編輯面板用：原圖（未合成）＋當時的縮放位移/形狀，供「編輯 Logo2」重新叫出面板還原
  logo2Raw:null, logo2Scale:undefined, logo2OffX:undefined, logo2OffY:undefined, logo2Shape:undefined,
  maskOn:false, // 底部遮罩（補主持人身體過短）：一鍵開關套用到所有版位，預設關閉
};
var BG_TEXT_DEF={ // 主標/日期/副標顏色已固定，三個款式都用同一組，避免 setTheme 被觸發時覆蓋掉
  A:{s:'#A8D9FB',m:'#FFE88B'},
  B:{s:'#A8D9FB',m:'#FFE88B'},
  C:{s:'#A8D9FB',m:'#FFE88B'},
};

/* ── iframe 清單 ── */
/* LAYOUTS 從後台 localStorage 讀取啟用的版位 */
var STORE_KEY = 'bn_admin_star_studio_v1';
var DEFAULT_LAYOUTS = [
  { id:'01_thumbnail', name:'直播時縮圖',                  file:'01_thumbnail.html', w:720,  h:720,  enabled:true },
  { id:'02_lpbn',      name:'直播大廳 LPBN（有/無CTA）2版', file:'02_lpbn.html',      w:1125, h:360,  enabled:true },
  { id:'04_ig',        name:'IG',                          file:'04_ig.html',        w:900,  h:1600, enabled:true },
  { id:'05_fb_post',   name:'FB Post',                     file:'05_fb_post.html',   w:1200, h:630,  enabled:true },
  { id:'06_opening',   name:'開播字卡',                    file:'06_opening.html',   w:1080, h:1920, enabled:true },
  { id:'07_msbn',      name:'MSBN',                        file:'07_msbn.html',      w:1200, h:360,  enabled:true },
  { id:'08_sbn',       name:'Seller BN',                   file:'08_sbn.html',       w:1024, h:512,  enabled:true },
  { id:'09_fl',        name:'直播間FL',                    file:'09_fl.html',        w:336,  h:120,  enabled:true },
];
/* 版本號：每次更新 DEFAULT_LAYOUTS 時遞增，強制後台讀新清單 */
/* v8：這個活動不需要「直播大廳 Popup」版位，08_popup.html 已不存在，改為正確的 Seller BN(08_sbn) + 直播間FL(09_fl) */
var DEFAULT_LAYOUTS_VERSION = 8;

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
  tab.data.theme = S.theme;
  tab.data.main  = v('txt-main')  || tab.data.main;
  tab.data.sub   = v('txt-sub')   || tab.data.sub;
  tab.data.date  = v('txt-date')  || tab.data.date;
  tab.data.time  = v('txt-time')  || tab.data.time;
  tab.data.brand = v('txt-brand') || tab.data.brand;
  tab.data.guest = v('txt-guest') || tab.data.guest;
  tab.data.flText = v('txt-fl') || tab.data.flText;
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

  /* 陰影套件：套用工單指定的版型組合（A/B/C/D） */
  if(d.combo && window.ShadowEditor){
    window.ShadowEditor.setCombo(d.combo);
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

/* ── Upload ── */

function collectState(){
  return {
    version:1,ts:Date.now(),theme:S.theme,
    texts:{brand:v('txt-brand'),guest:v('txt-guest'),main:v('txt-main'),sub:v('txt-sub'),date:v('txt-date'),time:v('txt-time'),flText:v('txt-fl')},
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
  if(data.texts){ set('txt-brand',data.texts.brand);set('txt-guest',data.texts.guest);set('txt-main',data.texts.main);set('txt-sub',data.texts.sub);set('txt-date',data.texts.date);set('txt-time',data.texts.time);set('txt-fl',data.texts.flText); }
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

function buildFullSnapshot(cb){
  saveCurrentTabState(function(){
    var state = collectState();
    state.tabs = TABS;
    state.activeTab = ACTIVE_TAB;
    cb(state);
  });
}

document.getElementById('btn-save').addEventListener('click',function(){
  pm.show('儲存暫存');
  pm.update(10, '收集狀態…');
  buildFullSnapshot(function(state){
    pm.update(50, '產生檔案…');
    var blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='明星直播間_暫存_'+(v('txt-date')||'draft').replace(/\//g,'-')+'.json';
    a.click(); setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
    pm.done('暫存已下載');
    pm.hide();
  });
});


function clearAllStorage(){
  if(!confirm('確定清除所有暫存？\n（版位清單、主持人圖庫將重設）')) return;
  localStorage.removeItem('bn_admin_star_studio_v1');
  localStorage.removeItem('bn_hosts_star_studio_v1');
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

