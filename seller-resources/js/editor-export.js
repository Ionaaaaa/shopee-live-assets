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
          dl(bWith2, '有CTA');
          setTimeout(function(){ dl(bWithout2, '無CTA'); }, 300);
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
        zip.file(zipName+'_暫存.json', stateBlob);

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
            zip.file(name+'_有CTA.'+ext, bWith2);
            zip.file(name+'_無CTA.'+ext, bWithout2);
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
    bgColor: S.seedHex,
    textColorManual: S.textColorManual,
    cSub: v('cSub'), cMain: v('cMain'), cDate: v('cDate'), cSep: v('cSep'),
    main: v('txt-main'), sub: v('txt-sub'), date: v('txt-date'), time: v('txt-time'),
    brand: v('txt-brand'), flText: v('txt-fl'),
    shadowState: window.ShadowEditor ? window.ShadowEditor.getFullState() : null
  };

  var allDates = TABS.map(function(t, i){
    var raw = getTabDateRaw(t.data);
    return raw ? formatDateMMDD(raw) : ('tab'+(i+1));
  });
  var startDate = allDates[0] || '';
  var endDate = allDates[allDates.length-1] || '';
  var datePart = (startDate && endDate && startDate!==endDate ? startDate+'-'+endDate : startDate);
  var zipName = getExportNamePrefix(datePart);
  var zip = new JSZip();
  var totalUnits = Math.max(1, TABS.length * LAYOUTS.length);
  var doneUnits = 0;

  pm.show('整包下載中');

  function restoreLiveSnapshot(){
    applySeedHex(liveSnapshot.bgColor);
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
    broadcastFull();
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
          zip.file(zipName+'_暫存.json', stateBlob);

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
    var dateFolder = allDates[ti];
    /* 只有一個分頁時不用再包一層日期資料夾，檔案直接放 zip 根目錄；
       多分頁（跨天）才需要用資料夾把各天分開，避免檔名衝突、方便找檔案。 */
    var folder = (TABS.length === 1) ? zip : zip.folder(dateFolder);
    var d = tab.data || {};

    function captureLayouts(){
      var layouts = LAYOUTS;
      function collectLayout(i){
        if(i >= layouts.length){ processTab(ti+1); return; }
        var layout = layouts[i];
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
                folder.file(name+'_有CTA.'+ext, bWith2);
                folder.file(name+'_無CTA.'+ext, bWithout2);
                doneUnits++; collectLayout(i+1);
              });
            });
          });
        } else {
          api.getBlob(fmt, fmt==='png'?1:0.95, function(blob){
            compressToLimit(blob, layout.id, fmt, function(blob2){
              folder.file(name+'.'+ext, blob2);
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

    if(d.bgColor) applySeedHex(d.bgColor);
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
      setTimeout(captureLayouts, 800);
    }
  }
  processTab(0);
}


