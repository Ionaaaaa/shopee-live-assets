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

  function finishZip(){
    /* 全部截圖都收集完成、不會再有任何畫面擷取動作了，這時候才把暫存檔一起
       放進同一個zip——時間點特意放在截圖流程「之後」，避免存檔動作跟截圖
       流程互相干擾（見 saveCurrentTabState 的非同步問答，中途觸發可能讓
       畫面短暫閃一下）。 */
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
  }

  /* 案型字卡（06_card_1~N）：不在 LAYOUTS 清單裡（張數是動態的，見 card-plugin.js），
     這裡另外用目前這個分頁已經在畫面上的 06_card_N iframe（本來就已經是這個分頁的
     內容，不用像整包下載那樣重建），逐張收進同一個zip。 */
  function collectCards(){
    var count = S.cardCount || 0;
    function cc(i){
      if(i >= count){ finishZip(); return; }
      var id = '06_card_' + (i+1);
      var ifr = iframes[id];
      if(!ifr||!ifr.contentWindow){ cc(i+1); return; }
      var api = ifr.contentWindow.BNExport;
      if(!api){ cc(i+1); return; }
      var fmt = getFmt(id), ext = fmt==='png'?'png':'jpg';
      var name = '案型字卡_第'+(i+1)+'張';
      pm.update(90, name);
      api.getBlob(fmt, fmt==='png'?1:0.95, function(blob){
        compressToLimit(blob, id, fmt, function(blob2){
          zip.file(name+'.'+ext, blob2);
          cc(i+1);
        });
      });
    }
    cc(0);
  }

  function collect(i){
    if(i >= layouts.length){ collectCards(); return; }
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
  '04_opening': 450,
  '07_msbn':    145,
  '08_sbn':     300
  /* 05_fl 工單標示無KB上限（"-"），且輸出格式是png，compressToLimit本來就會跳過png，不需要設限制 */
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
  /* 外層資料夾／zip檔名：日期(補0)-日期(補0)-蝦殺二選一（單一日期時不重複） */
  var topFolderName = (startDate && endDate && startDate!==endDate ? startDate+'-'+endDate : startDate) + '-' + ACTIVITY_NAME;
  var zipName = topFolderName;
  var zip = new JSZip();
  var topFolder = zip.folder(topFolderName);
  var totalUnits = Math.max(1, TABS.length * LAYOUTS.length);
  var doneUnits = 0;

  pm.show('整包下載中');

  function processTab(ti){
    if(ti >= TABS.length){
      /* 全部分頁的截圖都收集完成、不會再有任何畫面擷取動作了，這時候才開始
         「復原畫面 → 存暫存檔 → 打包zip」，順序刻意分開：
         1) 先把畫面復原回使用者原本停留的那個分頁（applyTabData 內部有
            broadcastFull／BN_RESTORE_STATE 這些非同步動作，抓個緩衝時間讓它
            真的套用完，不要在畫面還沒復原完就去存暫存檔，不然存到的可能是
            復原到一半的過渡狀態）；
         2) 復原完了才 saveCurrentTabState()＋buildStateBlob()，這時候
            TABS[ACTIVE_TAB].data 反映的才是「使用者按下整包下載當下」
            真正的畫面內容，不是批次跑分頁過程中殘留的中間狀態。 */
      applyTabData(TABS[ACTIVE_TAB], true);
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
      }, 500);
      return;
    }
    var tab = TABS[ti];
    var dateFolder = allDates[ti];
    /* 內層資料夾：直接用Excel工單「資料夾命名：xxx」那一列解析出來的名稱（見
       workorder-parser-shrimp.js 的 folderName／folderNameNoPrefix，存在
       tab.data._vendor 上），不用日期+品牌自己組——工單原本填什麼就叫什麼。
       只有這個分頁不是從Excel匯入（例如手動建立的分頁，沒有_vendor）時，才退回
       「日期-品牌名稱」這個舊做法，避免完全沒有資料夾名稱可用。 */
    var vendor = tab.data && tab.data._vendor;
    var vendorFolderName = (vendor && (vendor.folderName || vendor.folderNameNoPrefix)) || '';
    if(!vendorFolderName){
      var brand = (tab.data && tab.data.brand) ? String(tab.data.brand).trim() : '';
      vendorFolderName = brand ? (dateFolder + '-' + brand) : dateFolder;
    }
    var folder = topFolder.folder(vendorFolderName);
    var d = tab.data || {};

    if(d.theme) setTheme(d.theme);
    ['txt-main','txt-sub','txt-time','txt-brand','txt-guest'].forEach(function(fid){
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

    /* 廠商Logo（logo1）跟Logo2（含FL用的透明底版本logo2Fl）也要跟著每個分頁
       各自還原，不然沿用的是上一個分頁（甚至是按下整包下載當下畫面停留的那個
       分頁）留下的舊值——這就是「整包下載Logo都只吃到第一頁」的成因。
       比照 applyTabData() 同一套欄位，完整重設（含清空，不能只在有值時才覆蓋，
       不然沒有Logo2的分頁會被上一個分頁殘留的圖污染）。 */
    S.imgs.logo1 = d.logo1 || null;
    S.imgs.logo2 = d.logo2 || null;
    S.imgs.logo2Fl = d.logo2Fl || null;
    S.logo2Raw = d.logo2Raw || null;
    S.logo2Scale = d.logo2Scale;
    S.logo2OffX = d.logo2OffX;
    S.logo2OffY = d.logo2OffY;
    S.logo2Shape = d.logo2Shape;
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

    /* 案型字卡：每個廠商分頁張數不同，跟 applyTabData() 同樣邏輯重建這個分頁的
       S.cards/S.cardCount/S.activeCard，再重新長出對應的 06_card_N 畫布——
       不重建的話，畫面上還停留在「上一個分頁最後顯示的張數/內容」，這個分頁
       的案型字卡就會抓錯。 */
    S.cards = (d.cards && d.cards.length) ? JSON.parse(JSON.stringify(d.cards)) : [];
    S.cardCount = (d.cardCount != null) ? d.cardCount : 1;
    S.activeCard = d.activeCard || 0;
    if(typeof ensureCards === 'function') ensureCards();
    if(typeof buildCardStrip === 'function') buildCardStrip();
    if(typeof renderCardPanel === 'function') renderCardPanel();

    function captureCards(cb){
      var count = S.cardCount || 0;
      function collectCard(i){
        if(i >= count){ cb(); return; }
        var id = '06_card_' + (i+1);
        var ifr = iframes[id];
        if(!ifr||!ifr.contentWindow){ collectCard(i+1); return; }
        var api = ifr.contentWindow.BNExport;
        if(!api){ collectCard(i+1); return; }
        var fmt = getFmt(id), ext = fmt==='png'?'png':'jpg';
        var name = '案型字卡_第'+(i+1)+'張';
        pm.update(Math.round(doneUnits/totalUnits*90), (dateFolder?dateFolder+' · ':'')+name);
        api.getBlob(fmt, fmt==='png'?1:0.95, function(blob){
          compressToLimit(blob, id, fmt, function(blob2){
            folder.file(name+'.'+ext, blob2);
            collectCard(i+1);
          });
        });
      }
      collectCard(0);
    }

    function captureLayouts(){
      var layouts = LAYOUTS;
      function collectLayout(i){
        if(i >= layouts.length){
          /* 案型字卡是動態長出來的新iframe，剛建立需要一點載入時間（字型/畫面），
             這裡跟其他版位一樣多留一點緩衝再開始抓圖，避免抓到還沒渲染完的畫面 */
          setTimeout(function(){ captureCards(function(){ processTab(ti+1); }); }, 300);
          return;
        }
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


