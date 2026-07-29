'use strict';

function getFmt(id){
  /* 優先讀版位自己的 spec.fmt，沒有就預設 jpeg */
  try{
    var ifr = iframes[id];
    if(ifr && ifr.contentWindow && ifr.contentWindow.BNExport && ifr.contentWindow.BNExport.spec.fmt){
      return ifr.contentWindow.BNExport.spec.fmt;
    }
  }catch(e){}
  return 'jpeg';
}

/* ── 整包/整頁下載時，FL ICON的LOGO原圖是不是真的載入完成了 ──
   03_fl.html／04_fl_a1.html 收到 logo2Raw 之後要非同步 loadImg + 算有色範圍
   才能畫出正確位置，畫完之前用固定delay硬猜「應該夠了吧」──圖片小的時候
   夠，圖片大（或分頁一多、瀏覽器忙）的時候賭輸了，畫面截到的其實是還沒套用
   新位置的舊資料，看起來就是「LOGO跑掉」。
   改成兩個iframe（03_fl／04_fl_a1）收到並真正畫出這張logo2Raw之後，各自
   回報一個 BN_LOGO2_READY 訊息（見兩支layout檔案），這裡等到收到才截圖；
   訊息萬一遺失（理論上不該發生，但保險起見)，用 maxWaitMs 當上限，不會整個
   卡住不截圖。沒有logo2Raw的分頁（B級純文案／A級沒放logo）完全不會進到這裡，
   不會被多等一毫秒。 */
function waitForLogo2Ready(layoutId, expectedSrc, maxWaitMs, cb){
  if(!expectedSrc){ cb(); return; }
  var done = false;
  function finish(){
    if(done) return;
    done = true;
    clearTimeout(timer);
    window.removeEventListener('message', onMsg);
    cb();
  }
  var timer = setTimeout(finish, maxWaitMs);
  function onMsg(e){
    var msg = e.data;
    if(!msg || msg.type !== 'BN_LOGO2_READY') return;
    if(msg.layoutId !== layoutId || msg.src !== expectedSrc) return;
    finish();
  }
  window.addEventListener('message', onMsg);
}

/* ── 取得當前分頁日期（用於檔名，補0成4碼 MMDD）── */
function getTabDate(){
  var tab = TABS[ACTIVE_TAB];
  if(!tab) return '';
  return formatDateMMDD(getTabDateRaw(tab.data));
}

/* ── 單張下載：日期前綴_製作物名稱 ── */
function downloadSingle(id){
  checkOverLimit(function(){
    /* getTabDate() 是讀 TABS[ACTIVE_TAB].data，不是讀畫面上的即時欄位值，
       沒先存一次的話，剛手動改的日期/時間不會反映在檔名上 */
    saveCurrentTabState(function(){ _downloadSingle(id); });
  });
}
function _downloadSingle(id){
  /* 正常情況下這個按鈕所在的canvas-block本身就被隱藏了（見 updateFlCanvasVisibility），
     點不到；這裡多一層防呆，避免萬一被觸發時還是匯出一張「不需要製作」的FL圖 */
  if(id === '03_fl' && window._flProductSlotValue === 'skip'){
    toast('這個分頁的FL ICON選擇「不製作」，不需要下載', 'err');
    return;
  }
  if(id === '04_fl_a1' && S.flAVariant === 'skip'){
    toast('這個分頁的FL ICON選擇「不製作」，不需要下載', 'err');
    return;
  }
  var ifr=iframes[id]; if(!ifr||!ifr.contentWindow) return;
  var api=ifr.contentWindow.BNExport;
  if(!api){ toast('畫布尚未就緒','err'); return; }
  var fmt=getFmt(id), ext=fmt==='png'?'png':'jpg';
  var datePrefix = getTabDate();
  var filePrefix = getExportNamePrefix(datePrefix) + '_';
  var spec = api.spec || {};
  var name = spec.name || id;

  pm.show('下載中');
  pm.update(20, name);

  if(api.getBothBlobs && spec.hasCTAVariant){
    api.getBothBlobs(fmt, fmt==='png'?1:0.95, function(blobWith, blobWithout){
      pm.update(55, '壓縮中…');
      compressToLimit(blobWith, id, fmt, function(bWith2){
        compressToLimit(blobWithout, id, fmt, function(bWithout2){
          function dl(blob, suffix){
            var a=document.createElement('a');
            a.href=URL.createObjectURL(blob);
            a.download=filePrefix+name+'_'+suffix+'.'+ext;
            a.click(); setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
          }
          dl(bWith2, 'with-cta');
          setTimeout(function(){ dl(bWithout2, 'without-cta'); }, 300);
          pm.done('已下載兩張（有CTA + 無CTA）');
          pm.hide();
        });
      });
    });
  } else {
    api.getBlob(fmt, fmt==='png'?1:0.95, function(blob){
      pm.update(60, '壓縮中…');
      compressToLimit(blob, id, fmt, function(blob2){
        var a=document.createElement('a');
        a.href=URL.createObjectURL(blob2);
        a.download=filePrefix+name+'.'+ext;
        a.click(); setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
        pm.done('已下載：'+name);
        pm.hide();
      });
    });
  }
}

/* ── 整頁下載：當前分頁所有製作物打包 ZIP ── */
function downloadPage(){
  checkOverLimit(_downloadPage);
}
function _downloadPage(){
  var datePrefix = getTabDate() || '分頁'+(ACTIVE_TAB+1);
  var zipName = getExportNamePrefix(datePrefix);
  var layouts = LAYOUTS;
  var total = layouts.length;
  var zip = new JSZip();

  pm.show('整頁下載中');

  function collect(i){
    if(i >= layouts.length){
      /* 全部截圖都已收集完成、不會再有任何畫面擷取動作了，這時候才把暫存檔
         一起放進同一個 zip──跟截圖流程的時間軸完全分開，不會互相干擾
         （早期把暫存檔跟截圖包在同一個zip時出過畫面異常，原因是那時候是在
         截圖流程「之前」就做暫存動作；只要維持「先截完圖，暫存檔才進場」
         這個順序，兩者在同一個zip裡就不會互相影響）。 */
      pm.update(92, '整理暫存檔…');
      saveCurrentTabState(function(){
        var stateBlob = buildStateBlob();
        zip.file(zipName+'_autosave.json', stateBlob);

        pm.update(95, '打包 zip…');
        zip.generateAsync({type:'blob'}).then(function(blob){
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = zipName+'.zip';
          a.click();
          setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
          pm.done('已下載：'+zipName+'.zip（含暫存檔）');
          pm.hide();
        });
      });
      return;
    }
    var layout = layouts[i];
    pm.update(Math.round(i/total*90), layout.name || layout.id);
    var ifr = iframes[layout.id];
    if(!ifr||!ifr.contentWindow){ collect(i+1); return; }
    var api = ifr.contentWindow.BNExport;
    if(!api){ collect(i+1); return; }
    var fmt = getFmt(layout.id), ext = fmt==='png'?'png':'jpg';
    var name = (api.spec && api.spec.name) || layout.id;

    function addAndNext(blob, suffix){
      zip.file(name+(suffix?'_'+suffix:'')+'.'+ext, blob);
      collect(i+1);
    }

    if(api.getBothBlobs && api.spec && api.spec.hasCTAVariant){
      api.getBothBlobs(fmt, fmt==='png'?1:0.95, function(bWith, bWithout){
        compressToLimit(bWith, layout.id, fmt, function(bWith2){
          compressToLimit(bWithout, layout.id, fmt, function(bWithout2){
            zip.file(name+'_with-cta.'+ext, bWith2);
            zip.file(name+'_without-cta.'+ext, bWithout2);
            collect(i+1);
          });
        });
      });
    } else {
      api.getBlob(fmt, fmt==='png'?1:0.95, function(blob){
        compressToLimit(blob, layout.id, fmt, function(blob2){
          addAndNext(blob2, '');
        });
      });
    }
  }
  collect(0);
}

/* ── 各版位 KB 上限（未列出的不限制）── */
var SIZE_LIMIT_KB = {
  '02_lpbn':    200,
  '04_ig':      450,
  '05_fb_post': 450,
  '06_opening': 450,
  '07_msbn':    145,
  '08_sbn':     300
  /* 09_fl 工單標示無KB上限（"-"），且輸出格式是png，compressToLimit本來就會跳過png，不需要設限制 */
};

/* 壓縮 blob 到指定 KB 以下（僅 jpeg；png 直接回傳）*/
function compressToLimit(blob, layoutId, fmt, cb){
  var limitKB = SIZE_LIMIT_KB[layoutId];
  if(!limitKB || fmt === 'png' || blob.size <= limitKB * 1024){
    cb(blob); return;
  }
  var url = URL.createObjectURL(blob);
  var img = new Image();
  img.onload = function(){
    URL.revokeObjectURL(url);
    var cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    var ctx = cv.getContext('2d');
    var q = 0.90;
    function tryNext(){
      ctx.clearRect(0,0,cv.width,cv.height);
      ctx.drawImage(img,0,0);
      cv.toBlob(function(b){
        if(!b){ cb(blob); return; }
        if(b.size <= limitKB * 1024 || q <= 0.1){ cb(b); return; }
        q = Math.max(0.1, Math.round((q - 0.05)*100)/100);
        tryNext();
      }, 'image/jpeg', q);
    }
    tryNext();
  };
  img.onerror = function(){ cb(blob); };
  img.src = url;
}

/* ── 依分頁等級決定要輸出哪些版位 ──
   個人專場公版格式：A級輸出 LPBN ＋ 新的方形FL ICON（04_fl_a1，360×360）；
   B級只有橫式 FL Icon（03_fl，336×120，維持原樣）。沒有level標記的舊格式
   分頁維持原本行為，所有後台啟用的版位都輸出，但04_fl_a1只服務個人專場
   A級專場、其他情境不會有對應資料，這裡一併排除，避免多輸出一張空白圖。 */
function layoutsForTab(tab){
  var level = tab && tab.data && tab.data.level;
  if(level === 'A') return LAYOUTS.filter(function(l){ return l.id === '02_lpbn' || l.id === '04_fl_a1'; });
  if(level === 'B') return LAYOUTS.filter(function(l){ return l.id === '03_fl'; });
  return LAYOUTS.filter(function(l){ return l.id !== '04_fl_a1'; });
}
function padNum2(n){ n = String(n); return n.length < 2 ? '0'+n : n; }

/* ── 整包下載：所有分頁所有製作物 ── */
function downloadAll(){
  checkOverLimit(_downloadAll);
}
function _downloadAll(){
  /* 輕量快照目前畫面（純讀DOM/S欄位值＋ShadowEditor.getFullState()，
     這支只是回傳資料的物件，沒有任何畫面/渲染副作用），只用來在下載跑完後
     把畫面正確復原——不產生任何檔案、不寫入TABS，執行是同步、瞬間完成的，
     跟後面截圖/打包zip的流程完全沒有時間關係。
     這樣一來，最後的「復原」就不再依賴 TABS[ACTIVE_TAB].data 這份可能沒有
     即時同步的舊資料，才不會發生「手動調的顏色被蓋回舊配色」的問題。 */
  var liveSnapshot = {
    theme: S.theme,
    textColorManual: S.textColorManual,
    cSub: v('cSub'), cMain: v('cMain'), cDate: v('cDate'), cSep: v('cSep'),
    main: v('txt-main'), sub: v('txt-sub'), date: v('txt-date'), time: v('txt-time'),
    brand: v('txt-brand'), flText: v('txt-fl'),
    shadowState: window.ShadowEditor ? window.ShadowEditor.getFullState() : null,
    /* 下面這些欄位，批次下載的 processTab() 每輪都會依「當時正在擷圖的那個
       分頁」直接覆蓋（見上面 flProductSlot／flAVariant／flLogoExtra／logo2Edit
       等處的同步邏輯），原本這裡完全沒存、也就完全沒復原——下載跑完後畫面
       停在「最後一個分頁」的殘留狀態，不是使用者按下「整包下載」之前這一頁
       原本的樣子。緊接著的「存暫存檔」又是直接讀這些殘留狀態存回
       TABS[ACTIVE_TAB].data，所以錯的不只是畫面，連暫存檔也一併存成錯的——
       這就是「下載後編輯器內容跑掉、載入暫存檔也不對，而且剛好只有當時作用中
       那一頁（通常是第一頁）錯」的根因。 */
    flProductSlot: window._flProductSlotValue || '',
    sellerName: S.sellerName,
    flLogoBgMode: S.flLogoBgMode,
    flLogoSampledColor: S.flLogoSampledColor,
    flLogoExtraScale: S.flLogoExtraScale,
    flLogoExtraOffX: S.flLogoExtraOffX,
    flLogoExtraOffY: S.flLogoExtraOffY,
    flAVariant: S.flAVariant,
    flAText: S.flAText,
    hostImg: S.imgs.host,
    logo2Raw: S.logo2Raw,
    logo2Scale: S.logo2Scale,
    logo2OffX: S.logo2OffX,
    logo2OffY: S.logo2OffY,
    logo2Shape: S.logo2Shape,
    logo2Img: S.imgs.logo2,
    /* 各版位（目前只有02_lpbn會用到）畫面上商品圖被拖曳調整過的位置/縮放：
       先給空物件，下面立刻用 getAllCanvasStates() 非同步問真正的值再補上去
       （不能直接同步戳 iframe.contentWindow.D，理由跟 saveCurrentTabState()
       一樣——可能剛好卡在一次 broadcastFull() 還沒被 iframe 處理完的當下，
       同步讀到的會是舊值）。這裡不用等這個問答結果才能繼續往下跑：
       canvasState 要等到整包下載跑完、最後 restoreLiveSnapshot() 才會被讀取，
       那是好幾秒之後的事，getAllCanvasStates() 的 500ms 逾時早就結束了。 */
    canvasState: {}
  };
  getAllCanvasStates(function(states){ liveSnapshot.canvasState = states; });

  /* B級專場的分頁本來就沒有解析日期/時間欄位（parsePersonalEventBLevel沒有
     這個欄位），getTabDateRaw對這些分頁一定拿到空值。之前這裡沒有日期就塞入
     'tabN'這種佔位字串，如果剛好最後一個分頁是B級（通常是，B級排在A級後面），
     檔名就會變成「0613-tab6」這種頭尾對不上、看起來像亂碼的日期範圍。
     改成直接濾掉沒有日期的分頁，日期範圍只用「真的有日期」的分頁去算頭尾，
     這樣算出來的就會是A級三包實際日期的頭尾（例如「0613-0620」）。 */
  var allDates = TABS.map(function(t){
    var raw = getTabDateRaw(t.data);
    return raw ? formatDateMMDD(raw) : '';
  }).filter(function(d){ return !!d; });
  var startDate = allDates[0] || '';
  var endDate = allDates[allDates.length-1] || '';
  var datePart = (startDate && endDate && startDate!==endDate ? startDate+'-'+endDate : startDate);
  var zipName = getExportAllNamePrefix(datePart);
  var zip = new JSZip();
  var totalUnits = TABS.reduce(function(sum, t){ return sum + Math.max(1, layoutsForTab(t).length); }, 0);
  var doneUnits = 0;
  var _aFolderCount = 0, _bFileCount = 0; // 個人專場A級資料夾／B級檔名流水號，跨分頁累加

  pm.show('整包下載中');

  function restoreLiveSnapshot(){
    setTheme(liveSnapshot.theme);
    if(liveSnapshot.textColorManual){
      S.textColorManual = true;
      var elSub=document.getElementById('cSub'); if(elSub) elSub.value=liveSnapshot.cSub;
      var elMain=document.getElementById('cMain'); if(elMain) elMain.value=liveSnapshot.cMain;
      var elDateC=document.getElementById('cDate'); if(elDateC) elDateC.value=liveSnapshot.cDate;
      var elSep=document.getElementById('cSep'); if(elSep) elSep.value=liveSnapshot.cSep;
    } else {
      S.textColorManual = false;
    }
    var setV = function(id,val){ var el=document.getElementById(id); if(el&&val!==undefined) el.value=val; };
    setV('txt-main', liveSnapshot.main); setV('txt-sub', liveSnapshot.sub);
    setV('txt-date', liveSnapshot.date); setV('txt-time', liveSnapshot.time);
    setV('txt-brand', liveSnapshot.brand); setV('txt-fl', liveSnapshot.flText);
    if(window.ShadowEditor && liveSnapshot.shadowState) window.ShadowEditor.restoreState(liveSnapshot.shadowState);

    /* 把上面新存的欄位一一復原回S／對應的下拉選單、輸入框，跟 applyTabData()／
       processTab() 套用tab.data時的欄位對應完全一致，才不會漏掉任何一個
       批次下載過程中曾經被覆蓋掉的欄位 */
    window._flProductSlotValue = liveSnapshot.flProductSlot || null;
    var flSlotEl = document.getElementById('fl-product-slot');
    if(flSlotEl) flSlotEl.value = liveSnapshot.flProductSlot || '';

    S.sellerName = liveSnapshot.sellerName;
    S.flLogoBgMode = liveSnapshot.flLogoBgMode;
    S.flLogoSampledColor = liveSnapshot.flLogoSampledColor;
    S.flLogoExtraScale = liveSnapshot.flLogoExtraScale;
    S.flLogoExtraOffX  = liveSnapshot.flLogoExtraOffX;
    S.flLogoExtraOffY  = liveSnapshot.flLogoExtraOffY;

    S.flAVariant = liveSnapshot.flAVariant;
    S.flAText    = liveSnapshot.flAText;
    var flAVariantEl = document.getElementById('fl-a1-variant');
    if(flAVariantEl) flAVariantEl.value = liveSnapshot.flAVariant || 'skip';
    var elFlA1 = document.getElementById('txt-fl-a1');
    if(elFlA1) elFlA1.value = liveSnapshot.flAText || '';

    S.imgs.host  = liveSnapshot.hostImg || null;
    S.logo2Raw   = liveSnapshot.logo2Raw;
    S.logo2Scale = liveSnapshot.logo2Scale;
    S.logo2OffX  = liveSnapshot.logo2OffX;
    S.logo2OffY  = liveSnapshot.logo2OffY;
    S.logo2Shape = liveSnapshot.logo2Shape;
    S.imgs.logo2 = liveSnapshot.logo2Img || null;

    broadcastFull();

    /* 各版位商品圖拖曳位置要等broadcastFull()把圖片重新載入完再送，不然可能
       被非同步載入圖片的流程蓋回預設位置——跟 processTab() 裡 d.hostImg 分支
       用的restoreDelay是同一個道理 */
    var csKeys = Object.keys(liveSnapshot.canvasState || {});
    if(csKeys.length){
      setTimeout(function(){
        csKeys.forEach(function(id){
          var ifr = iframes[id];
          if(ifr && ifr.contentWindow){
            ifr.contentWindow.postMessage({type:'BN_RESTORE_STATE', state:liveSnapshot.canvasState[id]}, '*');
          }
        });
      }, 400);
    }
  }

  function processTab(ti){
    if(ti >= TABS.length){
      /* 全部分頁的截圖都已收集完成、不會再有任何畫面擷取動作了，這時候才
         開始「復原畫面 → 存暫存檔 → 打包zip」，確保跟截圖流程的時間軸
         完全分開（早期把暫存檔跟截圖包在同一個zip時出過畫面異常，原因是
         那時候是在截圖流程「之前」就做暫存動作；只要維持「先截完圖，
         復原畫面、暫存檔才進場」這個順序，兩者在同一個zip裡就不會互相
         影響）。單一分頁時 processTab() 完全沒動過畫面/ShadowEditor狀態，
         這裡的復原就跳過，連這個「本來應該是no-op」的動作都不要做，
         降到最低風險。 */
      if(TABS.length !== 1) restoreLiveSnapshot();
      setTimeout(function(){
        pm.update(92, '整理暫存檔…');
        saveCurrentTabState(function(){
          var stateBlob = buildStateBlob();
          zip.file(zipName+'_autosave.json', stateBlob);

          pm.update(95, '打包 zip…');
          zip.generateAsync({type:'blob'}).then(function(blob){
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = zipName+'.zip';
            a.click();
            setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
            pm.done('已下載：'+zipName+'.zip（含暫存檔）');
            pm.hide();
          });
        });
      }, TABS.length !== 1 ? 500 : 0);
      return;
    }
    var tab = TABS[ti];
    var level = tab.data && tab.data.level;
    var dateFolder = allDates[ti];
    var d = tab.data || {};
    var bFilePrefix = '';
    var folder;
    if(level === 'A'){
      /* A級專場：全部包在zip裡的「A級專場」資料夾下，裡面再依每一包各自分
         資料夾。資料夾名稱從原本的純數字編號（A01、A02...）改成「日期(補0)_
         廠商名稱」方便對照——廠商名稱直接讀這個分頁自己的 tab.data（見
         getTabStoreName 說明），不是即時的 S.sellerName，避免批次跑到這裡時
         還沒同步成這個分頁的資料。
         注意：廠商名稱常常是中文，這裡刻意跟專案「檔名/資料夾一律ASCII」
         的原則不同——是這次改版明確要的效果，如果之後遇到下游工具讀中文
         zip路徑出問題，這裡是要回頭調整的地方。 */
      _aFolderCount++;
      var aVendor = getTabStoreName(d);
      var aLabel = (dateFolder || padNum2(_aFolderCount)) + '_' + aVendor;
      folder = zip.folder('A級專場').folder(sanitizeZipName(aLabel));
    } else if(level === 'B'){
      /* B級專場：全部包在zip裡的「B級專場」資料夾下，裡面不再分包資料夾，
         直接攤平放檔案，檔名前面加流水號（01_、02_...）。 */
      _bFileCount++;
      bFilePrefix = padNum2(_bFileCount) + '_';
      folder = zip.folder('B級專場');
    } else {
      /* 舊格式（沒有level標記）：維持原本「多分頁用日期分資料夾」的行為 */
      folder = (TABS.length === 1) ? zip : zip.folder(dateFolder);
    }

    function captureLayouts(){
      var layouts = layoutsForTab(tab);
      function collectLayout(i){
        if(i >= layouts.length){ processTab(ti+1); return; }
        var layout = layouts[i];
        /* 這個分頁的FL ICON選「不製作」時，03_fl版位整個跳過，不產生任何檔案。
           這裡故意讀「即時狀態」（window._flProductSlotValue）而不是 d.flProductSlot——
           單一分頁匯出時（下面 TABS.length===1 那個分支）完全不會重新套用
           tab.data，直接讀畫面當下的狀態去截圖（避免拿可能沒同步的舊資料蓋掉
           使用者正在編輯的畫面），所以這裡也要跟著讀即時狀態才會一致；
           多分頁批次匯出時，上面重新套用tab.data那段已經把即時狀態同步成
           這個分頁的 d.flProductSlot 了，兩種情況讀即時狀態結果都是對的。 */
        if(layout.id === '03_fl' && window._flProductSlotValue === 'skip'){
          doneUnits++; collectLayout(i+1); return;
        }
        if(layout.id === '04_fl_a1' && S.flAVariant === 'skip'){
          doneUnits++; collectLayout(i+1); return;
        }
        pm.update(Math.round(doneUnits/totalUnits*90), (dateFolder?dateFolder+' · ':'')+(layout.name||layout.id));
        var ifr = iframes[layout.id];
        if(!ifr||!ifr.contentWindow){ doneUnits++; collectLayout(i+1); return; }
        var api = ifr.contentWindow.BNExport;
        if(!api){ doneUnits++; collectLayout(i+1); return; }
        var fmt = getFmt(layout.id), ext = fmt==='png'?'png':'jpg';
        var name = (api.spec && api.spec.name) || layout.id;
        if(api.getBothBlobs && api.spec && api.spec.hasCTAVariant){
          api.getBothBlobs(fmt, fmt==='png'?1:0.95, function(bWith, bWithout){
            compressToLimit(bWith, layout.id, fmt, function(bWith2){
              compressToLimit(bWithout, layout.id, fmt, function(bWithout2){
                folder.file(bFilePrefix+name+'_with-cta.'+ext, bWith2);
                folder.file(bFilePrefix+name+'_without-cta.'+ext, bWithout2);
                doneUnits++; collectLayout(i+1);
              });
            });
          });
        } else {
          api.getBlob(fmt, fmt==='png'?1:0.95, function(blob){
            compressToLimit(blob, layout.id, fmt, function(blob2){
              folder.file(bFilePrefix+name+'.'+ext, blob2);
              doneUnits++; collectLayout(i+1);
            });
          });
        }
      }
      collectLayout(0);
    }

    /* 只有一個分頁時，畫面本來就已經是這個分頁的即時狀態（使用者正在編輯的
       畫面），完全不需要「套用tab.data → 等broadcast → 截圖」這一套流程——
       這套流程是設計給「真的有多個分頁要輪流套用」的情境用的。單一分頁還是
       硬套用一次，反而會：①用可能沒同步的舊 tab.data.bgColor 蓋掉手動調的
       顏色、②重新呼叫 ShadowEditor.restoreState() 讓商品插槽重新套用一次、
       殘留舊的位置資訊，兩個問題疊加就是使用者回報的「顏色跳回＋LPBN多一套
       商品」。單一分頁直接跳過套用，畫面維持原樣直接截圖，兩個問題都不會發生。 */
    if(TABS.length === 1){
      captureLayouts();
      return;
    }

    if(d.theme) setTheme(d.theme);
    if(window.ShadowEditor){
      if(d.shadowState) window.ShadowEditor.restoreState(d.shadowState);
      else if(d.combo) window.ShadowEditor.setCombo(d.combo);
    }
    ['txt-main','txt-sub','txt-time','txt-brand'].forEach(function(fid){
      var key = fid.replace('txt-','');
      var el = document.getElementById(fid);
      if(el && d[key]) el.value = d[key];
    });
    /* txt-date／txt-fl 跟 applyTabData 同樣道理：日期已經併入時間欄位，
       不能用「有值才覆蓋」，不然批次匯出下一個分頁時，會沿用上一個分頁殘留的日期字串 */
    var elDate = document.getElementById('txt-date');
    if(elDate) elDate.value = d.date || '';
    var elFl = document.getElementById('txt-fl');
    if(elFl) elFl.value = d.flText || '';
    /* FL ICON 下拉選單的值（window._flProductSlotValue）之前這裡完全沒同步——
       批次匯出多分頁時，_flProductSlot()（editor-state.js）判斷要不要放商品圖／
       要不要當LOGO／要不要跳過FL，靠的就是這個全域變數，沒在這裡跟著切分頁
       更新的話，後面每個分頁截圖時，FL版位會一直沿用「進入批次匯出之前」
       殘留的那個值，不會照各分頁自己的設定跑。 */
    window._flProductSlotValue = d.flProductSlot || null;
    var flSlotEl = document.getElementById('fl-product-slot');
    if(flSlotEl) flSlotEl.value = d.flProductSlot || '';
    /* A級專場方形FL ICON（04_fl_a1）：同樣道理，每次都直接同步（含清空），
       不能只在有值時才覆蓋，不然批次匯出下一個分頁時會沿用上一包殘留的文案 */
    S.flAVariant = d.flAVariant || 'skip';
    S.flAText    = d.flAText    || '';

    /* LOGO2／FL ICON底色：跟 applyTabData() 同一組欄位、同樣要「每次都直接同步
       （含清空）」——這裡原本完全沒有同步到這幾個欄位，批次匯出多分頁時，
       每一頁擷圖前實際用的其實是「進入批次匯出之前」畫面殘留的舊值，不是這個
       分頁自己該有的LOGO／底色，跟上面 flProductSlotValue／flAVariant 那兩處
       註解提到的「沿用上一個分頁殘留值」是同一種問題，這裡是漏掉沒補的部分。 */
    S.flLogoBgMode = resolveFlLogoBgMode(d);
    S.flLogoSampledColor = d.flLogoSampledColor || '#ffffff';
    /* FL示意圖的額外縮放/位移（逐包確認彈窗裡使用者手動拖曳調整的量）：同樣是
       「每次都要依這個分頁的值直接同步，不能只在有值時才覆蓋」的欄位，之前這裡
       完全沒同步，批次匯出多分頁時，擷圖用的其實是「上一個處理到的分頁」殘留的
       位移值，不是這個分頁自己存的值——B級專場FL icon常見的「畫面正常、下載出來
       LOGO往下掉」就是這裡漏同步造成的（A級專場多半沒手動調過這組位移，才沒感覺
       到同一顆bug）。 */
    S.flLogoExtraScale = d.flLogoExtraScale !== undefined ? d.flLogoExtraScale : 1;
    S.flLogoExtraOffX  = d.flLogoExtraOffX  !== undefined ? d.flLogoExtraOffX  : 0;
    S.flLogoExtraOffY  = d.flLogoExtraOffY  !== undefined ? d.flLogoExtraOffY  : 0;
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

    if(d.hostImg){
      S.imgs.host = d.hostImg;
      broadcastFull();
      var restoreDelay = d.canvasState ? 400 : 0;
      setTimeout(function(){
        if(d.canvasState){
          Object.keys(d.canvasState).forEach(function(id){
            var ifr = iframes[id];
            if(ifr && ifr.contentWindow)
              ifr.contentWindow.postMessage({type:'BN_RESTORE_STATE', state:d.canvasState[id]}, '*');
          });
        }
        setTimeout(captureLayouts, 300);
      }, restoreDelay);
    } else {
      broadcastFull();
      /* 500ms給主題／背景圖／文字這些「本來就快」的東西一個基本緩衝；
         真正可能拖很久的LOGO原圖，交給上面 waitForLogo2Ready 實際等它畫完，
         不是兩者都硬湊同一個猜出來的數字。 */
      setTimeout(function(){
        var logoLayoutId = (level === 'A') ? '04_fl_a1' : (level === 'B') ? '03_fl' : null;
        var expectedSrc = (d.logo2Edit && d.logo2Edit.raw) || null;
        if(logoLayoutId && expectedSrc){
          waitForLogo2Ready(logoLayoutId, expectedSrc, 2500, captureLayouts);
        } else {
          captureLayouts();
        }
      }, 500);
    }
  }
  processTab(0);
}


