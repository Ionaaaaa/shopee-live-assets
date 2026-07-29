'use strict';

/* ── 匯入工單 popup：Excel + Logo資料夾 + 主持人/商品資料夾，選完按「確認匯入」才一次處理 ── */
var _importState = { excelFile:null, assetFiles:[] };

function openImportModal(){
  _importState = { excelFile:null, assetFiles:[] };
  resetImportZoneText('import-zone-excel', '點擊上傳 Excel 工單', '支援 .xlsx 格式');
  resetImportZoneText('import-zone-assets', '上傳素材資料夾（Logo＋主持人／商品，可選）', 'Logo、主持人、商品圖可放同一個資料夾，依檔名自動比對');
  setImportZoneSuccess('import-zone-excel', false);
  setImportZoneSuccess('import-zone-assets', false);
  document.getElementById('popup-import').classList.add('open');
}

function resetImportZoneText(zoneId, title, sub){
  var zone = document.getElementById(zoneId);
  if(!zone) return;
  var t = zone.querySelector('.import-zone-title'); if(t) t.textContent = title;
  var s = zone.querySelector('.import-zone-sub'); if(s) s.textContent = sub;
}

/* 上傳成功後外框從橘色虛線改成橘色實線，一眼確認這個區塊真的選到檔案了。
   .success class 只是狀態標記本身（給 hover 那兩個 inline handler 判斷用，
   避免滑鼠移開時把成功狀態的橘色蓋回灰色），實際邊框樣式還是直接設 inline
   style，因為原本邊框顏色就是用 inline style 控制（見 editor.html），
   維持同一套做法，不用另外拉一份會互相打架的CSS規則。 */
function setImportZoneSuccess(zoneId, on){
  var zone = document.getElementById(zoneId);
  if(!zone) return;
  zone.classList.toggle('success', !!on);
  zone.style.borderStyle = on ? 'solid' : 'dashed';
  zone.style.borderColor = on ? 'var(--accent-orange)' : 'var(--border2)';
}

function onImportFilePicked(e, kind){
  if(kind === 'excel'){
    var f = e.target.files[0];
    _importState.excelFile = f || null;
    if(f){
      resetImportZoneText('import-zone-excel', '已選擇：'+f.name, '點擊可重新選擇');
      setImportZoneSuccess('import-zone-excel', true);
    }
  } else if(kind === 'assets'){
    var files = Array.prototype.slice.call(e.target.files).filter(function(f){ return /\.(png|jpe?g|webp)$/i.test(f.name); });
    _importState.assetFiles = files;
    if(files.length){
      resetImportZoneText('import-zone-assets', '已選擇 '+files.length+' 個圖片檔案', '點擊可重新選擇資料夾');
      setImportZoneSuccess('import-zone-assets', true);
    }
  }
}

/* 依「別名關鍵字」在一堆 File 裡找最匹配的一個。
   雙向模糊比對：檔名包含關鍵字、或關鍵字包含檔名，任一成立就算配對成功
   （因為 Excel 有時填「主持人Nia」這種帶前綴的字，檔名可能只有「Nia」；
     商品名有時是「提姆·鄧肯和馬刺王朝」這種長描述，檔名可能只取關鍵字） */
function matchFileByAliases(files, aliases){
  if(!files || !files.length) return null;
  for(var i=0;i<files.length;i++){
    var base = files[i].name.replace(/\.[^.]+$/,'').toLowerCase();
    for(var j=0;j<aliases.length;j++){
      var a = (aliases[j]||'').toLowerCase().trim();
      if(!a) continue;
      if(base.indexOf(a) !== -1 || (a.length>=2 && a.indexOf(base)!==-1)) return files[i];
    }
  }
  return null;
}

/* Excel 欄位常見寫法是「主持人Nia」「來賓HBK」這種帶身分前綴，
   先把常見前綴清掉，取出真正的姓名，比對檔名時才不會整串對不上 */
function stripNamePrefix(name){
  if(!name) return name;
  return String(name).trim().replace(/^(主持人|主持|來賓|guest|host)[:：\s]*/i, '').trim();
}

var SHADOW_SLOT_ALIASES = {
  host1:    ['host1','主持人1','h1'],
  host2:    ['host2','主持人2','來賓','guest','h2'],
  product1: ['product1','商品1','p1'],
  product2: ['product2','商品2','p2'],
  product3: ['product3','商品3','p3']
};
var LOGO_ALIASES = {
  logo1: ['logo1','蝦皮直播','shopee_live','shopeelive','shopee-live'],
  logo2: ['logo2','明星直播間','star_studio','starstudio','star-studio']
};

/* 素材資料夾（Logo＋主持人＋商品都在同一包裡）：優先用 Excel 實際填的姓名/品名比對，
   找不到才退回版位代號（host1/商品1...）當關鍵字猜猜看。
   呼叫前必須先 window.ShadowEditor.setCombo() 決定好版型，再比對填格子，避免版型還沒切換、
   格子先被填入時因為目前顯示的版型不對而「看起來沒偵測到」 */
function matchAndApplyHostFiles(files, g){
  g = g || {};
  var matchedCount = 0;
  if(!files || !files.length) return 0;

  var excelNameBySlot = {
    host1: stripNamePrefix(g.host1Name),
    host2: stripNamePrefix(g.host2Name),
    product1: g.product1Name,
    product2: g.product2Name,
    product3: g.product3Name
  };

  if(window.ShadowEditor){
    Object.keys(SHADOW_SLOT_ALIASES).forEach(function(slotId){
      var aliases = [];
      if(excelNameBySlot[slotId]) aliases.push(excelNameBySlot[slotId]);
      aliases = aliases.concat(SHADOW_SLOT_ALIASES[slotId]);
      var f = matchFileByAliases(files, aliases);
      if(f){ window.ShadowEditor.setSlotFromFile(slotId, f); matchedCount++; }
    });
  }

  /* 注意：這裡「不」再額外把主持人單張人像照直接塞進「主持人」圖層了──
     那張圖層現在保留給陰影編輯 popup 匯出的商品+陰影合成圖使用，
     避免同一個人同時出現「直接匯入的原圖」和「陰影套件疊出來的版本」兩張。 */
  return matchedCount;
}

/* 同一包素材資料夾裡的 Logo 部分：先比對現有 logo1（蝦皮直播）/ logo2（明星直播間）；
   Excel 的「LOGO」欄位（如「讀共」這種廠商/合作方名稱）優先權更高——
   如果比對到檔案，存進 S.logo2Raw（原圖，未合成），交給 Logo2 編輯面板處理
   （面板開啟時看到 S.logo2Raw 存在就會自動載入這張圖，使用者確認/調整後按
   「下一步」才會真的合成套用，不會在這裡就直接把未經處理的原圖套到版位上）。 */
function matchAndApplyLogoFiles(files, g, cb){
  g = g || {};
  var matchedCount = 0;
  if(!files || !files.length){ window.__importedLogoFiles = []; if(cb) cb(0); return 0; }
  Object.keys(LOGO_ALIASES).forEach(function(key){
    var f = matchFileByAliases(files, LOGO_ALIASES[key]);
    if(f){ applyImageFile(f, key); matchedCount++; }
  });
  window.__importedLogoFiles = files; // 保留整包，供之後的 Logo 功能使用
  if(g.logoName){
    var pendingLogoFile = matchFileByAliases(files, [g.logoName]);
    window.__pendingLogoMatch = { name: g.logoName, file: pendingLogoFile || null };
    if(pendingLogoFile){
      var reader = new FileReader();
      reader.onload = function(ev){
        S.logo2Raw = ev.target.result;
        S.logo2Scale = undefined; S.logo2OffX = undefined; S.logo2OffY = undefined; S.logo2Shape = undefined;
        matchedCount++;
        if(cb) cb(matchedCount); // 一定要等讀完才回呼，不然 S.logo2Raw 還沒寫入 popup 就先開了，會看起來像沒讀到
      };
      reader.readAsDataURL(pendingLogoFile);
      return matchedCount; // 非同步分支：實際筆數會晚一點透過 cb 才知道，這裡先回傳目前值
    }
  }
  if(cb) cb(matchedCount);
  return matchedCount;
}

/* 解析 Excel 檔案（不含 UI 副作用之外的東西），成功回傳 tabs 陣列 */
function processExcelFile(file, cb){
  var reader = new FileReader();
  reader.onload = function(ev){
    try{
      var wb = XLSX.read(ev.target.result, {type:'binary', cellDates:false});
      var groups = [];
      wb.SheetNames.forEach(function(sheetName){
        var ws = wb.Sheets[sheetName];
        var rows = XLSX.utils.sheet_to_json(ws, {header:1, raw:true});
        groups = groups.concat(parseWorkorderGroups(rows));
      });
      cb(null, groups);
    }catch(err){
      cb(err, null);
    }
  };
  reader.readAsBinaryString(file);
}

function confirmImport(){
  var st = _importState;
  if(!st.excelFile && !st.assetFiles.length){
    toast('請至少選擇一項要匯入的內容','err');
    return;
  }

  function afterExcel(groupData){
    groupData = groupData || {};
    /* 先進入暫存模式：版型/素材的變更先不廣播給畫布，等使用者在確認 popup 按下按鈕才 commit() */
    if(window.ShadowEditor){
      window.ShadowEditor.enterPending();
      /* 一定要先切版型，再比對填格子，不然格子填進去時目前顯示的版型還是舊的，
         畫面上會看起來像「沒偵測到」 */
      if(groupData.combo) window.ShadowEditor.setCombo(groupData.combo);
    }

    /* 主持人／來賓姓名：寫入文字欄位（LPBN、IG 會顯示「主持人 | 姓名」「來賓 | 姓名」），
       之前這裡只有比對照片檔案，姓名一直沒有真的寫進畫布文字欄位 */
    var hostNameEl  = document.getElementById('txt-brand');
    var guestNameEl = document.getElementById('txt-guest');
    if(hostNameEl && groupData.host1Name)  hostNameEl.value  = stripNamePrefix(groupData.host1Name);
    if(guestNameEl && groupData.host2Name) guestNameEl.value = stripNamePrefix(groupData.host2Name);
    if((groupData.host1Name || groupData.host2Name) && typeof broadcast === 'function') broadcast();

    var hostMatched = matchAndApplyHostFiles(st.assetFiles, groupData);
    matchAndApplyLogoFiles(st.assetFiles, groupData, function(logoMatched){
      closePopup('import');
      var msgParts = [];
      if(st.excelFile) msgParts.push('Excel 已匯入');
      if(st.assetFiles.length) msgParts.push('主持人/商品/Logo 比對到 '+(hostMatched+logoMatched)+' 個');
      toast(msgParts.join('，')||'匯入完成','ok',3000);

      /* 有素材可以確認，或有版型組合，就打開確認 popup；純文字匯入就不用彈出來 */
      if(st.assetFiles.length || groupData.combo){
        openLogo2Popup(true); // 新流程：先確認/調整 Logo2，按「下一步」才會接著跳到陰影面板
        // true = 這次是從匯入流程自動開啟，按下一步時要接著跳陰影面板；
        // 從右側「編輯 Logo2」按鈕手動開啟的話不會傳這個參數，按確認就只是單純套用，不會跳轉
      }
    });
  }

  if(st.excelFile){
    processExcelFile(st.excelFile, function(err, groups){
      if(err){ toast('Excel 解析失敗：'+err.message,'err'); return; }
      if(!groups.length){
        toast('Excel 找不到分頁資料，請確認工單格式','err');
        afterExcel(null); // Excel 沒讀到東西，還是繼續處理已選的圖片資料夾
        return;
      }
      var tabs = groups.map(function(g, i){
        return { id:'tab-'+(i+1), label: tabLabelFor(g, i), data: g };
      });
      buildTabs(tabs);
      afterExcel(groups[0] || null);
    });
  } else {
    afterExcel(null);
  }
}

/* 分頁標籤：優先用「日期」欄位；新版工單常把日期併在「時間」欄位裡（例如「6/15 19:00」），
   這種格式沒有獨立的日期欄位，所以再從時間字串抓開頭的日期部分當標籤，
   兩者都抓不到才退回「第N天」 */
function tabLabelFor(g, i){
  if(g.date) return g.date;
  if(g.time){
    var m = String(g.time).match(/^\s*(\d{1,2}\/\d{1,2})/);
    if(m) return m[1];
  }
  return '第'+(i+1)+'天';
}

function parseWorkorderGroups(rows){
  var groups = [];
  /* 先放一個「隱含分組」：像「公版」這種格式沒有款式當開頭標記，
     整張表就是一組資料，最後如果完全沒填到任何欄位會被下面 filter 掉，不影響原本多天格式 */
  var current = {};
  groups.push(current);
  var fieldMap = {'款式':'theme','主標':'main','副標':'sub','日期':'date','時間':'time','素材路徑':'hostPath','版型':'combo',
    '主持人':'host1Name','來賓':'host2Name','商品1':'product1Name','商品2':'product2Name','商品3':'product3Name','LOGO':'logoName',
    'FL文案(6字)':'flText'};

  rows.forEach(function(row){
    var mVal = row[12]; // M 欄 index 12
    var nVal = row[13]; // N 欄 index 13
    /* 遇到「款式」，如果目前這組已經有資料了，代表是下一組新的開始 */
    if(mVal === '款式' && Object.keys(current).length > 0){
      current = {};
      groups.push(current);
    }
    if(current && mVal && nVal !== undefined && nVal !== null && nVal !== ''){
      var key = fieldMap[String(mVal).trim()];
      if(key){
        var val = nVal;
        /* 日期處理：支援 Date物件、Excel序列數、2026/6/15、6/15 等所有格式 */
        if(key === 'date'){
          var parsed = null;
          if(val instanceof Date && !isNaN(val)){
            parsed = { m: val.getMonth()+1, d: val.getDate() };
          } else if(typeof val === 'number' && val > 40000){
            var dt = new Date(Math.round((val - 25569) * 86400 * 1000));
            parsed = { m: dt.getUTCMonth()+1, d: dt.getUTCDate() };
          } else {
            /* 字串：可能是 "2026/6/15"、"6/15"、"46188" 等 */
            var s = String(val).trim();
            var numVal = parseFloat(s);
            if(!isNaN(numVal) && numVal > 40000){
              var dt2 = new Date(Math.round((numVal - 25569) * 86400 * 1000));
              parsed = { m: dt2.getUTCMonth()+1, d: dt2.getUTCDate() };
            } else {
              /* 嘗試解析日期字串，取最後兩段月/日 */
              var parts = s.replace(/-/g,'/').split('/');
              if(parts.length >= 2){
                var m = parseInt(parts[parts.length-2]);
                var d = parseInt(parts[parts.length-1]);
                if(m>=1&&m<=12&&d>=1&&d<=31) parsed = {m:m, d:d};
              }
            }
          }
          if(parsed) val = parsed.m+'/'+parsed.d;
        }
        /* 時間處理 */
        if(key === 'time'){
          if(typeof val === 'number'){
            var totalMin = Math.round(val*24*60);
            var hh = Math.floor(totalMin/60);
            var mm = totalMin%60;
            val = hh+':'+(mm<10?'0':'')+mm;
          }
        }
        /* 版型：Excel 常寫成「D組合(3品)」，只取開頭字母 A/B/C/D */
        if(key === 'combo'){
          var letter = String(val).trim().toUpperCase().charAt(0);
          if('ABCD'.indexOf(letter) === -1) return; // 不是合法版型代碼就略過
          val = letter;
        }
        current[key] = String(val).trim();
      }
    }
  });
  return groups.filter(function(g){ return Object.keys(g).length > 0; });
}


function importExcel(file){
  toast('解析 Excel 中...', '', 3000);
  var reader = new FileReader();
  reader.onload = function(ev){
    try{
      var wb = XLSX.read(ev.target.result, {type:'binary', cellDates:true});
      var ws = wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(ws, {header:1});
      var fieldMap = {};
      rows.forEach(function(row){
        if(!Array.isArray(row)) return;
        var key = row[12] !== undefined && row[12] !== null ? row[12].toString().trim() : '';
        var val = row[13];
        if(key && key !== '製作內容' && val !== undefined && val !== null && val !== ''){
          fieldMap[key] = val;
        }
      });
      console.log('[Excel] keys found:', Object.keys(fieldMap));
      if(Object.keys(fieldMap).length === 0){
        toast('找不到 M/N 欄資料，請確認工單格式', 'err'); return;
      }
      applyFieldMap(fieldMap);
    } catch(err){
      console.error('[Excel] error:', err);
      toast('Excel 解析失敗：'+err.message, 'err');
    }
  };
  reader.readAsBinaryString(file);
}

function applyFieldMap(fm){
  function fs(v){ return v ? v.toString().trim() : ''; }
  function fd(v){
    if(!v) return '';
    if(v instanceof Date) return String(v.getMonth()+1)+'/'+String(v.getDate());
    return v.toString().trim();
  }
  function ft(v){
    if(!v) return '';
    if(v instanceof Date) return String(v.getHours()).padStart(2,'0')+':'+String(v.getMinutes()).padStart(2,'0');
    return v.toString().trim();
  }

  var filled = 0;
  var t = fs(fm['款式']).toUpperCase();
  if('ABC'.indexOf(t)>=0){ setTheme(t); filled++; }

  var pairs = [['主標','txt-main'],['副標','txt-sub'],['主持人','txt-brand']];
  pairs.forEach(function(p){
    var val = fs(fm[p[0]]);
    if(val){ var el=document.getElementById(p[1]); if(el){el.value=val; filled++;} }
  });

  var ds = fd(fm['日期']); if(ds){ var el=document.getElementById('txt-date'); if(el){el.value=ds; filled++;} }
  var ts = ft(fm['時間']); if(ts){ var el=document.getElementById('txt-time'); if(el){el.value=ts; filled++;} }

  /* 陰影套件：版型組合（工單 M19/N19，如「D組合(3品)」取開頭字母 A/B/C/D） */
  var comboLetter = fs(fm['版型']).toUpperCase().charAt(0);
  if('ABCD'.indexOf(comboLetter)>=0){
    var comboSel = document.getElementById('lc-combo-sel');
    if(comboSel){
      comboSel.value = comboLetter;
      comboSel.dispatchEvent(new Event('change'));
      filled++;
    }
  }

  /* 素材路徑沒填就直接用主持人名字 */
  var hostKey = (fs(fm['素材路徑']) || fs(fm['主持人'])).replace(/\.(png|jpg|jpeg)$/i,'');
  console.log('[Excel] hostKey:', hostKey);

  if(hostKey){
    console.log('[hosts] trying to find:', hostKey);
    loadHostByName(hostKey, function(src){
      console.log('[hosts] result src:', src ? src.slice(0,40) : 'NOT FOUND');
      if(src){
        loadSrcAsBase64(src, function(b64){
          if(b64){ applyHost(b64, hostKey); }
          broadcastFull();
          toast('匯入完成！'+filled+' 個欄位 + 主持人圖', 'ok', 3000);
        });
      } else {
        broadcastFull();
        toast('匯入完成，找不到主持人圖：'+hostKey, 'err', 5000);
      }
    });
  } else {
    broadcastFull();
    toast('匯入完成！'+filled+' 個欄位', 'ok', 3000);
  }
}

function applyExcelData(rows){
  /* SheetJS header:1 回傳二維陣列
     重點：不用 row index，改掃描全部列找 M欄有值的格子
     M欄 = index 12, N欄 = index 13
     這樣不受合併列、空列影響 */

  function getVal(v){
    if(v === undefined || v === null || v === '') return '';
    if(v instanceof Date){
      var mo = String(v.getMonth()+1);
      var d  = String(v.getDate());
      var hh = String(v.getHours()).padStart(2,'0');
      var mm = String(v.getMinutes()).padStart(2,'0');
      return mo+'/'+d+' '+hh+':'+mm;
    }
    return v.toString().trim();
  }

  /* 掃描所有列，M有值就記錄 */
  var fieldMap = {};
  rows.forEach(function(row, ri){
    if(!row) return;
    var field = getVal(row[12]);
    var rawN  = row[13];
    if(field && field !== '製作內容' && rawN !== undefined && rawN !== null && rawN !== ''){
      fieldMap[field] = rawN; /* 保留原始值（Date物件等），getVal 在使用時才轉 */
    }
    /* C欄(index 2) = 款式，Row 9 = index 8 */
    if(ri === 8 && row[2]){
      var t = getVal(row[2]).toUpperCase();
      if('ABC'.indexOf(t) >= 0) setTheme(t);
    }
  });

  console.log('[Excel] fieldMap:', JSON.stringify(fieldMap));

  /* 款式 */
  if(fieldMap['款式']){
    var t = getVal(fieldMap['款式']).toUpperCase().trim();
    if('ABC'.indexOf(t) >= 0) setTheme(t);
  }

  /* 文案填入 */
  var textMap = {'主標':'txt-main','副標':'txt-sub','主持人':'txt-brand'};
  var filled = 0;
  Object.keys(textMap).forEach(function(key){
    var val = fieldMap[key];
    if(val !== undefined && val !== null && val !== ''){
      var el = document.getElementById(textMap[key]);
      if(el){ el.value = getVal(val); filled++; }
    }
  });

  /* 日期 + 時間組合 */
  var rawDate = fieldMap['日期'];
  var rawTime = fieldMap['時間'];
  var dateStr = '', timeStr = '';
  if(rawDate instanceof Date){
    dateStr = String(rawDate.getMonth()+1)+'/'+String(rawDate.getDate());
  } else if(rawDate){ dateStr = getVal(rawDate); }
  if(rawTime instanceof Date){
    timeStr = String(rawTime.getHours()).padStart(2,'0')+':'+String(rawTime.getMinutes()).padStart(2,'0');
  } else if(rawTime){ timeStr = getVal(rawTime); }

  var elDate = document.getElementById('txt-date');
  var elTime = document.getElementById('txt-time');
  if(elDate && dateStr){ elDate.value = dateStr; filled++; }
  if(elTime && timeStr){ elTime.value = timeStr; filled++; }

  /* 素材路徑：去掉副檔名再比對 */
  var rawHost = fieldMap['素材路徑'] || fieldMap['主持人'] || '';
  var hostName = getVal(rawHost).replace(/\.(png|jpg|jpeg)$/i, '');
  console.log('[Excel] fieldMap keys:', Object.keys(fieldMap));
  console.log('[Excel] hostName:', hostName);

  if(hostName){
    loadHostByName(hostName, function(src){
      if(src){
        applyHost(src, hostName);
        broadcastFull();
        toast('匯入完成！填入 '+filled+' 個欄位 + 主持人圖', 'ok', 3000);
      } else {
        broadcastFull();
        toast('匯入完成，找不到主持人圖：'+hostName+'（請確認 hosts/ 資料夾）', 'err', 5000);
      }
    });
    return;
  }

  broadcastFull();
  toast('匯入完成！填入 '+filled+' 個欄位', 'ok', 3000);
}

function importZip(file){
  toast('解析 ZIP 中...', '', 3000);
  JSZip.loadAsync(file).then(function(zip){
    /* 找 Excel 檔 */
    var xlsxFile = null;
    zip.forEach(function(path, f){
      if(!f.dir && /\.xlsx$/i.test(path) && xlsxFile === null) xlsxFile = f;
    });
    if(!xlsxFile){ toast('找不到 .xlsx 檔案', 'err'); return; }

    return xlsxFile.async('arraybuffer').then(function(buf){
      /* 解析 Excel */
      var wb  = XLSX.read(buf, {type:'array', cellDates:true, cellNF:false});
      var ws  = wb.Sheets[wb.SheetNames[0]];
      var rows = XLSX.utils.sheet_to_json(ws, {header:1});

      /* 套用 Excel 資料 */
      var zipFieldMap = {};
      rows.forEach(function(row){
        if(!row || !row[12]) return;
        var key = (row[12]||'').toString().trim();
        var val = row[13];
        if(key && key !== '製作內容' && val !== null && val !== undefined && val !== ''){
          zipFieldMap[key] = val;
        }
      });
      applyFieldMap(zipFieldMap);
      var hostName = '';  // applyFieldMap 已處理

      /* 主持人名稱：先找圖庫，再找 images/ 資料夾 */
      /* hostName 已在上方宣告 */
      var hostSrc  = null;

      /* 1. 比對圖庫 */
      if(hostName){
        try{
          var hostLib = JSON.parse(localStorage.getItem('bn_hosts_shrimp2choice_v1')||'[]');
          var nameNoExt = hostName.replace(/\.[^.]+$/,'');
          var match = hostLib.find(function(h){
            var hn = h.name.replace(/\.[^.]+$/,'');
            return hn === nameNoExt || hn === nameNoExt+'-1' || hn.startsWith(nameNoExt+'-');
          });
          if(match) hostSrc = match.src;
        }catch(e){}
      }

      /* 2. 找 images/ 資料夾 */
      var imgPromises = [];
      if(!hostSrc){
        zip.forEach(function(path, f){
          if(!f.dir && /images\//i.test(path) && /\.(png|jpg|jpeg)$/i.test(path)){
            imgPromises.push(
              f.async('base64').then(function(b64){
                var ext  = path.split('.').pop().toLowerCase();
                var mime = ext === 'png' ? 'image/png' : 'image/jpeg';
                return 'data:'+mime+';base64,'+b64;
              })
            );
          }
        });
      }

      return Promise.all(imgPromises).then(function(srcs){
        var finalSrc = hostSrc || (srcs.length > 0 ? srcs[0] : null);
        if(finalSrc){
          applyHost(finalSrc, hostName || '主持人');
        }
        broadcastFull();
        toast('ZIP 匯入完成！填入 '+filled+' 個欄位'+(finalSrc?' + 主持人圖':''), 'ok', 3000);
      });
    });
  }).catch(function(err){
    toast('ZIP 解析失敗：'+err.message, 'err');
  });
}

/* ── 主持人圖庫：直接從 hosts/ 資料夾路徑載入，不存 localStorage ── */
var KNOWN_HOST_NAMES = [
  '凱特','何偉綸','周庭安','瑞瑞','甜蜜蜜','Melody','Alren','亞莎'
];
/* 每位主持人自動產生 1~5 張編號 */
var KNOWN_HOSTS = [];
KNOWN_HOST_NAMES.forEach(function(name){
  for(var i=1;i<=10;i++) KNOWN_HOSTS.push(name+'-'+i);
});

/* 用路徑方式比對，不存 base64 */
function findHostSrc(name){
  var clean = name.trim().replace(/\.(png|jpg|jpeg)$/i,'').trim();
  /* 取出主持人姓名（去掉編號）*/
  var baseName = clean.replace(/[-_]\d+$/, '');
  var candidates = [];
  /* 優先找子資料夾版本 */
  candidates.push('hosts/'+baseName+'/'+clean+'.png');
  candidates.push('hosts/'+baseName+'/'+clean+'.jpg');
  if(!/[-_]\d+$/.test(clean)){
    candidates.push('hosts/'+baseName+'/'+baseName+'-1.png');
    candidates.push('hosts/'+baseName+'/'+baseName+'-1.jpg');
  }
  /* 備用：舊版根目錄 */
  candidates.push('hosts/'+clean+'.png');
  candidates.push('hosts/'+clean+'.jpg');
  if(!/[-_]\d+$/.test(clean)){
    candidates.push('hosts/'+clean+'-1.png');
    candidates.push('hosts/'+clean+'-1.jpg');
  }
  console.log('[hosts] candidates:', candidates);
  return candidates;
}

/* 把任何圖片 src（路徑或 base64）轉成 base64 */
function loadSrcAsBase64(src, cb){
  if(src && src.startsWith('data:')){
    cb(src); return; // 已經是 base64
  }
  var img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = function(){
    var cv2 = document.createElement('canvas');
    cv2.width = img.naturalWidth; cv2.height = img.naturalHeight;
    cv2.getContext('2d').drawImage(img, 0, 0);
    try{ cb(cv2.toDataURL('image/png')); }
    catch(e){ cb(src); } // CORS 問題時直接用原路徑
  };
  img.onerror = function(){ cb(null); };
  img.src = src;
}

function loadHostByName(name, cb){
  var candidates = findHostSrc(name);
  var i = 0;
  function tryNext(){
    if(i >= candidates.length){ console.log('[hosts] all failed'); cb(null); return; }
    var src = candidates[i++];
    console.log('[hosts] trying:', src);
    var img = new Image();
    img.onload = function(){ console.log('[hosts] found:', src); cb(src, img); };
    img.onerror = function(){ console.log('[hosts] not found:', src); tryNext(); };
    img.src = src;
  }
  tryNext();
}

/* 給 popup 用：只掃指定主持人的資料夾（1~10張），不依賴 KNOWN_HOST_NAMES */
function scanHostByName(name, cb){
  var found = [];
  var total = 10;
  var remaining = total;
  for(var i = 1; i <= total; i++){
    (function(idx){
      var candidates = [
        'hosts/'+name+'/'+name+'-'+idx+'.png',
        'hosts/'+name+'/'+name+'-'+idx+'.jpg',
        'hosts/'+name+'-'+idx+'.png',
        'hosts/'+name+'-'+idx+'.jpg'
      ];
      var j = 0;
      function tryOne(){
        if(j >= candidates.length){ if(--remaining === 0) cb(found); return; }
        var src = candidates[j++];
        var img = new Image();
        img.onload = function(){ found.push({name:name+'-'+idx, src:src}); if(--remaining===0) cb(found); };
        img.onerror = tryOne;
        img.src = src;
      }
      tryOne();
    })(i);
  }
}

/* 給 popup 用：掃描已知清單，回傳存在的檔案 */
function scanHostLibrary(cb){
  var found = [];
  var remaining = KNOWN_HOSTS.length;
  KNOWN_HOSTS.forEach(function(name){
    var baseName = name.replace(/[-_]\d+$/,'');
    var candidates = [
      'hosts/'+baseName+'/'+name+'.png',
      'hosts/'+baseName+'/'+name+'.jpg',
      'hosts/'+name+'.png',
      'hosts/'+name+'.jpg'
    ];
    var j = 0;
    function tryOne(){
      if(j >= candidates.length){ if(--remaining === 0) cb(found); return; }
      var src = candidates[j++];
      var img = new Image();
      img.onload = function(){ found.push({name:name, src:src}); if(--remaining===0) cb(found); };
      img.onerror = tryOne;
      img.src = src;
    }
    tryOne();
  });
  if(KNOWN_HOSTS.length === 0) cb([]);
}

function autoLoadHosts(){ /* no-op，改用 scanHostLibrary */ }

/* ── Init ── */

