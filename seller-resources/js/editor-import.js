'use strict';

/* ── 匯入工單 popup：Excel + Logo資料夾 + 主持人/商品資料夾，選完按「確認匯入」才一次處理 ── */
var _importState = { excelFile:null, assetFiles:[] };

function openImportModal(){
  _importState = { excelFile:null, assetFiles:[] };
  resetImportZoneText('import-zone-excel', '點擊上傳 Excel 工單', '支援 .xlsx 格式');
  resetImportZoneText('import-zone-assets', '上傳素材資料夾（Logo＋主持人／商品，可選）', 'Logo、主持人、商品圖可放同一個資料夾，依檔名自動比對');
  var zEx = document.getElementById('import-zone-excel'); if(zEx) zEx.classList.remove('done');
  var zAs = document.getElementById('import-zone-assets'); if(zAs) zAs.classList.remove('done');
  document.getElementById('popup-import').classList.add('open');
}

function resetImportZoneText(zoneId, title, sub){
  var zone = document.getElementById(zoneId);
  if(!zone) return;
  var t = zone.querySelector('.import-zone-title'); if(t) t.textContent = title;
  var s = zone.querySelector('.import-zone-sub'); if(s) s.textContent = sub;
}

function onImportFilePicked(e, kind){
  if(kind === 'excel'){
    var f = e.target.files[0];
    _importState.excelFile = f || null;
    if(f){
      resetImportZoneText('import-zone-excel', '已選擇：'+f.name, '點擊可重新選擇');
      document.getElementById('import-zone-excel').classList.add('done');
    }
  } else if(kind === 'assets'){
    var files = Array.prototype.slice.call(e.target.files).filter(function(f){ return /\.(png|jpe?g|webp)$/i.test(f.name); });
    _importState.assetFiles = files;
    if(files.length){
      resetImportZoneText('import-zone-assets', '已選擇 '+files.length+' 個圖片檔案', '點擊可重新選擇資料夾');
      document.getElementById('import-zone-assets').classList.add('done');
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
  /* 商品比例（Excel O欄，0~1），只有商品1/2/3會有值，人物沒有這個欄位，
     setSlotFromFile 第三個參數不是數字時會自動退回預設 100%，不用另外判斷 */
  var ratioBySlot = {
    product1: g.product1Ratio,
    product2: g.product2Ratio,
    product3: g.product3Ratio
  };

  if(window.ShadowEditor){
    Object.keys(SHADOW_SLOT_ALIASES).forEach(function(slotId){
      var aliases = [];
      if(excelNameBySlot[slotId]) aliases.push(excelNameBySlot[slotId]);
      aliases = aliases.concat(SHADOW_SLOT_ALIASES[slotId]);
      var f = matchFileByAliases(files, aliases);
      if(f){ window.ShadowEditor.setSlotFromFile(slotId, f, ratioBySlot[slotId]); matchedCount++; }
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

  /* 匯入工單進度條：讀取Excel → 解析建立分頁 → 比對主持人／商品圖片 → 比對Logo → 完成，
     五段進度。目前是「階段性」進度，matchAndApplyHostFiles() 對各欄位的檔案讀取是
     各自獨立、不等彼此完成（fire-and-forget），沒有做到「已比對 n/5」這種逐檔進度——
     之後如果素材資料夾檔案量變大、需要更細的進度，要把那段改成有回呼才能逐一累加。 */
  pm.show('匯入工單中');
  pm.update(5, '讀取 Excel…');

  function afterExcel(groupData){
    groupData = groupData || {};
    pm.update(45, '解析建立分頁…');
    /* 先進入暫存模式：版型/素材的變更先不廣播給畫布，等使用者在確認 popup 按下按鈕才 commit() */
    if(window.ShadowEditor){
      window.ShadowEditor.enterPending();
      /* 一定要先切版型，再比對填格子，不然格子填進去時目前顯示的版型還是舊的，
         畫面上會看起來像「沒偵測到」 */
      if(groupData.combo) window.ShadowEditor.setCombo(groupData.combo);
    }

    /* 購物專家名稱：寫入文字欄位（LPBN 會顯示「購物專家 | 姓名」）。
       這個專案的畫面不顯示「來賓」文字credit，所以人物2（host2Name，陰影合成用的
       照片身分）只拿來比對/帶入人物2照片，不會再寫進任何文字欄位。 */
    var hostNameEl  = document.getElementById('txt-brand');
    var brandNameVal = groupData.brandName || groupData.host1Name;
    if(hostNameEl && brandNameVal)  hostNameEl.value  = stripNamePrefix(brandNameVal);
    if(brandNameVal && typeof broadcast === 'function') broadcast();

    /* 賣家/店家名稱：工單「LOGO」欄位填的（例如「Cerave適樂膚」）才是真正的
       賣家名稱，不是「購物專家名稱」（txt-brand，那個是主持人/來賓身分）。
       這裡沒有對應的側欄輸入框，只存進 S 給匯出檔名用；每次匯入都直接覆蓋
       （沒有LOGO欄位就清空），不留著上一次匯入的舊值。 */
    /* groupData 跟 tab.data 是同一個物件（buildTabs 建分頁時直接把 groupData
       當 tab.data 存），這裡順手把 sellerName 也寫回這個物件本身──
       buildTabs() 內部用 setTimeout 排程了一次稍後才執行的 applyTabData()
       （要等 iframe 就緒），那次呼叫會用 tab.data.sellerName 覆蓋回 S.sellerName，
       如果不順手寫回去，這裡剛設好的值 800ms 後就會被那次延遲呼叫用「空值」蓋掉。 */
    S.sellerName = groupData.logoName || '';
    groupData.sellerName = S.sellerName;

    /* FL文案：寫入側欄欄位（06_fl版位會透過broadcastFull接收）。
       同樣不判斷 undefined 才寫入——每次匯入都代表全新的工單狀態，
       沒有文案就該清空，不該留著上一次匯入的舊文案。 */
    var flEl = document.getElementById('txt-fl');
    if(flEl) flEl.value = groupData.flText || '';
    /* FL商品欄位：存進 S.flProductSlot，broadcast時再去找對應的商品 dataUrl。
       同時要把側欄「FL 商品」下拉選單的畫面也同步選到對應的商品，
       不然選單看起來還是「不放商品」，字數上限（ccFl()裡的5/6字判斷）
       會抓到選單舊的空值，誤判成6字上限，跟實際版型P其實只能5字對不起來。

       這裡刻意「不」判斷 groupData.flProductSlot !== undefined 才處理——
       每次匯入都要把選單重設成這次工單的實際狀態，包含「這次沒有商品」
       這個狀態本身。之前只在有值時才更新，導致這次工單勾N欄=FALSE
       （不放商品，應該是純文案版型T）時，選單/內部變數還留著上一次匯入
       殘留的商品選擇，畫布會誤判成版型P、繼續留商品位置，跟工單想要的
       「只有文案，不需要預留商品位置」對不起來。 */
    window._flProductSlotValue = groupData.flProductSlot || null;
    var flSlotEl = document.getElementById('fl-product-slot');
    if(flSlotEl) flSlotEl.value = groupData.flProductSlot || '';
    if(typeof ccFl === 'function') ccFl(); // 匯入完，字數上限/字數顯示要重新算一次
    if(typeof updateFlCanvasVisibility === 'function') updateFlCanvasVisibility(); // 「不製作」時要隱藏FL文案欄位＋畫布區的FL canvas

    var hostMatched = matchAndApplyHostFiles(st.assetFiles, groupData);
    pm.update(65, '比對主持人／商品圖片…');
    matchAndApplyLogoFiles(st.assetFiles, groupData, function(logoMatched){
      pm.update(90, '比對 Logo…');
      closePopup('import');
      var msgParts = [];
      if(st.excelFile) msgParts.push('Excel 已匯入');
      if(st.assetFiles.length) msgParts.push('主持人/商品/Logo 比對到 '+(hostMatched+logoMatched)+' 個');
      toast(msgParts.join('，')||'匯入完成','ok',3000);
      pm.done(msgParts.join('，')||'匯入完成');
      pm.hide();

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
      if(err){ toast('Excel 解析失敗：'+err.message,'err'); pm.hide(); return; }
      if(!groups.length){
        toast('Excel 找不到分頁資料，請確認工單格式','err');
        pm.hide();
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

/* 直播間FL 版型對照表：動態掃整張表找「版型/商品/LOGO/案型」那一列表頭，
   往下讀到M欄空白為止，建出「版型名稱 → 需不需要商品/LOGO/案型」的查表。
   不寫死列號、不寫死版型清單——之後在Excel裡新增/修改版型列，這裡都自動吃得到，
   不用再改程式碼（跟本專案「調一次、全部套用」原則一致）。 */
function buildFlVariantMap(rows){
  var map = {};
  var skipRows = {}; // 版型對照表本身佔用的列號，這些列不能落到下面一般 fieldMap 處理
  for(var i=0;i<rows.length;i++){
    var row = rows[i];
    if(row[12] === '版型' && row[13] === '商品' && row[14] === 'LOGO' && row[15] === '案型'){
      skipRows[i] = true; // 表頭那一列
      for(var j=i+1;j<rows.length;j++){
        var r = rows[j];
        var name = r[12];
        if(name === undefined || name === null || String(name).trim() === '') break;
        skipRows[j] = true;
        /* 注意：對照表的版型名稱（例如「LOGO」）剛好會撞到上面 fieldMap 的
           'LOGO':'logoName' 這種鍵值——如果不把這幾列標記起來提早跳過，
           下面一般欄位解析會把這裡的 0/1 數字誤當成 logoName 寫進去，
           把真正的 LOGO 欄位值（M13/N13）覆蓋掉 */
        map[String(name).trim()] = {
          needsProduct: Number(r[13]) === 1,
          needsLogo:    Number(r[14]) === 1,
          needsCaption: Number(r[15]) === 1
        };
      }
      break;
    }
  }
  return { map: map, skipRows: skipRows };
}

function parseWorkorderGroups(rows){
  var groups = [];
  /* 先放一個「隱含分組」：像「公版」這種格式沒有款式當開頭標記，
     整張表就是一組資料，最後如果完全沒填到任何欄位會被下面 filter 掉，不影響原本多天格式 */
  var current = {};
  groups.push(current);
  var flVariantInfo = buildFlVariantMap(rows); // 整張表只需建一次查表
  var flVariantMap = flVariantInfo.map;
  var flTableSkipRows = flVariantInfo.skipRows;
  var fieldMap = {'主標':'main','副標':'sub','日期':'date','時間':'time','素材路徑':'hostPath','版型':'combo',
    '購物專家':'brandName',
    '人物1':'host1Name','人物2':'host2Name',
    '主持人':'host1Name','來賓':'host2Name',
    '商品1':'product1Name','商品2':'product2Name','商品3':'product3Name','LOGO':'logoName',
    '指定色號':'bgColor','指定色碼':'bgColor','背景色碼':'bgColor'};

  rows.forEach(function(row, idx){
    /* 版型對照表（不製作/LOGO/商品+案型5字內/純案型6字內 那幾列）整段跳過，
       不能讓它們落到下面「款式」判斷或一般 fieldMap 解析——
       表裡剛好有一列 M欄='LOGO'，會撞到 fieldMap 的 'LOGO':'logoName'，
       把真正的LOGO欄位值誤蓋成對照表裡的 0/1 數字 */
    if(flTableSkipRows[idx]) return;
    var mVal = row[12];
    var nVal = row[13];
    var aVal = row[0];
    if(mVal === '款式' && Object.keys(current).length > 0){
      current = {};
      groups.push(current);
    }
    /* 公版工單同一張表裡「版型」出現兩次，意義不同，用同一列的 A 欄來分辨：
       第一次出現在「檔名」表頭那一列（M12/N12）── 這欄原本是選公版款式，
       現在背景改成直接選色，這欄已經沒有作用，直接略過，
       不能讓它落到下面的一般 fieldMap 處理（會被誤當成 ABCD 人物/商品組合版型）；
       第二次出現在下面內容清單裡（M18/N18）── 這才是真正的 ABCD 組合版型，
       沒有 return，會往下走一般 fieldMap 處理，正常寫入 combo */
    if(current && mVal === '版型' && aVal === '檔名'){
      return;
    }
    /* ── 直播間FL：只看右側表單，左側「是否製作」(H欄)/數量(總製作內容列的數字) 已不採用 ──
       這一列（M欄=「直播間FL」）：
         O欄 = 版型，值是「不製作」／「LOGO」／「商品 + 案型5字內」／「純案型6字內」四選一，
               對照 buildFlVariantMap() 建出的表，決定這次是否要做FL、做的話需不需要商品/LOGO/案型
       下一列（M欄通常空白）：
         N欄 = 商品(1/2/3)，只有查表結果 needsProduct 時才讀
         O欄 = LOGO，這裡不用額外解析——LOGO本身已經由上面「LOGO」欄位（M13/N13）
               寫進 current.logoName，這一格只是版型說明用的標籤
         P欄 = 案型文字，只有查表結果 needsCaption 時才讀，字數上限依 needsProduct
               決定是5字（商品+案型5字內）還是6字（純案型6字內），跟側欄 ccFl() 邏輯一致 */
    if(current && String(mVal||'').trim() === '直播間FL'){
      var variantName = row[14] !== undefined && row[14] !== null ? String(row[14]).trim() : '';
      var variantDef = flVariantMap[variantName];

      /* 版型是「不製作」就直接跳過，不用特別提醒。
         但如果版型名稱不在對照表裡（例如打成「案型6字內」，
         跟對照表M35:P39正式名稱「純案型6字內」少一個字對不起來），
         這種情況跟「不製作」在結果上一樣都是不產出FL，但成因完全不同——
         前者是使用者刻意選擇，後者是打字/選錯，不該悄悄跳過讓人以為FL
         「讀不到文案」，要跳toast講清楚是版型名稱對不上，才好debug */
      if(!variantDef){
        current.flSkip = true;
        delete current.flText;
        current.flProductSlot = 'skip'; // 讓側欄「FL ICON」下拉選單正確顯示「不製作」被選中
        if(variantName && typeof toast === 'function'){
          toast('直播間FL版型「'+variantName+'」在對照表裡找不到，已視為不製作，請確認跟對照表(M35:P39)的版型名稱完全一致', 'err', 5000);
        }
        return;
      }
      if(variantName === '不製作'){
        current.flSkip = true;
        delete current.flText;
        current.flProductSlot = 'skip';
        return;
      }
      current.flSkip = false;

      var nextRow = rows[idx+1] || [];

      /* 版型需要LOGO時，把 txt-fl 寫成「logo」這個關鍵字——
         畫布那邊（editor-utils.js 的 ccFl()、editor-logo2-canvas.js）
         判斷「現在是不是純Logo版型」的方式，就是看 txt-fl 欄位文字是不是
         剛好等於「logo」，沿用這個既有機制，不用去改下游程式碼。
         同時也把 flProductSlot 設成 'logo'，讓匯入後側欄「FL ICON」下拉選單
         正確顯示「LOGO」被選中（選單本身現在也認得這個值，見 editor.html/
         editor-utils.js 的 handleFlSlotChange()），不會停在「純文案」看起來對不上 */
      if(variantDef.needsLogo){
        current.flText = 'logo';
        current.flProductSlot = 'logo';
      }

      if(variantDef.needsProduct){
        var slotStr = nextRow[13] !== undefined && nextRow[13] !== null ? String(nextRow[13]).trim() : '';
        var slotNum = slotStr.replace(/[^123]/g,'').charAt(0);
        if(slotNum) current.flProductSlot = slotNum;
      }

      if(variantDef.needsCaption){
        var flRawP = nextRow[15];
        var flText = flRawP !== undefined && flRawP !== null ? String(flRawP).trim() : '';

        /* banwords規範（自動補$、補千分位逗號等）平常只在使用者手動輸入、
           欄位blur時才會跑（見 bn-state-plugin.js 的 applyBanwordToInput）。
           Excel匯入是直接把儲存格值寫進欄位，不會觸發blur，所以原本補上去的
           逗號完全沒被算進字數——裸數字「5000」匯入時是4個半形字=2字，
           但畫面上實際顯示、使用者手動輸入時都會變成「$5,000」（多一個$、
           一個逗號，一樣是半形符號，各算0.5字，變成3字）。這裡在判斷字數上限
           之前，先用同一套banwords引擎跑過一次，確保匯入當下算的字數，
           跟最終實際顯示出來的字數一致，不會匯入時沒超標、一顯示卻超標。 */
        if(flText && window.banwordEngine && typeof window.banwordEngine.transformText === 'function'){
          try{
            var bwResult = window.banwordEngine.transformText(flText, '文案', {});
            if(bwResult && bwResult.text !== undefined) flText = bwResult.text;
          }catch(e){}
        }

        /* 商品+案型5字內 → 上限5字；純案型6字內 → 上限6字。
           之前這裡完全沒做長度檢查，Excel填多長就整段吃進去，版位上其實是被
           畫布裁切看不出來，等於「靜默截斷」使用者卻不知道──現在改成匯入當下
           就直接裁到上限字數，並跳toast提醒，問題在匯入那一刻就看得到，不用等
           畫布上比對才發現跟工單填的不一樣。 */
        var capLimit = variantDef.needsProduct ? 5 : 6;
        if(weightedTextLen(flText) > capLimit){
          var _flTextFull = flText;
          flText = truncateToWeightedLen(flText, capLimit);
          if(typeof toast === 'function'){
            toast('直播間FL文案「'+_flTextFull+'」超過'+capLimit+'字上限，已自動截斷為「'+flText+'」', 'err', 4000);
          }
        }

        if(flText) current.flText = flText;
      }
      return;
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
        /* 指定色號：直接就是這批工單的背景顏色。過濾「無/GD/請/指定」等無效填寫，
           格式驗證與正規化交給 color-theme-engine.js，跟手動色票用同一套邏輯，
           格式不對就整格略過（不覆蓋目前背景色），不寫入半個錯誤值 */
        if(key === 'bgColor'){
          var rawColor = String(val).trim();
          if(!rawColor || ['無','GD','若','指定','請'].some(function(kw){ return rawColor.indexOf(kw) !== -1; })) return;
          var normalized = window.ColorThemeEngine && window.ColorThemeEngine.normalizeHex(rawColor);
          if(!normalized) return;
          val = normalized;
        }
        /* FL商品：只收 1/2/3，對應 product1/2/3 */
        if(key === 'flProductSlot'){
          var slot = String(val).trim();
          if('123'.indexOf(slot) === -1) return;
          val = slot;
        }
        /* 版型：Excel 常寫成「D組合(3品)」，只取開頭字母 A/B/C/D */
        if(key === 'combo'){
          var letter = String(val).trim().toUpperCase().charAt(0);
          if('ABCD'.indexOf(letter) === -1) return; // 不是合法版型代碼就略過
          val = letter;
        }
        current[key] = String(val).trim();
        /* 商品比例：只有商品1/2/3才有，值在同一列再往右一欄（O欄，index 14）。
           支援兩種填法：「70%」這種百分比字串，或「0.8」這種裸小數；
           兩種都換算成「1 = 100%＝版型預設大小」的倍率存起來。
           格式不對、或換算後超出合理範圍就不記，讓陰影套件用預設 100% */
        if(key==='product1Name' || key==='product2Name' || key==='product3Name'){
          var rawRatio = row[15]; // P欄（index 15）
          if(rawRatio !== undefined && rawRatio !== null && rawRatio !== ''){
            var ratioStr = String(rawRatio).trim();
            var hasPercent = ratioStr.indexOf('%') !== -1;
            var ratioNum = parseFloat(ratioStr);
            if(!isNaN(ratioNum)){
              /* 沒寫 % 但數字大於2，八成也是百分比寫法（例如填「80」想表示80%） */
              if(hasPercent || ratioNum > 2) ratioNum = ratioNum / 100;
              if(ratioNum > 0 && ratioNum <= 3){
                current[key.replace('Name','Ratio')] = ratioNum;
              }
            }
          }
        }
      }
    }
  });
  return groups.filter(function(g){ return Object.keys(g).length > 0; });
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

