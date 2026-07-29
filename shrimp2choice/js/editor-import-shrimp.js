'use strict';
/* ══════════════════════════════════════════════════════════════════
   editor-import-shrimp.js — 蝦殺二選一 專案匯入流程
   ----------------------------------------------------------------
   取代 editor-import.js 原本給「明星直播間」用的 confirmImport()。
   這裡改用 workorder-parser-shrimp.js 解析新格式的工單：
     - 一個分頁(sheet) = 一個檔期，裡面有多個「資料夾命名」廠商區塊
     - 一個廠商 = editor 裡一個獨立分頁(tab)，彼此的商品圖/文案/公版都分開存，
       不會因為切分頁而互相覆蓋（靠 ShadowEditor.getFullState/setFullState 整包存還）
     - 素材圖片只需要上傳「一包」資料夾（裡面有各廠商子資料夾），
       用子資料夾名稱去對應 Excel 的「資料夾命名」，資料夾裡的檔案再用
       檔名跟 Excel 填的人物/商品真實名稱做模糊比對（沿用 matchFileByAliases）

   目前先不處理「06_案型字卡」內容，版位規格定案後再加。
   ══════════════════════════════════════════════════════════════════ */

/* 把 webkitdirectory 選出來的整包檔案，依「廠商子資料夾」分組。
   webkitRelativePath 長相通常是「選取的根資料夾/廠商子資料夾/檔案.jpg」，
   如果使用者選的資料夾本身就是廠商層（沒有再多一層根資料夾），
   也一併放進 flat 備援，避免完全比對不到時開天窗。 */
function groupAssetFilesByVendorFolder(files){
  var groups = {};
  var flat = [];
  (files || []).forEach(function(f){
    var rel = f.webkitRelativePath || f.name;
    var parts = rel.split('/');
    if(parts.length >= 3){
      var vendorFolder = parts[1];
      groups[vendorFolder] = groups[vendorFolder] || [];
      groups[vendorFolder].push(f);
    } else {
      flat.push(f);
    }
  });
  return { groups: groups, flat: flat };
}

function normalizeFolderName(s){
  return String(s || '').replace(/^\d+_/, '').replace(/[\s|｜\-_]/g, '').toLowerCase();
}

/* 只取「資料夾命名」開頭的廠商名稱那一段（第一個底線/連字號/空白前的文字），
   不含後面的檔期/活動說明文字。工單常見格式是「廠商名稱_檔期或活動說明」，
   但同一個廠商，工單填的檔期文字跟實際上傳資料夾的檔期文字常常對不起來
   （例如工單寫「蝦皮特選_官方直營」，實際資料夾卻是「蝦皮特選_隔日到」）——
   這種情況下完整字串比對一定會失敗，但「廠商名稱」這一段通常還是一致的，
   當作最後一道比對的備援依據。 */
function folderCorePrefix(s){
  var noPrefix = String(s || '').replace(/^\d+_/, '');
  var seg = noPrefix.split(/[_\-\s|｜]/)[0] || '';
  return seg.toLowerCase();
}

/* 找出這個廠商對應到的那包子資料夾檔案。找不到就回傳 null，
   呼叫端會退回用整包裡沒有分類到子資料夾的檔案（flat）當備援 */
function findVendorFolderFiles(assetInfo, folderName, folderNameNoPrefix){
  var keys = Object.keys(assetInfo.groups);
  var targetA = normalizeFolderName(folderName);
  var targetB = normalizeFolderName(folderNameNoPrefix);
  for(var i=0;i<keys.length;i++){
    var norm = normalizeFolderName(keys[i]);
    if(!norm) continue;
    if(norm===targetA || norm===targetB || (targetB && (norm.indexOf(targetB)!==-1 || targetB.indexOf(norm)!==-1))){
      return assetInfo.groups[keys[i]];
    }
  }
  /* 完整字串比對不到時，退一步只比對「廠商名稱」開頭那一段——常見情況是
     工單「資料夾命名」寫的檔期/活動說明文字，跟實際上傳資料夾的不一樣
     （同一廠商不同批次填的人寫法不統一），但廠商名稱本身通常還是一致的。
     長度至少2個字才比對，避免太短的字串（例如純數字殘留）誤觸發。 */
  var coreB = folderCorePrefix(folderNameNoPrefix);
  if(coreB && coreB.length >= 2){
    for(var j=0;j<keys.length;j++){
      var coreKey = folderCorePrefix(keys[j]);
      if(coreKey && coreKey === coreB){
        console.warn('[shrimp-import] 廠商資料夾「'+keys[j]+'」跟工單「資料夾命名：'+folderNameNoPrefix+'」完整文字對不上（檔期/活動說明文字不同），改用開頭的廠商名稱「'+coreB+'」比對成功，套用這個資料夾。');
        return assetInfo.groups[keys[j]];
      }
    }
  }
  return null;
}

function processExcelFileShrimp(file, cb){
  var reader = new FileReader();
  reader.onload = function(ev){
    try{
      var wb = XLSX.read(ev.target.result, { type:'binary', cellDates:true });
      var all = window.ShrimpWorkorder.parseWorkbook(wb);
      cb(null, all);
    }catch(err){ cb(err, null); }
  };
  reader.onerror = function(){ cb(new Error('讀取檔案失敗'), null); };
  reader.readAsBinaryString(file);
}

function shrimpVendorLabel(v, i){
  return v.folderNameNoPrefix || v.folderName || ('廠商' + (i + 1));
}

/* 把 workorder-parser-shrimp.js 解析出來的案型字卡資料（layoutType/title/rows的a,b），
   轉成 card-plugin.js 讀的資料格式——差別在card-plugin.js的每個row物件還要多一個
   style欄位（用CARD_LAYOUTS依layoutType查表得到，跟06_card.html共用同一張表）。
   工單沒解析到內容的張數（例如cardCount比cards.length多，理論上不會發生但保險起見）
   用空白卡片補滿，不會讓畫面缺卡。 */
function buildCardsFromVendor(v){
  var count = Math.max(0, Math.min(4, v.cardCount || 0));
  var parsedCards = v.cards || [];
  var cards = [];
  for(var i=0;i<count;i++){
    var p = parsedCards[i];
    var layoutType = (p && p.layoutType) || 1;
    var seq = (typeof CARD_LAYOUTS !== 'undefined' && CARD_LAYOUTS[layoutType]) || [1,2,1,2,1,2];
    var rows = seq.map(function(style, idx){
      var r = p && p.rows && p.rows[idx];
      return { style: style, a: (r && r.a) || '', b: (r && r.b) || '' };
    });
    cards.push({ title: (p && p.title) || '', layoutType: layoutType, rows: rows });
  }
  return cards;
}

function pad2(n){ n = n||0; return (n<10?'0':'')+n; }

/* 依商品組合(combo)決定要比對哪些 slot，並把該廠商資料夾內的檔案
   用真實名稱(Excel目前這份範例還沒填，正式工單有填才會比對到)＋
   代號關鍵字做模糊比對，最後把整包 ShadowEditor 狀態 snapshot 回呼出去。
   全程用 enterPending()，不會中途廣播到畫布，避免多個廠商互相干擾。 */
function buildShadowSnapshotForVendor(vendorFiles, thumbInfo, thumbnailNames, cb){
  if(!window.ShadowEditor){ cb(null); return; }
  window.ShadowEditor.enterPending();
  // 每個廠商都從乾淨狀態開始比對，避免殘留上一位廠商比對到一半的東西
  window.ShadowEditor.setFullState({ combo:'C', slots:{}, slotRatios:{}, order:[], bgDataUrl:null, angle:'top' });
  var combo = (thumbInfo && thumbInfo.internalCombo) || 'C';
  window.ShadowEditor.setCombo(combo);

  // 真實名稱（工單有填才有）優先，找不到才退回代號關鍵字猜猜看，
  // 跟 editor-import.js 裡 matchAndApplyHostFiles() 對「明星直播間」專案的做法一致
  var names = thumbnailNames || {};
  var aliasesBySlot = {
    host1:    [names.host1, 'host1','主持人1','主持人','人物1','h1'],
    host2:    [names.host2, 'host2','主持人2','來賓','人物2','h2'],
    product1: [names.product1, 'product1','商品1','p1'],
    product2: [names.product2, 'product2','商品2','p2']
  };
  Object.keys(aliasesBySlot).forEach(function(k){ aliasesBySlot[k] = aliasesBySlot[k].filter(Boolean); });

  var slotIds = Object.keys(aliasesBySlot);
  if(!vendorFiles || !vendorFiles.length){
    cb(window.ShadowEditor.getFullState());
    return;
  }
  var remaining = slotIds.length;
  function done(){
    if(--remaining > 0) return;
    cb(window.ShadowEditor.getFullState());
  }
  slotIds.forEach(function(slotId){
    var f = matchFileByAliases(vendorFiles, aliasesBySlot[slotId]);
    if(f) window.ShadowEditor.setSlotFromFile(slotId, f, undefined, function(){ done(); });
    else done();
  });
}

/* 廠商 Logo（給 popup-logo2 左半邊的合成面板用）比對 + 讀成 base64
   注意：這裡要餵的是 logo2（合作方/廠商自己的Logo），不是 logo1——logo1 是固定不變的
   蝦皮直播 Logo，不該被廠商 Logo 蓋掉。存進 tab.data.logo2Raw 是「原圖」（未合成），
   跟舊版 editor-import.js 的 matchAndApplyLogoFiles() 邏輯一致：popup 開啟時看到
   S.logo2Raw 有值就會自動載入，使用者確認/調整完按「確認並套用」才會真的合成套用。
   實際工單資料夾常見結構是「廠商資料夾/品牌Logo_xxx/實際檔名.jpg」，
   檔名本身常常沒有「logo」字樣（例如「Prize_adidas官方旗艦館.jpg」「(原圖)480x360.jpg」），
   只看檔名關鍵字比對不到——所以優先看「檔案所在資料夾名稱」有沒有 Logo/商標/標誌 字樣，
   資料夾比檔名準；比對不到才退回原本的檔名關鍵字比對當備援。 */
function findVendorLogoFiles(vendorFiles){
  if(!vendorFiles || !vendorFiles.length) return [];
  var byFolder = vendorFiles.filter(function(f){
    var rel = f.webkitRelativePath || f.name;
    var parts = rel.split('/');
    var folderPath = parts.slice(0, -1).join('/'); // 去掉最後一段(檔名本身)，只看中間資料夾名稱
    return /logo|商標|標誌/i.test(folderPath);
  });
  if(byFolder.length){
    /* 有專屬Logo資料夾：裡面幾張圖片就是幾個Logo——1張＝單一logo，
       2張（或以上，保險起見只取前2張）＝共播雙logo，少數狀況才會遇到。
       目前沒有固定的「誰在左誰在右」命名規則，先依檔名排序決定初始順序，
       比對錯了使用者可以在Logo2編輯畫布裡按「左右對調」調整，不影響最終結果。 */
    var imgFiles = byFolder.filter(function(f){ return /\.(png|jpe?g|webp)$/i.test(f.name); });
    if(!imgFiles.length) imgFiles = byFolder; // 保險：萬一副檔名沒抓到，不要直接開天窗
    imgFiles = imgFiles.slice().sort(function(a,b){ return a.name.localeCompare(b.name, 'zh-Hant'); });
    return imgFiles.slice(0, 2);
  }
  // 沒有專屬Logo資料夾，退回原本的關鍵字比對，最多只會找到一張
  var single = matchFileByAliases(vendorFiles, ['logo','商標','標誌']);
  return single ? [single] : [];
}
function fileToDataUrl(file, cb){
  if(!file){ cb(null); return; }
  var reader = new FileReader();
  reader.onload = function(ev){ cb(ev.target.result); };
  reader.onerror = function(){ cb(null); };
  reader.readAsDataURL(file);
}

function confirmShrimpImport(){
  var st = _importState;
  if(!st.excelFile){ toast('請先選擇 Excel 工單', 'err'); return; }

  processExcelFileShrimp(st.excelFile, function(err, all){
    if(err){ toast('Excel 解析失敗：' + err.message, 'err'); return; }
    if(!all || !all.length){
      toast('Excel 找不到廠商資料（找不到「資料夾命名」列），請確認工單格式', 'err');
      return;
    }

    var assetInfo = groupAssetFilesByVendorFolder(st.assetFiles);

    var tabs = all.map(function(entry, i){
      var v = entry.vendor;
      var dateStr = '', timeStr = '';
      if(v.opening && v.opening.date){
        dateStr = v.opening.date.m + '/' + v.opening.date.d;
        timeStr = pad2(v.opening.date.hh) + ':' + pad2(v.opening.date.mm);
      }
      var data = {
        combo:   v.thumbnail ? v.thumbnail.internalCombo : undefined,
        main:    v.lpbnNoCTA ? v.lpbnNoCTA.main : '',
        sub:     v.lpbnCTA ? v.lpbnCTA.sub : '',
        date:    dateStr,
        time:    timeStr,
        flStyle: v.fl ? v.fl.style : '無',
        flTheme: 'A', // 工單目前沒有指定 FL 專屬公版欄位，先預設 A，可在 editor 裡逐一調整
        /* 案型字卡：工單有幾筆「06_案型字卡」列（且是否製作!==false）就自動長出幾張，
           版型/標題/六行文案都已經從工單解析出來（見 buildCardsFromVendor），不用再手動輸入。
           全部都是fault（是否製作=false）時 cardCount 會是0，交給 card-plugin.js 整組隱藏面板/畫布 */
        cardCount: Math.max(0, Math.min(4, v.cardCount || 0)),
        cards: buildCardsFromVendor(v),
        _vendor: v
      };
      return { id: 'tab-' + (i + 1), label: shrimpVendorLabel(v, i), data: data };
    });

    buildTabs(tabs);
    closePopup('import');
    toast('已建立 ' + tabs.length + ' 個廠商分頁，正在比對素材圖片…', '', 4000);

    /* 逐一（序列、非同步）幫每個分頁比對商品/主持人/Logo 圖，
       存進各自的 tab.data，確保每個分頁互相獨立 */
    var idx = 0;
    function next(){
      if(idx >= tabs.length){
        if(window.ShadowEditor) window.ShadowEditor.commit(); // 結束比對過程的暫存模式，重新廣播給所有版位——
                                                                // 這裡漏掉呼叫是原本的 bug，enterPending() 之後沒有對應的
                                                                // commit()，會讓匯入完成後所有版位 iframe 永遠收不到廣播
        applyTabData(TABS[ACTIVE_TAB], true); // 全部比對完，套回目前畫面
        toast('素材比對完成，請切換分頁檢查各廠商內容', 'ok', 3000);
        /* 這裡漏掉呼叫是原本的 bug：分頁跟素材都比對完了，卻沒有跳出「Logo2/商品陰影」
           確認 popup 讓使用者逐一檢查每個廠商。改成呼叫 startReviewFlow()（見
           editor-logo2-canvas.js），會自動找出「有商品組合或有比對到廠商Logo」的
           分頁，從第一包開始逐包跳出確認彈窗，確認完一包自動存檔切到下一包，
           不會像之前一樣只有第一包能確認、其他分頁的素材永遠沒被人工檢查過。
           純文字／完全沒素材的分頁不會出現在這個逐包確認清單裡。 */
        startReviewFlow();
        return;
      }
      var tab = tabs[idx];
      var v = tab.data._vendor;
      var vendorFiles = findVendorFolderFiles(assetInfo, v.folderName, v.folderNameNoPrefix) || assetInfo.flat;

      buildShadowSnapshotForVendor(vendorFiles, v.thumbnail, v.thumbnailNames, function(snap){
        if(snap) tab.data.shadowState = snap;
        var logoFiles = findVendorLogoFiles(vendorFiles); // 0~2張：資料夾比對到2張＝共播雙logo
        var logoFileA = logoFiles[0] || null;
        var logoFileB = logoFiles[1] || null;
        fileToDataUrl(logoFileA, function(dataUrlA){
          fileToDataUrl(logoFileB, function(dataUrlB){
            if(dataUrlA){
              // 存「原圖」進 logo2Raw，交給 popup-logo2 左半邊的合成面板做自動判斷方形/長型、
              // 吸底色、圓角；scale/offset 重置成 undefined，讓面板對這張新圖重新自動偵測，
              // 不要沿用上一個廠商調整過的數字
              tab.data.logo2Raw = dataUrlA;
              tab.data.logo2Scale = undefined;
              tab.data.logo2OffX = undefined;
              tab.data.logo2OffY = undefined;
              /* 比對到2張才是雙logo模式；只有1張的話，形狀交給面板自動判斷方形/長型
                 （跟原本單張邏輯一致，這裡不用先猜，undefined讓面板自己偵測） */
              tab.data.logo2Shape = dataUrlB ? 'double' : undefined;
              tab.data.logo2RawB = dataUrlB || null;
              tab.data.logo2ScaleB = undefined;
              tab.data.logo2OffXB = undefined;
              tab.data.logo2OffYB = undefined;
            }
            idx++;
            next();
          });
        });
      });
    }
    next();
  });
}
