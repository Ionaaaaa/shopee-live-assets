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
  checkOverLimit(function(){ _downloadSingle(id); });
}
function _downloadSingle(id){
  var ifr=iframes[id]; if(!ifr||!ifr.contentWindow) return;
  var api=ifr.contentWindow.BNExport;
  if(!api){ toast('畫布尚未就緒','err'); return; }
  var fmt=getFmt(id), ext=fmt==='png'?'png':'jpg';
  var datePrefix = getTabDate();
  var filePrefix = (datePrefix?datePrefix+'_':'')+ACTIVITY_NAME+'_';
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
  var zipName = datePrefix+'_'+ACTIVITY_NAME;
  var layouts = LAYOUTS;
  var total = layouts.length;
  var zip = new JSZip();

  pm.show('整頁下載中');

  function collect(i){
    if(i >= layouts.length){
      pm.update(95, '打包 zip…');
      /* 全部收集完，打包下載 */
      zip.generateAsync({type:'blob'}).then(function(blob){
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = zipName+'.zip';
        a.click();
        setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
        pm.done('已下載：'+zipName+'.zip');
        pm.hide();
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
  var allDates = TABS.map(function(t, i){
    var raw = getTabDateRaw(t.data);
    return raw ? formatDateMMDD(raw) : ('tab'+(i+1));
  });
  var startDate = allDates[0] || '';
  var endDate = allDates[allDates.length-1] || '';
  var zipName = (startDate && endDate && startDate!==endDate ? startDate+'-'+endDate : startDate) + '_' + ACTIVITY_NAME;
  var zip = new JSZip();
  var totalUnits = Math.max(1, TABS.length * LAYOUTS.length);
  var doneUnits = 0;

  pm.show('整包下載中');

  function processTab(ti){
    if(ti >= TABS.length){
      pm.update(95, '打包 zip…');
      zip.generateAsync({type:'blob'}).then(function(blob){
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = zipName+'.zip';
        a.click();
        setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
        applyTabData(TABS[ACTIVE_TAB], true);
        pm.done('已下載：'+zipName+'.zip');
        pm.hide();
      });
      return;
    }
    var tab = TABS[ti];
    var dateFolder = allDates[ti];
    var folder = zip.folder(dateFolder);
    var d = tab.data || {};

    if(d.theme) setTheme(d.theme);
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


