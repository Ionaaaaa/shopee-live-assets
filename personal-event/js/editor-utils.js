'use strict';

/* ── 活動名稱：顯示在左上角，也是「店家名稱」讀不到時的保底值 ── */
var ACTIVITY_NAME = 'personal-event';

/* 匯出檔名用的店家名稱：優先用工單「LOGO」欄位吸出來的賣家名稱
   （S.sellerName，例如「Cerave適樂膚」）——那才是真正的賣家/品牌識別；
   「購物專家名稱」（txt-brand）填的是主持人/來賓身分，不是店家名稱，
   容易搞混但意義不一樣。S.sellerName 沒有值（例如純手動填寫、沒有走
   Excel匯入）才退回 txt-brand，兩者都沒有才退回 ACTIVITY_NAME 保底。 */
function getExportStoreName(){
  if(typeof S !== 'undefined' && S.sellerName) return S.sellerName;
  var v = ((document.getElementById('txt-brand')||{}).value || '').trim();
  if(!v || v === 'XXX') return ACTIVITY_NAME;
  return v;
}

/* 整包下載時，A級專場每一包子資料夾要用「這個分頁自己的」廠商名稱，不能讀
   即時的 S.sellerName——批次跑到這個分頁時，S.sellerName 可能還是上一個分頁
   殘留的舊值（真正同步成這個分頁的值是在這裡呼叫之後才做的），所以直接從
   傳進來的 tab.data 原始資料讀，跟即時畫面狀態脫鉤，才不會抓錯家。 */
function getTabStoreName(tabData){
  var d = tabData || {};
  var v = (d.sellerName || d.logoName || '').trim();
  if(!v || v === 'XXX') return ACTIVITY_NAME;
  return v;
}

/* zip 裡的資料夾/檔名可能包含「/」「\」（例如廠商名稱剛好打了斜線），
   這兩個字元在zip路徑裡有特殊意義（會被誤判成多一層資料夾），統一換成
   「-」；其餘字元（含中文）zip本身可以處理，不特別過濾。 */
function sanitizeZipName(name){
  return String(name || '').replace(/[\/\\]/g, '-').trim() || ACTIVITY_NAME;
}

/* 整包下載zip最外層／暫存檔的名稱：日期(補0)或日期範圍_個人專場，跟單張／
   整頁下載用的 getExportNamePrefix()（帶店家名稱）刻意分開——整包下載橫跨
   多分頁、多家廠商，最外層檔名用單一店家名稱代表不合理，固定用「個人專場」
   這個活動名稱即可，各廠商的名稱已經反映在裡面的分包資料夾名稱上。 */
function getExportAllNamePrefix(datePrefix){
  return (datePrefix ? datePrefix + '_' : '') + '個人專場';
}

/* 統一組出「日期(補0)_店家名稱_賣家資源」這個檔名前綴，單張下載／整頁下載／
   整包下載都呼叫這裡，不要各自拼一份，格式才會保證三個地方永遠一致。
   datePrefix 可以是空字串（例如整包下載橫跨多天、日期已經另外處理過）。 */
function getExportNamePrefix(datePrefix){
  return (datePrefix ? datePrefix + '_' : '') + getExportStoreName() + '_personal-event';
}

/* 日期格式化：抓 M/D，兩邊補0成4碼 MMDD（檔名用，補0後長度固定、好排序） */
function formatDateMMDD(raw){
  if(!raw) return '';
  var m = String(raw).match(/(\d{1,2})\/(\d{1,2})/);
  if(!m) return String(raw).replace(/\//g,'');
  function pad(n){ return n.length<2 ? '0'+n : n; }
  return pad(m[1])+pad(m[2]);
}
/* 分頁日期：優先讀「日期」欄位；新版工單常把日期併在「時間」欄位裡（例如「6/15 19:00」），
   沒有獨立日期欄位時改抓時間字串開頭的日期部分 */
function getTabDateRaw(tabData){
  var d = tabData || {};
  if(d.date) return d.date;
  if(d.time){
    var m = String(d.time).match(/^\s*(\d{1,2}\/\d{1,2})/);
    if(m) return m[1];
  }
  return '';
}

function toast(msg,type,duration){
  var el=document.getElementById('toast-el');
  el.textContent=msg; el.className='toast '+(type||'')+' show';
  clearTimeout(el._t); el._t=setTimeout(function(){el.classList.remove('show');},duration||2500);
}
window.showToast=toast;

/* ── State ── */

function v(id){ return (document.getElementById(id)||{}).value||''; }

/* 是否為「算1字」的全形/CJK字元（中文、全形英數、韓文…）；其餘（含英文字母、
   半形數字、半形符號）算0.5字。單一個共用的判斷式，cc()／weightedTextLen()／
   truncateToWeightedLen() 都呼叫這裡，不要各自重複寫一份判斷條件。 */
function isWideChar(code){
  return (
    (code >= 0x4E00 && code <= 0x9FFF) ||  // CJK 統一漢字
    (code >= 0x3400 && code <= 0x4DBF) ||  // CJK 擴展A
    (code >= 0xF900 && code <= 0xFAFF) ||  // CJK 相容
    (code >= 0x3000 && code <= 0x303F) ||  // CJK 符號
    (code >= 0xFF00 && code <= 0xFF60) ||  // 全形英數
    (code >= 0xAC00 && code <= 0xD7AF)     // 韓文
  );
}

/* 算出一段文字的「加權字數」：中文/全形/韓文算1字，英文字母/半形數字/半形符號算0.5字。
   側欄字數顯示（cc()）、Excel匯入時的截斷（editor-import.js）都呼叫這裡，
   確保「幾個字算超過上限」兩邊算法永遠一致。 */
function weightedTextLen(val){
  val = val || '';
  var len = 0;
  for(var i=0; i<val.length; i++){
    var code = val.codePointAt(i);
    if(code === 0x0A || code === 0x0D) continue; // 換行符號不算字數
    if(isWideChar(code)){
      len += 1;
    } else if(code > 0xFFFF){
      len += 1; i++; // surrogate pair
    } else {
      len += 0.5; // 英數、半形符號
    }
  }
  return Math.ceil(len * 2) / 2;
}

/* 把字串截到「加權字數不超過 max」為止，逐字邏輯跟上面 weightedTextLen() 完全對應
   （英數半形算0.5字、中文全形算1字），用來擋下超過字數上限還繼續打字的情況，
   讓使用者實際感受到「打不進去」，不是等打完才事後提示超過。 */
function truncateToWeightedLen(val, max){
  val = val || '';
  var out = '';
  var len = 0;
  for(var i=0; i<val.length; i++){
    var code = val.codePointAt(i);
    if(code === 0x0A || code === 0x0D){ out += val[i]; continue; } // 換行符號保留但不算字數
    var wide = isWideChar(code);
    var isSurrogate = !wide && code > 0xFFFF;
    var chunk = isSurrogate ? val.substr(i, 2) : val[i];
    var w = (wide || isSurrogate) ? 1 : 0.5;
    if(len + w > max) break;
    out += chunk;
    len += w;
    if(isSurrogate) i++;
  }
  return out;
}

/* 依加權字數裁到上限（不是裁字元數）——英文字母只算0.5字，裁的時候要跟著用
   同一套權重，不然「ABCDE」（加權2.5字）會被簡單的slice(0,5)整段保留，
   跟畫布上真正顯示的上限對不起來。逐字元累加，加上去會超過max才停止。 */
function truncateToWeightedLen(val, max){
  val = val || '';
  var result = '';
  var len = 0;
  for(var i=0; i<val.length; i++){
    var code = val.codePointAt(i);
    if(code === 0x0A || code === 0x0D){ result += val[i]; continue; } // 換行符號保留但不算字數
    var charStr = val[i];
    var weight;
    if(isWideChar(code)){
      weight = 1;
    } else if(code > 0xFFFF){
      charStr = val.substr(i, 2); // surrogate pair，兩個 code unit 一起取
      i++;
      weight = 1;
    } else {
      weight = 0.5;
    }
    if(len + weight > max) break;
    len += weight;
    result += charStr;
  }
  return result;
}

function cc(inputId,countId,max){
  var el = document.getElementById(inputId);
  if(!el) return;
  var val = el.value;
  var len = weightedTextLen(val);
  /* 超過上限就直接截斷、寫回輸入框，達到「打不進去」的效果，不是等打完才事後提示。
     用 truncateToWeightedLen 找出「加權字數不超過max」的最長前綴，比對如果真的
     被截斷了（代表使用者這次輸入真的超過），才動到 value／游標，避免每次輸入
     沒超過上限時也去重設 value 讓游標跳到最後面。 */
  if(len > max){
    var truncated = truncateToWeightedLen(val, max);
    if(truncated !== val){
      el.value = truncated;
      val = truncated;
      len = weightedTextLen(val);
    }
  }
  var ccEl=document.getElementById(countId); if(!ccEl) return;
  ccEl.textContent=len+' / '+max;
  ccEl.classList.toggle('over', len > max);
}
/* ── 字數超限檢查 ── */
var _overlimitContinue = null;
var OVER_LIMIT_FIELDS = [
  { ccId:'cc-sub',  label:'主標（小字）' },
  { ccId:'cc-main', label:'副標（大字）' },
  { ccId:'cc-fl',   label:'FL 文案' },
  { ccId:'cc-fl-a1', label:'FL 文案（A1）' }
];

/* FL字數上限依版型動態切換：版型P（有商品）最多5字，否則6字
   ccFl() 取代一般的 cc('txt-fl','cc-fl',6) 直接呼叫

   另外，FL文案欄位填「LOGO」代表這是版型L（純Logo），這裡順便偵測「從非LOGO
   變成LOGO」的那一刻，自動跳出 Logo2 編輯 popup，讓使用者馬上上傳/調整素材，
   不用像以前一樣得等匯入工單流程才會跳出來、或自己找右側「編輯 Logo2」按鈕。
   用 _flWasLogo 記住上一次的狀態，只在「剛變成LOGO」那一次觸發一次，
   避免每次打字都彈出來、或使用者手動關掉後又被強制重新打開。 */
var _flWasLogo = false;

/* 下拉選單「FL ICON」切換時呼叫（取代原本inline的 window._flProductSlotValue=... 寫法）。
   新增LOGO選項後，選單本身的值也要能代表LOGO模式，不能只靠 txt-fl 欄位文字，
   所以這裡把兩邊同步起來：
     切到LOGO → 自動把 txt-fl 填成「logo」（跟工單匯入、下游畫布判斷版型L的
                機制保持一致，不用另外改 03_fl.html 那邊的判斷方式）
     從LOGO切開 → 如果 txt-fl 裡還殘留「logo」這幾個字（使用者沒手動改過），
                自動清空，讓使用者可以重新打真正的文案，避免文案欄位卡著
                「logo」字樣卻選著商品1/2/3或純文案，兩邊看起來對不上 */
function handleFlSlotChange(value){
  window._flProductSlotValue = value || null;
  var flEl = document.getElementById('txt-fl');
  if(flEl){
    if(value === 'logo'){
      flEl.value = 'logo';
    } else if(flEl.value.trim().toLowerCase() === 'logo'){
      flEl.value = '';
    }
  }
  ccFlUserTriggered();
  if(typeof updateFlCanvasVisibility === 'function') updateFlCanvasVisibility();
  if(typeof broadcast === 'function') broadcast();
}

function ccFl(){
  var slot = (document.getElementById('fl-product-slot') || {}).value || '';
  var raw  = (document.getElementById('txt-fl') || {}).value || '';
  /* LOGO判斷雙重保險：下拉選單選「LOGO」，或 txt-fl 文字打「logo」，兩種都算——
     維持原本「打字」的相容行為，同時讓新的下拉選單也能觸發同一套邏輯 */
  var isLogo = slot === 'logo' || raw.trim().toLowerCase() === 'logo';
  var max  = (slot && !isLogo) ? 5 : 6;
  cc('txt-fl', 'cc-fl', max);
  /* 選單切換時也要更新顯示的上限數字 */
  var el = document.getElementById('cc-fl');
  if(el){
    var parts = el.textContent.split('/');
    el.textContent = (parts[0] || '0') + '/ ' + max;
  }

  /* 這裡只靜靜同步 _flWasLogo，不會自動開彈窗——切分頁／匯入工單套用資料時
     （applyTabData／afterExcel）也會呼叫這支函式，如果在這裡就自動彈窗，
     每次點選「已經確認過LOGO位置」的B級分頁都會被強制重新跳出編輯彈窗，
     使用者沒做任何操作卻一直被打斷。真正「使用者主動把FL切成LOGO」才要
     自動彈窗的邏輯，移到 ccFlUserTriggered()，只有下拉選單 onchange／
     文案輸入框 oninput 這兩個真人操作的入口才會呼叫到。 */
  _flWasLogo = isLogo;
}

/* 使用者真的手動操作（切下拉選單／打字）才會呼叫這支，判斷「剛從非LOGO
   變成LOGO」的那一刻才自動跳出 Logo2 編輯 popup。呼叫順序：先用切換前的
   _flWasLogo 判斷，再呼叫 ccFl() 讓它去同步新的狀態，避免自己重複算一次
   判斷邏輯、跟 ccFl() 裡的算法兜不起來。 */
function ccFlUserTriggered(){
  var slot = (document.getElementById('fl-product-slot') || {}).value || '';
  var raw  = (document.getElementById('txt-fl') || {}).value || '';
  var isLogo = slot === 'logo' || raw.trim().toLowerCase() === 'logo';
  var wasLogo = _flWasLogo;
  ccFl();
  if(isLogo && !wasLogo && typeof openLogo2Popup === 'function'){
    openLogo2Popup(false);
  }
}

/* A級專場方形FL ICON（04_fl_a1）專用，跟上面 B級（03_fl）的 handleFlSlotChange／ccFl
   是各自獨立的一組，只在A級分頁顯示（見 updateCanvasVisibilityForLevel）。
   版型只有三選一：不製作／LOGO＋案型（上限5字，LOGO沿用同一包LPBN的logoName，
   不用另外挑）／純案型（上限6字，可兩排）。 */
function handleFlA1VariantChange(value){
  S.flAVariant = value || 'skip';
  if(typeof updateFlA1CanvasVisibility === 'function') updateFlA1CanvasVisibility();
  if(typeof broadcast === 'function') broadcast();
}

function handleFlA1TextInput(value){
  /* 最多只允許1個換行（2行），多餘的換行直接移除，避免使用者按太多次Enter */
  var el = document.getElementById('txt-fl-a1');
  if(el){
    var parts = el.value.split('\n');
    if(parts.length > 2){
      el.value = parts[0] + '\n' + parts.slice(1).join('');
    }
  }
  ccFlA1(); // 先做字數上限截斷，會直接修改輸入框的value
  S.flAText = v('txt-fl-a1'); // 讀回截斷後的值，不能直接用參數value（可能是截斷前、超過上限的原始值）
  if(typeof broadcast === 'function') broadcast();
}

function ccFlA1(){
  var max = (S.flAVariant === 'logoBar') ? 5 : 6;
  cc('txt-fl-a1', 'cc-fl-a1', max);
  var el = document.getElementById('cc-fl-a1');
  if(el){
    var parts = el.textContent.split('/');
    el.textContent = (parts[0] || '0') + '/ ' + max;
  }
}

function checkOverLimit(proceedFn){
  var overs = OVER_LIMIT_FIELDS.filter(function(f){
    var el = document.getElementById(f.ccId);
    return el && el.classList.contains('over');
  });
  if(overs.length === 0){ proceedFn(); return; }
  var msg = '以下欄位的文案超過字數限制：<br><br>';
  overs.forEach(function(f){
    var el = document.getElementById(f.ccId);
    msg += '・<b>'+f.label+'</b>　'+el.textContent+'<br>';
  });
  msg += '<br>建議返回調整，避免畫面文字被截斷。';
  document.getElementById('overlimit-msg').innerHTML = msg;
  _overlimitContinue = function(){
    document.getElementById('popup-overlimit').classList.remove('open');
    proceedFn();
  };
  document.getElementById('popup-overlimit').classList.add('open');
}


function setPill(rowId,el){
  document.querySelectorAll('#'+rowId+' .pill').forEach(function(p){p.classList.remove('active');});
  el.classList.add('active');
}

/* ── Save / Load ── */