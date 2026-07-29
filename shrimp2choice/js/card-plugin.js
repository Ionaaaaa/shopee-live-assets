'use strict';
/* ══════════════════════════════════════════════════════════════════
   js/card-plugin.js — 案型字卡（06_card）多張擴充套件
   ----------------------------------------------------------------
   資料模型：
     每張卡 = { title, layoutType(1~4), rows:[{style,a,b}, ...最多6格] }
     layoutType 決定這6格各自用哪個樣式（CARD_LAYOUTS，跟 06_card.html 共用同一張表）
     每個樣式要填的欄位、字數上限見 STYLE_DEFS

   案型字卡跟其他版位不一樣的地方：
     1. 同一個廠商分頁可能有 1~4 張（其他版位固定各 1 張）
     2. 每一張的文案都各自獨立，要各自存資料、各自 postMessage
     3. 樣式3左邊色塊寬度是「固定寬＋英數字較長時自動加寬」，中英文混排時
        字數限制沒辦法保證不爆版，所以另外用畫布實際量測寬度來抓超版面的行，
        用「不擋輸入、超出時顯示警告、畫布上該行留白」的方式處理（06_card.html
        負責量測跟回報 overflow，這裡負責把警告顯示在對應欄位旁邊）
   ══════════════════════════════════════════════════════════════════ */

var CARD_MIN = 1, CARD_MAX = 4;

/* 版型1~4 對應的6格樣式序列，要跟 layouts/06_card.html 的 CARD_LAYOUTS 保持一致 */
var CARD_LAYOUTS = {
  1: [1,2,1,2,1,2],
  2: [1,1,3,3,3,5],
  3: [1,4,4,1,4,4],
  4: [3,3,3,3,3,5],
};

/* 每個樣式要填哪些欄位、字數上限、欄位標籤 */
var STYLE_DEFS = {
  1: { fields:['a'], max:{a:15}, label:{a:'色塊文案'} },
  2: { fields:['a'], max:{a:14}, label:{a:'內文文案'} },
  3: { fields:['a','b'], max:{a:5,b:9}, label:{a:'小標', b:'接續文案'} },
  4: { fields:['a','b'], max:{a:10,b:8}, label:{a:'內文文案', b:'小字'} },
  5: { fields:['a'], max:{a:28}, label:{a:'小字內容'} },
};

/* 新的（空白）row/card 直接帶入假字，展示這格最多可以打幾個字，比留白更直覺——
   使用者一眼就知道「這格填到頂大概長怎樣」，不用自己去翻文件查上限。
   只有真的全新／清空的欄位才會套用；rowsForLayout() 換版型時，同位置剛好
   同樣式的既有內容還是照舊保留，不會被假字蓋掉。 */
function dummyText(label, max){
  return label + max + '字內';
}
function emptyRow(style){
  var def = STYLE_DEFS[style];
  var row = { style:style, a:'', b:'' };
  if(def){
    def.fields.forEach(function(f){
      row[f] = dummyText(def.label[f], def.max[f]);
    });
  }
  return row;
}

/* 依版型產生6格 row 骨架，盡量保留舊資料（同位置剛好同樣式就沿用文字，不同樣式才清空） */
function rowsForLayout(layoutType, oldRows){
  var seq = CARD_LAYOUTS[layoutType] || CARD_LAYOUTS[1];
  return seq.map(function(style, i){
    var old = oldRows && oldRows[i];
    if(old && old.style === style) return { style:style, a:old.a||'', b:old.b||'' };
    return emptyRow(style);
  });
}

function emptyCard(){
  return { title:dummyText('標題',10), layoutType:1, rows: rowsForLayout(1, null) };
}

function ensureCards(){
  if(!S.cards) S.cards = [];
  // 只有從沒設定過(null/undefined，例如全新分頁)才給預設1張；
  // 明確設成0（工單判定這個廠商案型字卡全部fault）要尊重0，不能被硬拉回1
  if(S.cardCount == null) S.cardCount = 1;
  while(S.cards.length < S.cardCount) S.cards.push(emptyCard());
  if(S.cards.length > S.cardCount) S.cards.length = S.cardCount;
  if(S.activeCard == null || S.activeCard >= S.cardCount || S.activeCard < 0) S.activeCard = 0;
  S.cards.forEach(function(c){
    if(!c.layoutType) c.layoutType = 1;
    if(!c.rows || !c.rows.length) c.rows = rowsForLayout(c.layoutType, null);
    if(!c._overflow) c._overflow = [];
  });
}

function setCardCount(n){
  n = Math.max(CARD_MIN, Math.min(CARD_MAX, n));
  if(n === S.cardCount) return;
  /* 只有「減少」（刪除）才需要確認，張數變多不會遺失任何內容，不用擋 */
  if(n < S.cardCount){
    var delTitle = (S.cards[S.cardCount-1] && S.cards[S.cardCount-1].title) || '';
    var msg = '確定要刪除第 '+S.cardCount+' 張案型字卡嗎？'+(delTitle?'（標題：'+delTitle+'）':'')+'\n內容刪除後無法復原。';
    if(!confirm(msg)) return;
  }
  S.cardCount = n;
  ensureCards();
  buildCardStrip();
  flipCardPanel(function(){
    renderCardPanel();
    bumpEl('card-nav-count');
  });
  /* 張數變了，左側素材清單裡的 06_card_N 項目也要跟著增減 */
  if(typeof updateAssetList === 'function') updateAssetList();
}

function switchCard(i){
  ensureCards();
  if(i < 0 || i >= S.cardCount) return;
  S.activeCard = i;
  updateCardStripActive();
  flipCardPanel(renderCardPanel);
  var strip = document.getElementById('card-strip-scroll');
  var target = document.getElementById('card-block-'+i);
  if(strip && target){
    /* 確保切換過去的這張「完整」露出來，不是只對齊左邊、右側可能還是被裁到一截。
       卡片左邊界比目前可視範圍還左 → 捲到讓它左邊界貼齊；
       卡片右邊界超出可視範圍 → 捲到讓它右邊界剛好貼齊（等於整張都露出來）。
       兩種情況都不成立（本來就整張都看得到）就不用捲動。 */
    var targetLeft  = target.offsetLeft;
    var targetRight = targetLeft + target.offsetWidth;
    var visibleLeft  = strip.scrollLeft;
    var visibleRight = visibleLeft + strip.clientWidth;
    var newScrollLeft = null;
    if(targetLeft < visibleLeft){
      newScrollLeft = targetLeft;
    } else if(targetRight > visibleRight){
      newScrollLeft = targetRight - strip.clientWidth;
    }
    if(newScrollLeft !== null){
      strip.scrollTo({ left: newScrollLeft, behavior:'smooth' });
    }
  }
}

/* 切張數/切頁時的「翻」效果——只用scaleX把面板壓扁再彈回來，2D就好，
   不用cube那種真的3D perspective。壓到最扁的當下才真的換內容，
   使用者不會看到內容瞬間跳掉，接著彈回來的動畫本身就是「翻頁」的視覺回饋。 */
function flipCardPanel(swapContentCb){
  var body = document.getElementById('card-panel-body');
  if(!body){ swapContentCb(); return; }
  body.classList.add('flipping');
  setTimeout(function(){
    swapContentCb();
    void body.offsetWidth; // 強制reflow：先讓瀏覽器確定「內容已換、還是flipping扁的狀態」，拿掉class才會觸發彈回的transition
    body.classList.remove('flipping');
  }, 180);
}

function setCardLayoutType(layoutType){
  ensureCards();
  var c = S.cards[S.activeCard];
  c.layoutType = layoutType;
  c.rows = rowsForLayout(layoutType, c.rows);
  broadcastCard(S.activeCard);
  renderCardPanel();
}

function updateCardTitle(value){
  ensureCards();
  S.cards[S.activeCard].title = value;
  broadcastCard(S.activeCard);
  var len = cjkLen(value);
  var ccEl = document.getElementById('cc-card-title');
  if(ccEl){ ccEl.textContent = len+' / 10'; ccEl.classList.toggle('over', len>10); }
}

function updateCardRowField(rowIdx, field, value){
  ensureCards();
  var row = S.cards[S.activeCard].rows[rowIdx];
  if(!row) return;
  row[field] = value;
  broadcastCard(S.activeCard);
  updateCardRowCC(rowIdx);
}

/* 打字當下直接更新這一行右上角的字數顯示，不整個重render body（重render會讓
   正在輸入的textarea失焦、雙欄位還會打斷:focus-within展開狀態）。 */
function updateCardRowCC(rowIdx){
  var row = S.cards[S.activeCard] && S.cards[S.activeCard].rows[rowIdx];
  if(!row) return;
  var def = STYLE_DEFS[row.style];
  var el = document.getElementById('cc-row-'+rowIdx);
  if(!el) return;
  if(def.fields.length > 1){
    var fa = def.fields[0], fb = def.fields[1];
    var lenA = cjkLen(row[fa]||''), lenB = cjkLen(row[fb]||'');
    var maxA = def.max[fa], maxB = def.max[fb];
    el.textContent = lenA+'/'+maxA+'・'+lenB+'/'+maxB;
    el.classList.toggle('over', lenA>maxA || lenB>maxB);
  } else {
    var f = def.fields[0];
    var len = cjkLen(row[f]||''); var max = def.max[f];
    el.textContent = len+' / '+max;
    el.classList.toggle('over', len>max);
  }
}

function cardPayload(i){
  var c = S.cards[i] || emptyCard();
  return {
    bgBase: S.bgUrls[S.theme],
    cardTitle: c.title,
    layoutType: c.layoutType,
    rows: c.rows,
    cardIndex: i,
    cardCount: S.cardCount
  };
}

function broadcastCard(i){
  var id = '06_card_' + (i+1);
  var ifr = iframes[id];
  if(ifr && ifr.contentWindow){
    ifr.contentWindow.postMessage({type:'BN_UPDATE', payload:cardPayload(i)}, '*');
  }
}

function broadcastAllCards(){
  ensureCards();
  for(var i=0;i<S.cardCount;i++) broadcastCard(i);
}

/* ── 畫布區：橫向排列的案型字卡，接在既有直排版位最下面 ──
   採增量更新：card-strip-wrap跟每張卡片的iframe「能不重建就不重建」，
   只有真的需要新增/移除卡片時才動DOM，已存在的卡片只更新尺寸相關的inline style，
   不會動到iframe本身——因為每張卡片實際顯示的文案/圖片是靠broadcastCard()
   用postMessage即時推進去的，跟iframe.src本身無關（src永遠是同一個
   layouts/06_card.html），所以舊iframe可以放心留著重複利用，不用整個砍掉重練。 */
function buildCardStrip(){
  ensureCards();
  var area = document.getElementById('canvas-area');
  if(!area) return;

  if(!S.cardCount){
    var old = document.getElementById('card-strip-wrap');
    if(old) old.remove();
    return; // 這個廠商案型字卡全部fault（是否製作=false），畫布整組不開
  }

  var w = 1080, h = 1920;

  var wrap = document.getElementById('card-strip-wrap');
  if(!wrap){
    wrap = document.createElement('div');
    wrap.id = 'card-strip-wrap';
    wrap.style.cssText = 'width:100%;';
    wrap.innerHTML =
      '<div class="canvas-meta" style="max-width:1125px;margin:0 auto 10px;">'+
        '<span class="canvas-name">案型字卡</span>'+
        '<span class="canvas-size">1080 × 1920 px ／張</span>'+
      '</div>'+
      '<div id="card-strip-scroll" style="display:flex;gap:20px;justify-content:center;overflow:hidden;width:100%;max-width:1125px;margin:0 auto;padding:0 0 12px;position:relative;"></div>';
    area.appendChild(wrap);
  }

  var scroll = wrap.querySelector('#card-strip-scroll');
  var titleEl = wrap.querySelector('.canvas-meta');

  /* 案型字卡放大一點：實測這條strip自己實際佔掉的高度（標題列＋每張卡片外框padding／
     標題列），不再沿用主畫布那組(canvas-nav/meta列)保守預留值——那組是給直排版位用的，
     套在這裡會多扣太多空間，字卡因此變得比需要的還小。 */
  var probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;left:-9999px;top:-9999px;';
  probe.innerHTML =
    '<div class="canvas-frame"><div class="canvas-meta" style="width:200px;">'+
      '<span class="canvas-name">第 1 張</span>'+
      '<button class="canvas-dl-btn">編輯這張</button>'+
      '<button class="canvas-dl-btn">⬇ 下載</button>'+
    '</div></div>';
  document.body.appendChild(probe);
  var probeFrameCS = getComputedStyle(probe.querySelector('.canvas-frame'));
  var probeMetaEl  = probe.querySelector('.canvas-meta');
  var probeMetaCS  = getComputedStyle(probeMetaEl);
  var cardChromeH  = parseFloat(probeFrameCS.paddingTop) + parseFloat(probeFrameCS.paddingBottom) +
                      probeMetaEl.getBoundingClientRect().height + parseFloat(probeMetaCS.marginBottom);
  var frameCardPadX = parseFloat(probeFrameCS.paddingLeft) + parseFloat(probeFrameCS.paddingRight);
  document.body.removeChild(probe);

  var titleH = titleEl.getBoundingClientRect().height + parseFloat(getComputedStyle(titleEl).marginBottom);
  var areaRect = area.getBoundingClientRect();
  var areaPadTop = parseFloat(getComputedStyle(area).paddingTop);
  var BOTTOM_GAP = 16;
  var availH = window.innerHeight - areaRect.top - areaPadTop - titleH - cardChromeH - BOTTOM_GAP;
  /* 案型字卡放大一點點：在「剛好完整顯示（單張高度）」的基礎上再乘1.3，
     讓字卡大小接近開播字卡——不再額外用寬度去限制縮小，寬度方向交給下面
     max-width:1125px + overflow:hidden 自然裁切，多出來的卡片會在右邊露出一點點、
     超過容器寬度的部分就不顯示，不用另外包一層算好寬度的小容器。 */
  var CARD_ENLARGE = 1.3;
  var scale = Math.min(1, (availH * CARD_ENLARGE) / h);

  /* 內容總寬度如果沒有超出容器可用寬度，用置中(justify-content:center)比較好看；
     如果超出了，改用靠左(flex-start)——置中的話，溢出的部分會左右對稱各裁掉一半，
     連第1張都會被裁到，不是使用者要的「只有右邊多出來的卡片露出一點點」。 */
  var cardOuterW = w * scale + frameCardPadX;
  var totalContentW = S.cardCount * cardOuterW + (S.cardCount - 1) * 20;
  var containerAvailW = Math.min(1125, areaRect.width - parseFloat(getComputedStyle(area).paddingLeft) - parseFloat(getComputedStyle(area).paddingRight));
  scroll.style.justifyContent = (totalContentW <= containerAvailW) ? 'center' : 'flex-start';

  for(var i=0;i<S.cardCount;i++){
    var id = '06_card_' + (i+1);
    var block = document.getElementById('card-block-'+i);
    var isNew = !block;

    if(isNew){
      block = document.createElement('div');
      block.id = 'card-block-'+i;
      block.style.cssText = 'flex-shrink:0;';
      block.innerHTML =
        '<div class="canvas-frame">'+
          '<div class="canvas-meta">'+
            '<span class="canvas-name">第 '+(i+1)+' 張</span>'+
            '<button class="canvas-dl-btn" style="margin-left:auto;" onclick="switchCard('+i+')">編輯這張</button>'+
            '<button class="canvas-dl-btn" onclick="downloadSingle(\''+id+'\')">⬇ 下載</button>'+
          '</div>'+
          '<div class="iframe-wrap" id="wrap-'+id+'"></div>'+
        '</div>';
      scroll.appendChild(block);
    }

    /* 不管是不是新卡片，尺寸相關的樣式每次都重新套用一次
       （視窗大小、張數變了，scale可能跟著變） */
    var metaEl = block.querySelector('.canvas-meta');
    var wrapEl = block.querySelector('#wrap-'+id);
    metaEl.style.width = (w*scale) + 'px';
    wrapEl.style.width  = (w*scale) + 'px';
    wrapEl.style.height = (h*scale) + 'px';

    if(isNew){
      var iframe = document.createElement('iframe');
      iframe.src = 'layouts/06_card.html';
      iframe.style.width = w + 'px';
      iframe.style.height = h + 'px';
      iframe.style.transform = 'scale('+scale+')';
      iframe.style.transformOrigin = 'top left';
      iframe.setAttribute('scrolling','no');
      wrapEl.appendChild(iframe);
      iframes[id] = iframe;
    } else {
      iframes[id].style.transform = 'scale('+scale+')';
    }
  }

  /* 張數變少了：把多出來的舊卡片block真的移除掉（連同它的iframe） */
  var extra = S.cardCount;
  while(true){
    var leftover = document.getElementById('card-block-'+extra);
    if(!leftover) break;
    var leftoverId = '06_card_' + (extra+1);
    delete iframes[leftoverId];
    leftover.remove();
    extra++;
  }

  updateCardStripActive();
}

/* 案型字卡橫向strip：目前正在右側編輯欄編輯的那張，畫布加一圈橘色outline，
   一眼看出對應關係。輕量更新，只切class，不重建整個strip（重建會讓iframe
   重新載入閃一下）——buildCardStrip()剛建好新一批block時、switchCard()
   切換編輯目標時都會呼叫這裡。 */
function updateCardStripActive(){
  for(var i=0;i<S.cardCount;i++){
    var wrapEl = document.getElementById('wrap-06_card_'+(i+1));
    if(wrapEl) wrapEl.classList.toggle('card-canvas-active', i === S.activeCard);
  }
}

/* ── 右側編輯欄：標題 + 依樣式產生的欄位（換頁在標題列 renderCardTitleNav；
   版型/新增張數在 card-panel-static，都在下方 renderCardPanel 統一觸發） ── */
function renderCardPanel(){
  ensureCards();
  var anchor = document.getElementById('card-panel-anchor');
  var body = document.getElementById('card-panel-body');
  var staticEl = document.getElementById('card-panel-static');
  if(!body) return;
  renderCardTitleNav();
  if(anchor) anchor.style.display = ''; // 標題列一律顯示（含+新增），只有下面內容依cardCount決定要不要出現
  if(!S.cardCount){
    // 這個廠商案型字卡目前沒開（工單「是否製作=false」，或整批一開始就是0），
    // 只留標題列（含+新增），下面版型/標題/文案先不顯示，等按了+才生出來
    body.innerHTML = '';
    if(staticEl) staticEl.innerHTML = '';
    return;
  }
  var i = S.activeCard;
  var c = S.cards[i];

  /* 版型：放在 card-panel-static（跟 card-panel-body 平行的另一個容器，不是它的
     子元素），所以不會被 flipCardPanel() 的 scaleX 翻頁動畫影響——這排維持靜止，
     只有下面標題/文案那塊會翻。新增/刪除張數移到標題列的 card-count-mini，
     見 renderCardTitleNav()。 */
  if(staticEl){
    staticEl.innerHTML =
      '<div class="field" style="margin-bottom:12px;">'+
        '<div class="field-label"><span>版型</span></div>'+
        '<select class="fi select-fi" onchange="setCardLayoutType(parseInt(this.value,10))">'+
          [1,2,3,4].map(function(n){
            return '<option value="'+n+'"'+(c.layoutType===n?' selected':'')+'>'+n+'</option>';
          }).join('') +
        '</select>'+
      '</div>';
  }

  var titleLen = cjkLen(c.title);
  var titleRow =
    '<div class="field">'+
      '<div class="field-label"><span>標題</span><span class="cc'+(titleLen>10?' over':'')+'" id="cc-card-title">'+titleLen+' / 10</span></div>'+
      '<input class="fi" value="'+escAttr(c.title)+'" oninput="updateCardTitle(this.value)">'+
    '</div>';

  /* 文案欄位：
     - 單欄位（樣式1/2/5）：.spring-field textarea，focus/blur 手動切class展開收合。
     - 雙欄位（樣式3/4，a/b左右兩段）：改成 .spring-group 包兩個獨立 .sf-input，
       中間一條曲線 .spring-divider 隔開，用 :focus-within 自動展開/收合（兩個input
       之間切tab焦點時，group整體還算focus-within，不會誤收合）。次要文案(b)沒填時
       用 placeholder 顯示淺色斜體提示文字，不會佔用實際內容。
     標籤統一「第N行」，不再顯示「樣式X・欄位名」。 */
  var rowsHtml = c.rows.map(function(row, ri){
    var def = STYLE_DEFS[row.style];
    var overflowThisRow = c._overflow && c._overflow[ri];
    var lineLabel = '第'+(ri+1)+'行';
    var fieldHtml;
    if(def.fields.length > 1){
      var fa = def.fields[0], fb = def.fields[1];
      var va = row[fa]||'', vb = row[fb]||'';
      var maxA = def.max[fa], maxB = def.max[fb];
      var lenA = cjkLen(va), lenB = cjkLen(vb);
      var overA = lenA>maxA, overB = lenB>maxB;
      fieldHtml =
        '<div class="field-label"><span>'+lineLabel+'</span>'+
          '<span class="cc'+((overA||overB)?' over':'')+'" id="cc-row-'+ri+'">'+lenA+'/'+maxA+'・'+lenB+'/'+maxB+'</span>'+
        '</div>'+
        '<div class="spring-group">'+
          '<textarea class="sf-input" rows="1" placeholder="'+escAttr(def.label[fa])+'" '+
            'oninput="updateCardRowField('+ri+',\''+fa+'\',this.value)">'+escAttr(va)+'</textarea>'+
          '<div class="spring-divider"></div>'+
          '<textarea class="sf-input" rows="1" placeholder="'+escAttr(def.label[fb])+'" '+
            'oninput="updateCardRowField('+ri+',\''+fb+'\',this.value)">'+escAttr(vb)+'</textarea>'+
        '</div>';
    } else {
      var f = def.fields[0];
      var val = row[f]||''; var max = def.max[f];
      var lenVal = cjkLen(val);
      fieldHtml =
        '<div class="field-label"><span>'+lineLabel+'</span><span class="cc'+(lenVal>max?' over':'')+'" id="cc-row-'+ri+'">'+lenVal+' / '+max+'</span></div>'+
        '<textarea class="spring-field" rows="1" '+
          'onfocus="this.classList.add(\'expanded\')" onblur="this.classList.remove(\'expanded\')" '+
          'oninput="updateCardRowField('+ri+',\''+f+'\',this.value)">'+escAttr(val)+'</textarea>';
    }
    return '<div class="field" style="margin-top:10px;">'+
      fieldHtml +
      (overflowThisRow ? '<div style="font-size:11px;color:var(--accent);padding:2px 0 4px;">⚠ 這行文字加總超出作圖區安全寬度，畫布上暫時不會顯示，麻煩縮短內容</div>' : '') +
    '</div>';
  }).join('');

  body.innerHTML = titleRow + rowsHtml;
}

/* 標題列：換頁箭頭放右側（card-title-nav，特意放在 #card-panel-body 外面，
   翻頁動畫不會影響到它），只留箭頭本身（.icon-btn：無外框無圓圈），中間不放
   頁碼數字；因為 #card-title-nav 本身在 .sg-label 那排就是靠右對齊，下一頁
   箭頭排在最後面＝整排最右邊。
   新增/刪除張數放回標題文字後面（card-count-mini），故意縮到更小、灰色
   （.icon-btn-mini）——這個動作不重要，不需要跟換頁搶視覺份量。
   cardCount=0（這個廠商案型字卡目前沒開）時，只留一個「＋」讓使用者可以自己
   手動開啟；沒有卡片可以換頁/刪除，換頁箭頭跟「－」都不顯示。 */
function renderCardTitleNav(){
  var nav = document.getElementById('card-title-nav');
  var countMini = document.getElementById('card-count-mini');
  if(!nav && !countMini) return;
  if(!S.cardCount){
    if(nav) nav.innerHTML = '';
    if(countMini){
      countMini.innerHTML =
        '<button class="icon-btn-mini" onclick="setCardCount(1)" title="新增一張，開啟案型字卡" style="font-size:13px;">＋</button>';
    }
    return;
  }
  var i = S.activeCard;
  var iconLeft  = '<svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 1.5 2.5 5l4 3.5"/></svg>';
  var iconRight = '<svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 1.5 7.5 5l-4 3.5"/></svg>';
  if(nav){
    nav.innerHTML =
      '<button class="icon-btn" onclick="switchCard('+(i-1)+')" '+(i<=0?'disabled':'')+' title="上一張（'+(i)+'／'+S.cardCount+'）">'+iconLeft+'</button>'+
      '<button class="icon-btn" onclick="switchCard('+(i+1)+')" '+(i>=S.cardCount-1?'disabled':'')+' title="下一張（'+(i+2)+'／'+S.cardCount+'）">'+iconRight+'</button>';
  }
  if(countMini){
    countMini.innerHTML =
      '<button class="icon-btn-mini" onclick="setCardCount('+(S.cardCount-1)+')" '+(S.cardCount<=CARD_MIN?'disabled':'')+' title="刪除最後一張">－</button>'+
      '<span id="card-nav-count" class="step-val" style="font-size:11px;color:var(--text-dim);">'+S.cardCount+'</span>'+
      '<button class="icon-btn-mini" onclick="setCardCount('+(S.cardCount+1)+')" '+(S.cardCount>=CARD_MAX?'disabled':'')+' title="新增一張">＋</button>';
  }
}

/* 數字變化時的「跳一下」效果——重新render過的元素不會自帶動畫，這裡手動移除再加回
   class強制觸發一次reflow，讓CSS transition重新起跑。 */
function bumpEl(id){
  var el = document.getElementById(id);
  if(!el) return;
  el.classList.remove('bump');
  void el.offsetWidth; // 強制reflow，讓瀏覽器先確定拿掉class的狀態，才能重新觸發同一個動畫
  el.classList.add('bump');
  setTimeout(function(){ el.classList.remove('bump'); }, 350);
}

/* 中英數混排的字數計算：全形（中文、全形符號等）算1個字，半形（英文/數字/
   基本符號，0x20~0x7E的ASCII可見字元）算0.5個字——比單純數.length準，
   英數字實際版面寬度只有中文字的一半左右，用.length算會低估能塞多少字。
   頓號「、」雖然Unicode算全形標點，但實際字型渲染通常偏窄（標點擠壓），
   也一併算0.5——之後如果還有其他標點符號感覺算錯，加進 HALF_WIDTH_EXTRA 就好。 */
var HALF_WIDTH_EXTRA = '、';
function cjkLen(s){
  s = String(s||'');
  var n = 0;
  for(var i=0;i<s.length;i++){
    var ch = s[i];
    var code = s.charCodeAt(i);
    var isHalf = (code >= 0x20 && code <= 0x7E) || HALF_WIDTH_EXTRA.indexOf(ch) >= 0;
    n += isHalf ? 0.5 : 1;
  }
  return n;
}

function escAttr(s){
  return String(s||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
}

/* ── BN_READY / BN_CARD_OVERFLOW ── */
window.addEventListener('message', function(e){
  var msg = e.data;
  if(!msg || !msg.type) return;

  if(msg.type === 'BN_READY'){
    Object.keys(iframes).forEach(function(id){
      if(id.indexOf('06_card_') !== 0) return;
      var ifr = iframes[id];
      if(ifr && ifr.contentWindow === e.source){
        var idx = parseInt(id.split('_')[2], 10) - 1;
        broadcastCard(idx);
      }
    });
  }

  else if(msg.type === 'BN_CARD_OVERFLOW'){
    Object.keys(iframes).forEach(function(id){
      if(id.indexOf('06_card_') !== 0) return;
      var ifr = iframes[id];
      if(ifr && ifr.contentWindow === e.source){
        var idx = parseInt(id.split('_')[2], 10) - 1;
        ensureCards();
        if(S.cards[idx]){
          S.cards[idx]._overflow = msg.overflow;
          if(idx === S.activeCard) renderCardPanel();
        }
      }
    });
  }
});
