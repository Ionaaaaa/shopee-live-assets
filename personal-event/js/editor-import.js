'use strict';

/* ── 匯入工單 popup：Excel + Logo資料夾 + 主持人/商品資料夾，選完按「確認匯入」才一次處理 ── */
var _importState = { excelFile:null, assetFiles:[] };

function openImportModal(){
  _importState = { excelFile:null, assetFiles:[] };
  resetImportZoneText('import-zone-excel', '點擊或拖曳檔案到此上傳 Excel 工單', '支援 .xlsx 格式');
  resetImportZoneText('import-zone-assets', '點擊或拖曳資料夾到此上傳素材（Logo＋主持人／商品，可選）', 'Logo、主持人、商品圖可放同一個資料夾，依檔名自動比對');
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
    applyExcelFile(e.target.files[0]);
  } else if(kind === 'assets'){
    applyAssetFiles(Array.prototype.slice.call(e.target.files));
  }
}

/* 套用選到的 Excel 檔案，點擊選檔／拖曳放檔共用同一套邏輯，
   確保兩種操作方式選出來的結果、UI狀態完全一致。 */
function applyExcelFile(file){
  _importState.excelFile = file || null;
  if(file){
    resetImportZoneText('import-zone-excel', '已選擇：'+file.name, '點擊可重新選擇');
    document.getElementById('import-zone-excel').classList.add('done');
  }
}

/* 套用選到的素材圖片清單（只留 png/jpg/jpeg/webp），點擊選資料夾／拖曳丟資料夾
   共用同一套邏輯，跟 applyExcelFile 同樣的理由。silent參數＝true時，篩選後
   結果是0張圖片也不跳錯誤toast（點擊選資料夾原本就是這樣，選到空資料夾不用
   特別提示；拖曳丟資料夾則會在呼叫這裡之前就先擋掉0張的情況，各自的錯誤
   訊息文案不一樣，所以不放在這裡統一跳）。 */
function applyAssetFiles(files){
  files = (files || []).filter(function(f){ return /\.(png|jpe?g|webp)$/i.test(f.name); });
  _importState.assetFiles = files;
  if(files.length){
    resetImportZoneText('import-zone-assets', '已選擇 '+files.length+' 個圖片檔案', '點擊可重新選擇資料夾');
    document.getElementById('import-zone-assets').classList.add('done');
  }
  return files.length;
}

/* ── 拖曳上傳：Excel 工單 + 素材資料夾 ──
   兩個 dropzone 各自綁定 dragenter/dragover/dragleave/drop，跟點擊選檔案
   共用 applyExcelFile()／applyAssetFiles()，匯入結果、UI狀態完全一致。 */
(function(){
  function setupDropzone(zoneId, onFiles){
    var zone = document.getElementById(zoneId);
    if(!zone) return;

    function setDragging(on){
      zone.classList.toggle('dragging', !!on);
    }

    ['dragenter','dragover'].forEach(function(evt){
      zone.addEventListener(evt, function(e){
        e.preventDefault(); e.stopPropagation();
        setDragging(true);
      });
    });
    ['dragleave','dragend'].forEach(function(evt){
      zone.addEventListener(evt, function(e){
        e.preventDefault(); e.stopPropagation();
        setDragging(false);
      });
    });
    zone.addEventListener('drop', function(e){
      e.preventDefault(); e.stopPropagation();
      setDragging(false);
      onFiles(e.dataTransfer);
    });

    /* 避免使用者沒對準框、拖到頁面其他地方時瀏覽器直接開啟/下載檔案 */
    ['dragover','drop'].forEach(function(evt){
      document.addEventListener(evt, function(e){
        if(e.target && zone.contains(e.target)) return;
        e.preventDefault();
      });
    });
  }

  setupDropzone('import-zone-excel', function(dataTransfer){
    var file = dataTransfer.files && dataTransfer.files[0];
    if(!file) return;
    if(!/\.xlsx$/i.test(file.name)){
      toast('請拖曳 .xlsx 格式的工單檔案','err');
      return;
    }
    applyExcelFile(file);
  });

  setupDropzone('import-zone-assets', function(dataTransfer){
    try{
      /* 逐一收集每個項目的 FileSystemEntry。之前的寫法只檢查 items[0] 是不是
         file-kind、來決定整批走「entry API」還是「退回 dataTransfer.files」，
         但拖曳資料進來時第0個項目不一定是檔案本身（例如作業系統/瀏覽器會
         多附一份 text/uri-list 之類的資料排在前面），只看第0項會誤判整批都
         不支援entry API、白白放棄能正確讀到資料夾內容的路徑，導致「拖資料夾
         進來完全沒反應」。改成不管第幾項，每一項各自檢查、各自嘗試取得
         entry，才不會被排序影響。 */
      var items = dataTransfer.items;
      var entries = [];
      if(items){
        for(var i=0;i<items.length;i++){
          var it = items[i];
          var entry = (it && typeof it.webkitGetAsEntry === 'function') ? it.webkitGetAsEntry() : null;
          if(entry) entries.push(entry);
        }
      }
      /* 診斷用：拖曳失敗時第一手判斷卡在哪一段（items有幾項、認得幾個entry、
         dataTransfer.files有幾個）。看到 entries=0 就是瀏覽器沒給資料夾結構，
         看到 entries>0 但最後檔案數是0，就是資料夾裡真的沒有符合的圖片副檔名。 */
      console.log('[素材拖曳] items:', items ? items.length : 0,
                  '／ 可讀取的 entry:', entries.length,
                  '／ dataTransfer.files:', dataTransfer.files ? dataTransfer.files.length : 0);

      if(entries.length){
        /* 拿得到至少一個 entry：用遞迴讀法把資料夾（含子資料夾）裡所有檔案都
           展開出來，這是唯一能讀到「資料夾裡面」內容的路徑——
           dataTransfer.files 對資料夾本身沒有巢狀結構可讀。 */
        var collected = [];
        var remaining = entries.length;
        entries.forEach(function(entry){
          readEntryFilesRecursive(entry, collected, function(){
            remaining--;
            if(remaining === 0){
              var n = applyAssetFiles(collected);
              console.log('[素材拖曳] 讀完，共讀到', collected.length, '個檔案，其中符合圖片副檔名的有', n, '個');
              if(!n) toast('資料夾內找不到圖片檔案（.png/.jpg/.webp）','err');
              else toast('已讀取 '+n+' 張素材圖片','ok');
            }
          });
        });
      } else {
        /* 整批都拿不到 entry（瀏覽器不支援，或拖曳來源本來就不是檔案系統
           項目）：退回只吃 dataTransfer.files 第一層，至少不會完全沒反應；
           對「拖整個資料夾」這個瀏覽器來說如果完全不支援entry API，
           dataTransfer.files 通常也讀不到內容，這裡明確提示使用者改用點擊
           選資料夾（那條路徑用 <input webkitdirectory> 相容性更好）。 */
        var files = dataTransfer.files ? Array.prototype.slice.call(dataTransfer.files) : [];
        var n2 = applyAssetFiles(files);
        if(!n2) toast('這個瀏覽器不支援拖曳資料夾，請改用「點擊」選擇資料夾','err');
      }
    } catch(err){
      console.error('[import-zone-assets drop] 讀取拖曳的檔案/資料夾時發生例外', err);
      toast('讀取拖曳的資料夾時發生錯誤，請改用點擊選擇資料夾','err');
    }
  });
})();

/* 遞迴讀出 FileSystemEntry（檔案或資料夾）底下所有的 File 物件，塞進 out 陣列，
   全部讀完（包含子資料夾）才呼叫 done()。資料夾用 createReader().readEntries()
   讀取，瀏覽器可能分批回傳，要連續呼叫讀到回傳空陣列為止才算讀完整層。 */
function readEntryFilesRecursive(entry, out, done){
  /* 這裡的 file()／readEntries() 都是瀏覽器原生非同步callback，不是Promise，
     外層的 try/catch（setupDropzone 的 onFiles）包不到這裡面——任何一個
     子項目讀取途中出錯，都要自己接住並呼叫 done()，不然單一壞掉的檔案/
     資料夾會讓整批 remaining 計數卡住，永遠不會觸發 applyAssetFiles()，
     使用者只會看到「拖了資料夾進去卻完全沒反應」。 */
  if(!entry){ done(); return; }
  try{
    if(entry.isFile){
      entry.file(function(file){
        /* 關鍵：補上「這個檔案在資料夾裡的完整路徑」。
           點擊選資料夾（<input webkitdirectory>）時，瀏覽器會自動幫每個 File 附上
           webkitRelativePath（例如「素材包/0613_HONG JIN 宏晉/logo1.png」），
           下面 scopeFilesToVendor() 就是靠這個路徑把候選檔案縮小到「這包廠商自己的
           子資料夾」，避免不同廠商之間用通用關鍵字（商品1/商品2…）互相誤配對。
           但拖曳進來、改用 FileSystemEntry API 讀出來的 File，webkitRelativePath
           是空字串——路徑資訊整個消失，廠商縮小範圍失效，於是每一包都在「全部檔案」
           裡用通用關鍵字亂配，結果就是 logo 配錯、商品圖抓不到。
           webkitRelativePath 是唯讀的，不能直接寫入，所以改附掛一個自訂欄位
           _bnPath，scopeFilesToVendor() 那邊會一併讀取，兩種上傳方式行為就一致了。 */
        try{ file._bnPath = entry.fullPath || ''; }catch(e){}
        out.push(file);
        done();
      }, function(err){
        console.error('[readEntryFilesRecursive] 讀取檔案失敗，略過', entry.fullPath, err);
        done();
      });
      return;
    }
    if(entry.isDirectory){
      var reader = entry.createReader();
      var pending = 0, finishedListing = false;
      function checkAllDone(){
        if(finishedListing && pending === 0) done();
      }
      function readBatch(){
        reader.readEntries(function(children){
          if(!children.length){
            finishedListing = true;
            checkAllDone();
            return;
          }
          pending += children.length;
          children.forEach(function(child){
            readEntryFilesRecursive(child, out, function(){
              pending--;
              checkAllDone();
            });
          });
          readBatch(); // 繼續讀下一批，直到 readEntries 回傳空陣列
        }, function(err){
          console.error('[readEntryFilesRecursive] 讀取資料夾內容失敗，以已讀到的檔案為準', entry.fullPath, err);
          finishedListing = true;
          checkAllDone();
        });
      }
      readBatch();
      return;
    }
  } catch(err){
    console.error('[readEntryFilesRecursive] 例外，略過此項目', err);
    done();
    return;
  }
  done();
}

/* 依「別名關鍵字」在一堆 File 裡找最匹配的一個。
   雙向模糊比對：檔名包含關鍵字、或關鍵字包含檔名，任一成立就算配對成功
   （因為 Excel 有時填「主持人Nia」這種帶前綴的字，檔名可能只有「Nia」；
     商品名有時是「提姆·鄧肯和馬刺王朝」這種長描述，檔名可能只取關鍵字） */
function matchFileByAliases(files, aliases, exclude){
  if(!files || !files.length) return null;
  for(var i=0;i<files.length;i++){
    if(exclude && exclude.indexOf(files[i]) !== -1) continue; // 已經被同一輪別的插槽用掉，不能再搶
    var base = files[i].name.replace(/\.[^.]+$/,'').toLowerCase();
    for(var j=0;j<aliases.length;j++){
      var a = (aliases[j]||'').toLowerCase().trim();
      if(!a) continue;
      if(base.indexOf(a) !== -1 || (a.length>=2 && a.indexOf(base)!==-1)) return files[i];
    }
  }
  return null;
}

/* 精準比對：去掉副檔名、不分大小寫完全相等才算數，不吃部分比對。
   永遠比部分比對優先、也最不容易誤配，尤其是「xxx」「xxx (1)」「xxx (2)」
   這種一個名字是另一個前綴的連續命名，部分比對（base.indexOf(a)）會讓
   短的那個（不帶編號的「xxx」）意外命中長的那個（帶編號的檔案），這裡
   優先做一輪精準比對可以避開這個問題——「xxx (1).png」的精準比對只會
   對到 Excel 品名剛好整串等於「xxx (1)」的那個欄位，不會被短的「xxx」搶走。 */
function matchFileExact(files, name, exclude){
  if(!files || !files.length || !name) return null;
  var target = String(name).toLowerCase().trim();
  if(!target) return null;
  for(var i=0;i<files.length;i++){
    if(exclude && exclude.indexOf(files[i]) !== -1) continue;
    var base = files[i].name.replace(/\.[^.]+$/,'').toLowerCase().trim();
    if(base === target) return files[i];
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

/* 縮小比對範圍到「這個廠商自己的子資料夾」：使用者上傳素材時常常照廠商/日期
   分子資料夾（例如「0613_HONG JIN 宏晉｜3C資訊廣場/」），資料夾名稱裡通常
   就帶著這包的LOGO廠商名稱。如果先把候選檔案縮小到「路徑裡有出現這個廠商
   名稱」的子集合，SHADOW_SLOT_ALIASES 那組「商品1／商品2／商品3」這種通用
   備援關鍵字才不會誤比對到别包剛好也符合同一組通用關鍵字的檔案——
   例如同一次匯入裡兩包都只填了2個商品、第3格都留著沒清的範例文字，
   縮小範圍後兩包各自只會在自己的資料夾裡找，不會互相打架。
   縮小後如果整個子集合是空的（例如使用者上傳的是攤平資料夾、沒有分子資料夾，
   或資料夾命名剛好沒帶到這個廠商名稱），就直接退回整個檔案清單，維持原本
   「全部檔案一起比對」的行為，不會因為縮小失敗而反而找不到檔案。 */
function scopeFilesToVendor(files, hint){
  if(!hint) return files;
  var h = String(hint).toLowerCase().trim();
  if(!h) return files;
  var scoped = files.filter(function(f){
    /* webkitRelativePath：點擊選資料夾時瀏覽器自動附上的相對路徑；
       _bnPath：拖曳資料夾時由 readEntryFilesRecursive() 補上的完整路徑
       （拖曳進來的 File 沒有 webkitRelativePath，少了它廠商縮小範圍會整個失效，
        導致不同廠商的素材互相配錯，見該處註解）。兩種上傳方式取到的路徑
       格式雖然一個有開頭斜線、一個沒有，但這裡只做 indexOf 子字串比對，不影響。 */
    var p = ((f.webkitRelativePath || f._bnPath || f.name || '')).toLowerCase();
    return p.indexOf(h) !== -1;
  });
  return scoped.length ? scoped : files;
}

/* 素材資料夾（Logo＋主持人＋商品都在同一包裡）：優先用 Excel 實際填的姓名/品名比對，
   找不到才退回版位代號（host1/商品1...）當關鍵字猜猜看。
   呼叫前必須先 window.ShadowEditor.setCombo() 決定好版型，再比對填格子，避免版型還沒切換、
   格子先被填入時因為目前顯示的版型不對而「看起來沒偵測到」 */
function matchAndApplyHostFiles(files, g, cb){
  g = g || {};
  if(!files || !files.length){ if(cb) cb(0); return 0; }

  /* 先縮小到這包自己的廠商子資料夾（見 scopeFilesToVendor 說明），
     縮小失敗（沒有分子資料夾、或資料夾名稱沒帶到廠商名）就用回全部檔案，
     這一行以下的比對邏輯完全不用跟著改，兩種情況共用同一套比對規則。 */
  var filesForThisGroup = scopeFilesToVendor(files, g.logoName || g.host1Name);

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

  var tasks = [];
  if(window.ShadowEditor){
    var slotIds = Object.keys(SHADOW_SLOT_ALIASES);
    var claimed = []; // 這一輪已經被別的插槽用掉的檔案，避免同一個檔案同時配給兩個插槽
    var matchedInFirstRound = {}; // slotId -> 第一輪精準比對到的檔案

    /* 第一輪：只做「精準比對」（Excel品名/姓名去頭尾空白、不分大小寫，完全等於
       檔名去掉副檔名），全部插槽先搶一輪。精準比對不會有「短字串是另一個檔名
       前綴」這種誤配問題（例如 Excel 品名是「xxx」，檔案是「xxx (1).png」跟
       「xxx.png」兩個都存在時，精準比對只會對到真的完全同名的那個），所以
       一定要比部分比對優先處理、搶先把最有把握的配對定下來。 */
    slotIds.forEach(function(slotId){
      var name = excelNameBySlot[slotId];
      if(!name) return;
      var f = matchFileExact(filesForThisGroup, name, claimed);
      if(f){ claimed.push(f); matchedInFirstRound[slotId] = f; }
    });

    /* 第二輪：還沒配到檔案的插槽，才退回「部分比對」。
       個人專場（g.level有值，A/B級批次比對）跟舊格式（單張匯入）分開處理：
       個人專場素材是照「品名/廠商」整理，不是照「插槽位置」整理，這裡只用
       Excel實際填的品名/姓名做部分比對，不退回 product1/商品1/p1 這種
       通用位置關鍵字——通用關鍵字很容易跨包誤配到「別包」剛好也符合
       同一組泛用檔名的檔案（scopeFilesToVendor 縮小到廠商子資料夾失敗、
       退回全部檔案一起比對時尤其容易發生）。這包Excel沒填這個商品/人物
       的名字，就代表這包本來沒有它，直接留空，不用再猜。
       舊格式（沒有level標記，單張匯入慣用檔名慣例）維持原本退回通用
       關鍵字猜測的行為，不受影響。 */
    slotIds.forEach(function(slotId){
      var chosen = matchedInFirstRound[slotId];
      if(!chosen){
        var hasExplicitName = !!excelNameBySlot[slotId];
        if(g.level){
          if(hasExplicitName){
            chosen = matchFileByAliases(filesForThisGroup, [excelNameBySlot[slotId]], claimed);
            if(chosen) claimed.push(chosen);
          }
        } else {
          var aliases = [];
          if(hasExplicitName) aliases.push(excelNameBySlot[slotId]);
          aliases = aliases.concat(SHADOW_SLOT_ALIASES[slotId]);
          chosen = matchFileByAliases(filesForThisGroup, aliases, claimed);
          if(chosen) claimed.push(chosen);
        }
      }
      if(chosen) tasks.push({ slotId: slotId, file: chosen, ratio: ratioBySlot[slotId] });
    });
  }

  /* 注意：這裡「不」再額外把主持人單張人像照直接塞進「主持人」圖層了──
     那張圖層現在保留給陰影編輯 popup 匯出的商品+陰影合成圖使用，
     避免同一個人同時出現「直接匯入的原圖」和「陰影套件疊出來的版本」兩張。 */

  if(!cb){
    /* 沒有人要等完成時機（舊有呼叫端的行為）：照舊同步觸發，立即回傳比對到的數量。
       setSlotFromFile 內部讀檔仍是非同步，這裡沒有等它讀完，畫面會晚一點才真的顯示圖片，
       但這是原本就有的行為，維持不變，不影響既有流程。 */
    tasks.forEach(function(t){ window.ShadowEditor.setSlotFromFile(t.slotId, t.file, t.ratio); });
    return tasks.length;
  }

  /* 有人要等完成時機（批次比對用）：等「每一個」比對到的插槽都真的讀檔完成
     （FileReader onload 觸發過）才呼叫 cb，不用猜測固定要等多久，大檔案、
     小檔案都準確，這是之前用固定延遲時序不穩的根本解法。 */
  if(!tasks.length){ cb(0); return 0; }
  var pending = tasks.length, matched = 0;
  tasks.forEach(function(t){
    window.ShadowEditor.setSlotFromFile(t.slotId, t.file, t.ratio, function(ok){
      if(ok) matched++;
      pending--;
      if(pending === 0) cb(matched);
    });
  });
  return tasks.length;
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

/* ── 「個人專場」公版工單解析（A級專場／B級專場左右雙區塊格式）──
   跟 parseWorkorderGroups() 那套「款式」開頭、單一欄位表的舊格式完全不同，
   這裡是同一張表左半邊(A~L欄)放A級專場、右半邊(N~Y欄)放B級專場，
   用 A欄/N欄出現「資料夾命名：A級專場」「資料夾命名：B級專場」字樣當區塊起點，
   自動判斷，不寫死列號──表格上面/下面增減列都不用改程式碼。
   只認得到這兩個標記字樣的表才會走這條路，抓不到就回傳 null，
   讓 processExcelFile 退回原本的 parseWorkorderGroups()，不影響其他舊格式工單。 */
/* Excel「商品組合」欄位的字母，跟畫布內部 ShadowEditor 的組合字母（見
   js/shadow-editor-plugin.js 的 COMBOS）現在意義完全一致，不用再轉換字母：
     A組合(2人)／B組合(1人+2品)／C組合(3品)
   （2026-07 更新：內部原本多一組「2人+1品」，Excel從來沒有選項對應到它，
   已經刪掉，字母跟著往前遞補，現在跟Excel直接一致。這裡繼續用「看文字裡
   實際的人物/商品組成」去對應、不寫死字母比對，是為了保留彈性——之後
   Excel欄位文字如果換句話說（例如「雙人」而不是「2人」），只要調整這裡的
   關鍵字判斷就好，不用去改字母對照表；如果偵測到未知的組成（例如混進了
   已經刪掉的「2人+1品」），回傳空字串，交由畫布維持目前版型，不要硬套錯的。 */
function mapExcelComboToShadowCombo(comboRaw){
  var s = String(comboRaw || '');
  var hasHost2 = s.indexOf('2人') !== -1;
  var hasHost1Only = !hasHost2 && s.indexOf('1人') !== -1;
  var productCount = 0;
  var m = s.match(/(\d)品/);
  if(m) productCount = parseInt(m[1], 10);

  if(hasHost2 && productCount === 0) return 'A'; // 2人
  if(hasHost1Only && productCount === 2) return 'B'; // 1人+2品
  if(!hasHost2 && !hasHost1Only && productCount === 3) return 'C'; // 3品
  return ''; // 對不上任何已知組成（例如已刪掉的「2人+1品」），交由畫布維持目前版型，不要硬套錯的
}

function ieCell(row, idx){ return row && row[idx] !== undefined ? row[idx] : null; }
function ieTxt(v){ return (v === null || v === undefined) ? '' : String(v).trim(); }

/* 商品/人物名稱欄位常見的「範例佔位文字」：工單模板本來就會在欄位裡先放
   「商品1」「商品2」「商品3」「人物1」「人物2」這種提示字樣，等填表的人
   蓋掉、改填真正的品名/姓名。如果這個位置本來就沒有東西（例如這包其實
   只有2個商品），常常會忘記把這格清空、範例文字就這樣留在儲存格裡，
   看起來「有填」，其實跟完全空白是同一件事。

   這裡直接判斷：文字內容如果剛好等於它自己欄位名稱對應的範例佔位字，
   就當作沒填，回傳空字串——不能真的拿「商品3」這種字面去比對素材檔名，
   不然：
     1) 這個沒有商品3的分頁，比對邏輯的萬用備援關鍵字剛好也是「商品3」
        （見 SHADOW_SLOT_ALIASES），會意外比對到別的分頁裡恰好符合這個
        通用關鍵字的檔案，等於把別包的素材誤套進這一包；
     2) 就算沒比對到檔案，畫面上「這個分頁的商品3叫『商品3』」這種顯示
        本身也是誤導的假資料，不如維持真正的空白。 */
var PLACEHOLDER_NAME_TEXT = {
  host1Name: '人物1', host2Name: '人物2',
  product1Name: '商品1', product2Name: '商品2', product3Name: '商品3'
};
function ieNameField(rawVal, fieldKey){
  var txt = ieTxt(rawVal);
  if(txt && PLACEHOLDER_NAME_TEXT[fieldKey] && txt === PLACEHOLDER_NAME_TEXT[fieldKey]) return '';
  return txt;
}

/* 「時間」欄位在這份公版工單裡是日期+時間合併在同一格（Excel序列數，因為讀檔時
   cellDates:false），側欄 txt-time 欄位要的格式是「M/D H:mm」（例如「6/13 22:00」），
   這裡直接轉換，跟舊parser處理『時間』欄位分開存日期/時間兩欄的做法不同──
   這份公版工單本來就只有一欄，不用另外拆。已經是字串（人工填「6/13 22:00」這種）
   就直接照原樣回傳，不重複轉換。 */
function ieFormatDateTime(val){
  if(val === null || val === undefined || val === '') return '';
  if(typeof val === 'number'){
    var dt = new Date(Math.round((val - 25569) * 86400 * 1000));
    var m = dt.getUTCMonth()+1, d = dt.getUTCDate();
    var hh = dt.getUTCHours(), mm = dt.getUTCMinutes();
    return m+'/'+d+' '+hh+':'+(mm<10?'0':'')+mm;
  }
  return String(val).trim();
}

/* A級專場：A(0)~L(11)欄，每包固定10列一組（01_LPBN無CTA／02_LPBN有CTA／03_A1 FL） */
function parsePersonalEventALevel(rows, startIdx){
  var items = [];
  var i = startIdx;
  while(i < rows.length){
    var base = rows[i];
    if(!ieTxt(ieCell(base, 0)).replace(/^\n+/, '')) break; // A欄（檔名）空了，這個區塊結束
    var r1=rows[i+1]||[], r2=rows[i+2]||[], r3=rows[i+3]||[];
    var r4=rows[i+4]||[], r5=rows[i+5]||[], r6=rows[i+6]||[], r7=rows[i+7]||[];
    var r8=rows[i+8]||[], r9=rows[i+9]||[];

    var comboRaw = ieTxt(ieCell(r4, 5));
    var comboLetter = mapExcelComboToShadowCombo(comboRaw);

    /* F欄（03_A1 FL方形版位）「版型」分類，三選一：
         「不製作」／空白 → 不製作
         「LOGO+案型OO字內」（前綴判斷）→ LOGO＋下方文案BAR版型，
            LOGO直接沿用同一包LPBN已填的logoName（見下面logoName欄位），不用另外找欄位
         其他（例如「案型OO字內」）→ 純文案版型，可2排
       這一列的F欄本身只是「版型分類」的說明文字（例如「LOGO+案型5字內」，
       末尾的字數只是提醒使用者上限，不是實際內容）——真正的文案文字使用者
       是填在下一列（LOGO列）的F欄，兩種版型都一樣，跟 B級專場（parsePersonalEventBLevel）
       同樣「分類列/內容列各自一列」的邏輯一致，這裡原本漏讀了那一列，改成跟B級一樣分開讀。
       對應 layouts/04_fl_a1.html 的 D.flAVariant／D.flAText。 */
    var flRaw = ieTxt(ieCell(r8, 5)); // F欄：版型分類
    var flCaptionRaw = ieTxt(ieCell(r9, 5)); // 下一列 F欄：真正的文案文字
    var flAVariant, flAText;
    if(!flRaw || flRaw === '不製作'){
      flAVariant = 'skip'; flAText = '';
    } else if(/^LOGO\s*[+＋]/i.test(flRaw)){
      flAVariant = 'logoBar'; flAText = flCaptionRaw;
    } else {
      flAVariant = 'caption'; flAText = flCaptionRaw;
    }

    items.push({
      level: 'A',
      theme: ieTxt(ieCell(base, 7)) || 'A', // H欄：公版款式字母，對應 js/themes.js 的 key
      logoName: ieTxt(ieCell(base, 5)),
      main: ieTxt(ieCell(r1, 5)),
      sub: ieTxt(ieCell(r2, 5)),
      time: ieFormatDateTime(ieCell(r3, 5)),
      combo: comboLetter,
      host1Name: ieNameField(ieCell(r5, 4), 'host1Name'),
      host2Name: ieNameField(ieCell(r5, 5), 'host2Name'),
      product1Name: ieNameField(ieCell(r6, 4), 'product1Name'),
      product2Name: ieNameField(ieCell(r6, 5), 'product2Name'),
      product3Name: ieNameField(ieCell(r6, 6), 'product3Name'),
      product1Ratio: ieCell(r7, 4),
      product2Ratio: ieCell(r7, 5),
      product3Ratio: ieCell(r7, 6),
      flAVariant: flAVariant,
      flAText: flAText
    });
    i += 10;
  }
  return items;
}

/* B級專場：N(13)~Y(24)欄，每包固定2列，只有直播間FL（跟現有03_fl.html同規格 336×120）。
   起始列的 S欄只是「版型分類」（LOGO／案型6字內），不是實際內容──
   真正的LOGO名稱在下一列的S欄（覆蓋掉範例時的靜態文字'LOGO'），
   真正的文案文字在下一列的T欄（覆蓋掉範例時的靜態文字'案型'）。
   （這裡A級專場不用這樣抓兩列，因為A級LOGO變體可以直接沿用同一包LPBN
   已經填過的logoName，B級沒有LPBN可以借，才需要自己另外存一份） */
function parsePersonalEventBLevel(rows, startIdx){
  var items = [];
  var i = startIdx;
  while(i < rows.length){
    var base = rows[i];
    if(!ieTxt(ieCell(base, 13)).replace(/^\n+/, '')) break; // N欄空了，區塊結束
    var r1 = rows[i+1] || [];
    var variantCat = ieTxt(ieCell(base, 18)); // S欄：版型分類（LOGO／案型6字內／不製作）
    var isLogo = variantCat.toUpperCase() === 'LOGO';
    var isSkip = !variantCat || variantCat === '不製作';
    var logoName = isLogo ? ieTxt(ieCell(r1, 18)) : ''; // 下一列 S欄：真正的LOGO/廠商名稱
    var captionText = (!isLogo && !isSkip) ? ieTxt(ieCell(r1, 19)) : ''; // 下一列 T欄：真正的文案

    items.push({
      level: 'B',
      theme: ieTxt(ieCell(base, 20)) || 'A', // U欄：公版款式字母，對應 js/themes.js 的 key
      logoName: logoName,
      flText: isSkip ? '' : (isLogo ? 'logo' : captionText),
      flProductSlot: isSkip ? 'skip' : null
    });
    i += 2;
  }
  return items;
}

function parsePersonalEventSheet(rows){
  var aStart = -1, bStart = -1;
  for(var i=0;i<rows.length;i++){
    var row = rows[i] || [];
    if(ieTxt(ieCell(row,0)) === '資料夾命名：A級專場') aStart = i + 2; // 跳過標記列+表頭列
    if(ieTxt(ieCell(row,13)) === '資料夾命名：B級專場') bStart = i + 2;
  }
  if(aStart === -1 && bStart === -1) return null; // 不是這個格式，交回舊parser
  var aItems = aStart !== -1 ? parsePersonalEventALevel(rows, aStart) : [];
  var bItems = bStart !== -1 ? parsePersonalEventBLevel(rows, bStart) : [];
  return aItems.concat(bItems);
}

/* ── 批次比對所有分頁的LOGO／人物／商品素材（個人專場專用）──
   前提：匯入工單時，Logo跟人物/商品圖全部放同一個資料夾一起上傳，Excel裡
   「LOGO」欄位（廠商名稱）、人物1/2、商品1/2/3 這些名稱要能對到檔名
   （用 matchFileByAliases 模糊比對，檔名包含關鍵字或關鍵字包含檔名都算）。

   跟原本 afterExcel() 只比對「目前顯示的第一個分頁」不同，這裡會逐一分頁
   都比對一次，把結果直接存進各自的 tab.data（＝group物件本身，buildTabs
   建分頁時就是直接拿 group 當 tab.data），之後切分頁／逐包確認彈窗開啟時
   就能直接讀到這一包自己的素材，不用每包再手動上傳一次。

   只有帶 level 標記的分頁（個人專場公版格式：A級專場／B級專場）才會跑這段，
   舊格式工單（沒有 level）維持原本只比對第一個分頁的行為，不受影響。

   全部跑完才呼叫 cb()，讓外部（afterExcel）等這批比對完成後再接著開確認彈窗，
   避免兩邊同時搶著操作 ShadowEditor 的當前狀態互相打架。 */
function prematchAllTabAssets(groups, files, cb){
  if(!files || !files.length || !window.ShadowEditor){ if(cb) cb(); return; }
  var levelGroups = groups.filter(function(g){ return g.level === 'A' || g.level === 'B'; });
  if(!levelGroups.length){ if(cb) cb(); return; }

  window.ShadowEditor.enterPending(); // 比對過程不要一直廣播給畫布，全部比完才會被外部commit

  function clearAllSlots(){
    (window.ShadowEditor.SLOT_DEFS || []).forEach(function(def){
      window.ShadowEditor.removeSlot(def.id);
    });
  }

  function matchLogoForGroup(g, cbLogo){
    var logoFile = g.logoName ? matchFileByAliases(files, [g.logoName]) : null;
    if(!logoFile){ cbLogo(); return; }
    var reader = new FileReader();
    reader.onload = function(ev){
      g.logo2Edit = { raw: ev.target.result, scale:undefined, offX:undefined, offY:undefined, shape:undefined };
      /* A級專場方形FL ICON的底色固定吸Logo素材本身的顏色（跟 editor-logo2-canvas.js
         的 logo2LoadImageFromSrc()／openLogo2Popup() 是同一條規則），這裡批次比對
         時就直接算好存進 g.flLogoBgMode／g.flLogoSampledColor——不能只依賴使用者
         之後手動點開「編輯 LOGO＋曝品區」彈窗才觸發取樣，不然匯入完直接切分頁
         預覽的話，還沒被手動開過彈窗的分頁會停在預設白底，看起來像沒吃到底色。
         B級／舊格式維持原本行為，不在這裡強制改成sampled，只有使用者手動選過
         「以Logo底色填滿」時才會套用，跟 logo2LoadImageFromSrc() 的邏輯保持一致。 */
      if(g.level === 'A'){
        var im = new Image();
        im.onload = function(){
          g.flLogoBgMode = 'sampled';
          g.flLogoSampledColor = logo2SampleAssetBgColor(im);
          cbLogo();
        };
        im.onerror = function(){ cbLogo(); }; // 讀不出圖就跳過取樣，維持預設白底，不擋流程
        im.src = ev.target.result;
        return;
      }
      cbLogo();
    };
    reader.onerror = function(){ cbLogo(); };
    reader.readAsDataURL(logoFile);
  }

  var i = 0;
  function next(){
    if(i >= levelGroups.length){
      window.ShadowEditor.commit(); // 全部分頁比對完才結束暫存模式，避免pendingMode卡住擋住後續廣播
      if(cb) cb();
      return;
    }
    var g = levelGroups[i++];

    /* 人物／商品：B級沒有商品組合欄位（g.combo是undefined），matchAndApplyHostFiles
       內部找不到對應的Excel姓名/品名可比對就直接跳過，安全，不會誤套用。
       這裡傳 cb 進去，等「每一個」比對到的插槽都真的讀檔完成才繼續──
       之前用固定延遲時間猜測，遇到大張的商品照片（Photoroom去背圖常常幾百KB～
       將近1MB）讀檔還沒完成就被拿去擷取 getFullState()，抓到的其實是空插槽，
       批次比對完看起來「有跑過」但畫面/彈窗卻是空的，就是這個時序問題造成的。 */
    clearAllSlots();
    if(g.combo) window.ShadowEditor.setCombo(g.combo);
    matchAndApplyHostFiles(files, g, function(){
      g.shadowState = window.ShadowEditor.getFullState();
      /* LOGO：存進「這個分頁自己」的 g.logo2Edit，不是存進全域 S.logo2Raw
         （那個是目前畫面即時顯示用的，批次比對階段不該去動它，避免畫面閃爍）。 */
      matchLogoForGroup(g, next);
    });
  }
  next();
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
        var personalGroups = parsePersonalEventSheet(rows);
        groups = groups.concat(personalGroups || parseWorkorderGroups(rows));
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
     五段進度。個人專場（A/B級公版格式）跟舊格式工單走不同分支，兩邊都要有進度顯示。
     目前是「階段性」進度，matchAndApplyHostFiles()／prematchAllTabAssets() 對各欄位的
     檔案讀取是各自獨立、不等彼此完成，沒有做到「已比對 n/5」這種逐檔進度——之後如果
     素材資料夾檔案量變大、需要更細的進度，要把那段改成有回呼才能逐一累加。 */
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
    if(typeof updateFlA1CanvasVisibility === 'function') updateFlA1CanvasVisibility(); // 同上，A級專場方形FL ICON（04_fl_a1）版本

    /* 素材比對：個人專場公版格式（有level標記）在這之前已經由 prematchAllTabAssets
       批次比對過「所有」分頁，結果存在各自的 tab.data 裡——這裡如果再用
       matchAndApplyHostFiles/matchAndApplyLogoFiles 重新比對一次，會用到
       ShadowEditor「當下」的即時狀態，而那份狀態在批次比對跑完後反映的是
       最後一個處理的分頁、不是這第一個分頁，等於用錯的資料源再比對一次。
       改成直接呼叫 applyTabData() 套用 prematchAllTabAssets 已經存好、正確
       屬於這個分頁自己的 logo2Edit／shadowState，單一資料來源，不會兜不起來。
       舊格式工單（沒有level）沒有跑過批次比對，維持原本呼叫方式。 */
    if(groupData.level === 'A' || groupData.level === 'B'){
      pm.update(90, '套用比對結果…');
      /* 用 ACTIVE_TAB（buildTabs 已經指到「第一個A/B級分頁」，不一定是TABS[0]，
         如果Excel裡混雜了其他舊格式分頁，公版分頁排在後面，TABS[0]會是
         不相關的分頁），不要寫死套用 TABS[0]。 */
      applyTabData(TABS[ACTIVE_TAB] || TABS[0], true);
      closePopup('import');
      var msgParts0 = [];
      if(st.excelFile) msgParts0.push('Excel 已匯入');
      if(st.assetFiles.length) msgParts0.push('素材已依各分頁自動比對套用');
      toast(msgParts0.join('，')||'匯入完成','ok',3000);
      pm.done(msgParts0.join('，')||'匯入完成');
      pm.hide();
      /* 個人專場逐包確認：從第一包A級分頁開始，LOGO＋商品都已由 prematchAllTabAssets
         批次比對好，這裡自動接上確認彈窗，一路確認到底──A級全部確認完會自動接續
         B級（只有需要放LOGO的分頁才會跳出確認，純文案／不製作的分頁略過）。
         見 editor-logo2-canvas.js 的 startReviewFlow/startALevelReview/startBLevelReview。 */
      if(typeof startReviewFlow === 'function') startReviewFlow();
      return;
    }

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
      var _levelCounters = {};
      groups.forEach(function(g){
        if(g.level === 'A' || g.level === 'B'){
          _levelCounters[g.level] = (_levelCounters[g.level] || 0) + 1;
          g.levelIndex = _levelCounters[g.level];
        }
      });
      var tabs = groups.map(function(g, i){
        return { id:'tab-'+(i+1), label: tabLabelFor(g, i), data: g };
      });
      /* 個人專場公版格式（有level標記）一定要優先挑「第一筆有level的資料」
         當這次匯入的代表分頁索引，不能無條件用0──如果同一份Excel裡混雜了
         其他舊格式分頁（例如公版分頁排在後面），index 0 會是不相關的舊格式
         資料，導致 buildTabs 套用錯的分頁、afterExcel() 判斷 groupData.level
         也失準，跳過「個人專場」專用流程、素材對不上、彈窗也開不對分頁。 */
      var personalFirstIdx = -1;
      for(var gi=0; gi<groups.length; gi++){
        if(groups[gi].level === 'A' || groups[gi].level === 'B'){ personalFirstIdx = gi; break; }
      }
      buildTabs(tabs, personalFirstIdx >= 0 ? personalFirstIdx : 0);
      pm.update(60, '比對主持人／商品圖片…');
      prematchAllTabAssets(groups, st.assetFiles, function(){
        var personalFirst = personalFirstIdx >= 0 ? groups[personalFirstIdx] : null;
        afterExcel(personalFirst || groups[0] || null);
      });
    });
  } else {
    afterExcel(null);
  }
}

/* 分頁標籤：優先用「日期」欄位；新版工單常把日期併在「時間」欄位裡（例如「6/15 19:00」），
   這種格式沒有獨立的日期欄位，所以再從時間字串抓開頭的日期部分當標籤，
   兩者都抓不到才退回「第N天」 */
function ieNumPad2(n){ n = String(n); return n.length < 2 ? '0'+n : n; }

function tabLabelFor(g, i){
  /* 個人專場公版格式：g.levelIndex 是「這是第幾個同等級（A/B）分頁」，
     在 confirmImport() 組 tabs 陣列時就先算好塞進 g，這裡直接用，
     不用重新掃整個陣列。 */
  if(g.level === 'A' || g.level === 'B'){
    return g.level + ieNumPad2(g.levelIndex || (i+1));
  }
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

