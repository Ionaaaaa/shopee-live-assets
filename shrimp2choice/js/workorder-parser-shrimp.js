'use strict';
/* ══════════════════════════════════════════════════════════════════
   workorder-parser-shrimp.js — 蝦殺二選一 專案工單解析器
   ----------------------------------------------------------------
   跟舊版 editor-import.js 裡的 parseWorkorderGroups() 不是同一套：
   舊版格式是「M/N 兩欄 key-value，一份=一天」，
   這份工單是「一個分頁=一個檔期，裡面有多個廠商資料夾，
   每個廠商底下才有 縮圖/LPBN×2/開播字卡/FL/案型字卡」。

   使用方式：
     var result = ShrimpWorkorder.parseWorkbookRows(sheetRowsArray);
     // result = { comboTable, totals, vendors: [ {folderName, items:{...}} ] }

     var comboKey = ShrimpWorkorder.matchInternalCombo(flags);
     // flags = {host1,host2,product1,product2} (boolean)
     // 回傳跟 shadow-editor-plugin.js 的 COMBOS 定義（A/B/C）最吻合的那把 key

   案型字卡「是否製作」欄（H欄，row[7]）：
   工單每一列「06_案型字卡」都會帶一個 是否製作 布林值，明確填 False 表示
   這張不用做（fault），連版面都不用開──跟其他版位不一樣，其他版位就算
   是否製作=False 目前也還沒處理，先只處理案型字卡這個明確的需求。
   ══════════════════════════════════════════════════════════════════ */

(function (global) {

  // 跟 shadow-editor-plugin.js 的 COMBOS 保持同一份定義，用來把 Excel 動態組合表
  // 換算成正確的內部 combo key（A/B/C），不管 Excel 那邊怎麼命名/排序。
  // （2026-07：C組合這個專案實際上永遠只會用到2品，商品3從沒被用過，
  //   直接把product3這個代號整個拿掉，跟 shadow-editor-plugin.js 同步。）
  var INTERNAL_COMBO_SLOTS = {
    A: { host1: true,  host2: true,  product1: false, product2: false }, // 2人
    B: { host1: true,  host2: false, product1: true,  product2: true  }, // 1人+2品
    C: { host1: false, host2: false, product1: true,  product2: true  }  // 2品
  };

  function flagsEqual(a, b){
    return !!a.host1===!!b.host1 && !!a.host2===!!b.host2 &&
           !!a.product1===!!b.product1 && !!a.product2===!!b.product2;
  }

  /* 給定 {host1,host2,product1,product2} 布林旗標，找出吻合的內部 combo key。
     找不到完全吻合的就回傳 null（呼叫端要自己決定 fallback，例如維持目前選擇不變）。 */
  function matchInternalCombo(flags){
    var keys = Object.keys(INTERNAL_COMBO_SLOTS);
    for(var i=0;i<keys.length;i++){
      if(flagsEqual(INTERNAL_COMBO_SLOTS[keys[i]], flags)) return keys[i];
    }
    return null;
  }

  /* 把 Excel combo 的自然語言標籤（如「C組合(1人+2品)」)換成布林旗標，
     用括號裡的說明文字判斷，而不是取開頭字母──避免廠商自己把 A/B/C 命名改掉時解析壞掉。
     判斷規則：出現「2人」→host1+host2；「1人」→host1；「N品」→開前 N 個 product 欄位
     （最多只有2個product欄位，N超過2也只會開到product2）。
     如果連這個都判斷不出來，才退回去讀 comboTable 裡實際的人物1/人物2/商品1/2 布林值
     （這才是最準的來源，語言判斷只是給人看標籤用的備援)。 */
  function labelToFlags(label){
    var s = String(label||'');
    var personCount = 0;
    var m = s.match(/(\d)\s*人/);
    if(m) personCount = parseInt(m[1],10);
    var prodCount = 0;
    var m2 = s.match(/(\d)\s*品/);
    if(m2) prodCount = parseInt(m2[1],10);
    return {
      host1: personCount>=1, host2: personCount>=2,
      product1: prodCount>=1, product2: prodCount>=2
    };
  }

  /* 從整張 sheet 的 rows(header:1 陣列) 找出「版型/人物1/人物2/商品1/商品2」對照表
     位置不固定，用表頭字串去掃，不用寫死行號 */
  function extractComboTable(rows){
    var headerRow = -1;
    for(var r=0;r<rows.length;r++){
      var row = rows[r];
      if(row && (row[11]==='版型' || row[11]==='商品組合') && row[12]==='人物1'){ headerRow = r; break; }
    }
    if(headerRow<0) return [];
    var table = [];
    for(var r2=headerRow+1;r2<rows.length;r2++){
      var row2 = rows[r2];
      if(!row2 || row2[11]==null || row2[11]==='') break;
      var flags = {
        host1: !!row2[12], host2: !!row2[13],
        product1: !!row2[14], product2: !!row2[15]
      };
      table.push({ label: String(row2[11]).trim(), flags: flags, internalCombo: matchInternalCombo(flags) });
    }
    return table;
  }

  /* 總製作內容（各版位總數量，跨所有廠商加總，僅供對帳/顯示用） */
  function extractTotals(rows){
    for(var r=0;r<rows.length;r++){
      var row = rows[r];
      if(row && row[0]==='總製作內容'){
        var headers = row;
        var countRow = rows[r+1] || [];
        var totals = {};
        headers.forEach(function(h,ci){ if(ci>0 && h!=null) totals[h] = countRow[ci]; });
        return totals;
      }
    }
    return null;
  }

  function excelDateToParts(v){
    if(v==null) return null;
    if(v instanceof Date && !isNaN(v)){
      return { m:v.getMonth()+1, d:v.getDate(), hh:v.getHours(), mm:v.getMinutes() };
    }
    if(typeof v === 'number' && v>40000){
      var dt = new Date(Math.round((v-25569)*86400*1000));
      return { m:dt.getUTCMonth()+1, d:dt.getUTCDate(), hh:dt.getUTCHours(), mm:dt.getUTCMinutes() };
    }
    var s = String(v).trim();
    var mm = s.match(/(\d{1,2})[\/-](\d{1,2})/);
    if(mm) return { m:parseInt(mm[1],10), d:parseInt(mm[2],10), hh:12, mm2:0 };
    return null;
  }

  /* 找出所有「資料夾命名：xxx」開頭的列＝一個廠商區塊的起點，
     切出每個廠商區塊內的品項（01_直播時縮圖 ... 06_案型字卡） */
  function extractVendors(rows, comboTable){
    var startIdxs = [];
    rows.forEach(function(row,r){
      if(row && typeof row[0]==='string' && row[0].indexOf('資料夾命名')===0) startIdxs.push(r);
    });

    var vendors = [];
    startIdxs.forEach(function(startR, vi){
      var endR = startIdxs[vi+1]!==undefined ? startIdxs[vi+1] : rows.length;
      var raw = rows[startR][0];
      var folderName = (raw.split(/[：:]/)[1] || '').trim();
      // 去掉開頭編號「01_」，比對資料夾時用純名稱（編號可能跟上傳的資料夾不一致）
      var folderNameNoPrefix = folderName.replace(/^\d+_/, '');

      var vendor = {
        folderName: folderName,
        folderNameNoPrefix: folderNameNoPrefix,
        thumbnail: null,   // { comboLabel, internalCombo }
        thumbnailNames: {}, // { host1, host2, product1, product2 } 真實名稱，工單有填才會有值
        lpbnNoCTA: null,   // { main }
        lpbnCTA: null,     // { sub }
        opening: null,     // { date:{m,d,hh,mm} }
        fl: null,          // { style: 'LOGO'|'無'|'案型' }
        cardCount: 0,      // 案型字卡張數
        cards: []          // 每張卡 { layoutType, title, rows:[{a,b}, ...最多6格] }，跟cardCount同步長出來
      };

      // 中文數字→阿拉伯數字，「第一行」～「第六行」解析用
      var CN_NUM = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6};

      // 這幾個字串是「圖例/欄位說明」本身，不是真的名稱，出現在 legend 列時要濾掉
      var LEGEND_LABELS = {'人物1':1,'人物2':1,'商品1':1,'商品2':1,'無':1,'logo':1,'案型':1};

      var currentKey = null;
      var currentCard = null; // 目前正在填哪一張案型字卡（每遇到一個新的「06_案型字卡」列就換下一張）
      // 案型字卡欄位如果長得像「小標文案（15字內）」「接續文案（9字內）」這種提示文字，
      // 是公版模板本身的欄位說明，不是工單真的填的內容——這種情況當作沒填，留空
      function isCardPlaceholder(s){
        return /\d+字內[）)]\s*$/.test(String(s||'').trim());
      }
      for(var r=startR+1;r<endR;r++){
        var row = rows[r];
        if(!row) continue;
        var fname = row[0];
        if(fname && typeof fname==='string' && /^\d\d_/.test(fname.trim())){
          currentKey = fname.trim();
          if(currentKey.indexOf('06_案型字卡')===0){
            // H欄「是否製作」：明確是 false 才算 fault，沒填(null/undefined)或true都當作要做，
            // 避免工單漏填時被誤判成不用做
            var cardIsFault = (row[7] === false);
            if(cardIsFault){
              currentCard = null; // fault：不計入張數、不建卡，下面第一行~第六行/標題/版型都跳過不解析
            } else {
              vendor.cardCount++;
              currentCard = { layoutType: 1, title: '', rows: [null,null,null,null,null,null] };
              vendor.cards.push(currentCard);
            }
          }
          // 注意：不能在這裡 continue —— 檔名跟第一組 內容/值 常常在同一列（例如
          // 「01_直播時縮圖」那列，col E/F 就是「商品組合／C組合(1人+2品)」），
          // 直接 continue 會把同一列的內容值跳過，thumbnail/main/sub/date/fl 全部抓不到。
        }
        if(!currentKey || row[4]==null || row[4]==='') continue;
        var label = String(row[4]).trim();
        var value = row[5];

        if(currentKey.indexOf('01_直播時縮圖')===0){
          if(label==='商品組合' && !vendor.thumbnail){
            var flags = labelToFlags(value);
            // 優先用 comboTable 裡實際登記的布林值（更準），語言判斷當備援
            var tableHit = comboTable.filter(function(c){ return c.label===String(value).trim(); })[0];
            if(tableHit) flags = tableHit.flags;
            vendor.thumbnail = { comboLabel: String(value).trim(), flags: flags, internalCombo: matchInternalCombo(flags) };

            /* 公版格式「商品組合」列下面固定接兩列：
                 +1 列＝欄名列（人物1/人物2...這種固定字樣，不管實際選的是不是人物，欄名文字都不會變，純粹佔位，略過不用）
                 +2 列＝真正的姓名/檔名，用目前 combo 啟用了哪幾個 slot（host1/host2/product1/product2）
                        依序對到 E/F 欄（最多2格）
               「商品比例」列在再下一列（+3），數字/百分比不是名稱，一般不會誤觸下面的 nameSlotMap 判斷，不用特別跳過。 */
            var SLOT_ORDER = ['host1','host2','product1','product2'];
            var activeSlots = SLOT_ORDER.filter(function(k){ return flags[k]; });
            var valuesRow = rows[r+2];
            if(valuesRow){
              activeSlots.forEach(function(slotKey, si){
                var v = valuesRow[4+si];
                if(v!=null && String(v).trim()!=='' && !LEGEND_LABELS[String(v).trim()]){
                  vendor.thumbnailNames[slotKey] = String(v).trim();
                }
              });
            }
          }
          // 備援：少數工單仍是「同一列 label 在E、value 在F」的舊寫法（例如 label==='人物1'、value=真實姓名），
          // 圖例列本身長相是 label==='人物1' 且 value==='人物2'（兩格都是欄名，不是真的名字），LEGEND_LABELS 會濾掉
          var nameSlotMap = { '人物1':'host1', '人物2':'host2', '商品1':'product1', '商品2':'product2' };
          if(nameSlotMap[label] && value!=null && !LEGEND_LABELS[String(value).trim()] && !vendor.thumbnailNames[nameSlotMap[label]]){
            vendor.thumbnailNames[nameSlotMap[label]] = String(value).trim();
          }
        }
        if(currentKey.indexOf('02_直播大廳LPBN')===0 && label==='主標' && !vendor.lpbnNoCTA){
          vendor.lpbnNoCTA = { main: String(value).trim() };
        }
        if(currentKey.indexOf('03_直播大廳LPBN')===0 && label==='副標' && !vendor.lpbnCTA){
          vendor.lpbnCTA = { sub: String(value).trim() };
        }
        if(currentKey.indexOf('04_開播字卡')===0 && label==='日期' && !vendor.opening){
          vendor.opening = { date: excelDateToParts(value) };
        }
        if(currentKey.indexOf('05_直播間FL')===0 && label==='版型' && !vendor.fl){
          var v2 = String(value).trim();
          if(v2==='LOGO' || v2==='無' || v2==='案型') vendor.fl = { style: v2 };
        }
        if(currentKey.indexOf('06_案型字卡')===0 && currentCard){
          if(label==='版型'){
            // 值長相是「版型3」這種文字，只取數字部分；公版目前只有版型1~4，
            // 抓不到數字或超出範圍就維持預設的1，不讓解析結果變成undefined
            var mLayout = String(value||'').match(/(\d)/);
            var layoutNum = mLayout ? parseInt(mLayout[1],10) : 1;
            currentCard.layoutType = (layoutNum>=1 && layoutNum<=4) ? layoutNum : 1;
          } else if(label.indexOf('標題')===0){
            var titleVal = value!=null ? String(value).trim() : '';
            currentCard.title = isCardPlaceholder(titleVal) ? '' : titleVal;
          } else {
            var mRow = label.match(/^第(.)行$/);
            var rowIdx = mRow ? CN_NUM[mRow[1]] : null;
            if(rowIdx){
              // 樣式3/4是「小標/內文 + 接續文案/小字」兩欄並排，工單就對應把兩個值分開填在
              // 同一列的F欄(a)、G欄(b)；樣式1/2/5只有一欄，b欄工單通常沒填，留空即可
              var aVal = value!=null ? String(value).trim() : '';
              var bVal = row[6]!=null ? String(row[6]).trim() : '';
              currentCard.rows[rowIdx-1] = {
                a: isCardPlaceholder(aVal) ? '' : aVal,
                b: isCardPlaceholder(bVal) ? '' : bVal
              };
            }
          }
        }
      }
      vendors.push(vendor);
    });
    return vendors;
  }

  function parseWorkbookRows(rows){
    var comboTable = extractComboTable(rows);
    var totals = extractTotals(rows);
    var vendors = extractVendors(rows, comboTable);
    return { comboTable: comboTable, totals: totals, vendors: vendors };
  }

  /* 解析整份活頁簿（可能好幾個分頁=好幾個檔期），每個分頁各自跑一次，結果攤平成一個陣列，
     每筆多加 sheetName 方便分頁標籤顯示 */
  function parseWorkbook(wb){
    var all = [];
    /* 隱藏工作表（Hidden===1）或極隱藏工作表（Hidden===2）跳過不解析：
       常見情況是使用者複製上一檔期的分頁當草稿/備份後把它隱藏起來，
       但只要「資料夾命名」列格式沒清掉，還是會被當成一個廠商解析出來，
       造成「匯入N包卻多跑出重複的N包」（重複出來的那幾包因為是草稿，
       商品組合/文案欄位通常沒填齊，只有素材資料夾還在→ 比對出來變成
       「只有Logo」的空包，這正是這個防呆要擋下的情境）。 */
    var sheetMeta = (wb.Workbook && wb.Workbook.Sheets) || [];
    wb.SheetNames.forEach(function(sheetName, si){
      var meta = sheetMeta[si];
      if(meta && meta.Hidden) return; // Hidden: 1=隱藏, 2=極隱藏, 0/undefined=可見
      var ws = wb.Sheets[sheetName];
      var rows = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:null });
      var r = parseWorkbookRows(rows);
      if(r.vendors.length){
        r.vendors.forEach(function(v){ v.sheetName = sheetName; });
        all = all.concat(r.vendors.map(function(v){ return { vendor:v, comboTable:r.comboTable, totals:r.totals }; }));
      }
    });
    return all;
  }

  global.ShrimpWorkorder = {
    parseWorkbookRows: parseWorkbookRows,
    parseWorkbook: parseWorkbook,
    matchInternalCombo: matchInternalCombo,
    labelToFlags: labelToFlags,
    INTERNAL_COMBO_SLOTS: INTERNAL_COMBO_SLOTS
  };

})(window);
