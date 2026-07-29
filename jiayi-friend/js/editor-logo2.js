'use strict';

/*
  editor-logo2.js
  Logo2 在 editor 端的訊息收發，獨立成自己的 message 監聽器，
  不用去改 editor-canvas-ui.js 裡既有的 host 訊息處理邏輯（兩邊互不影響）。

  現況：
    - S.imgs.logo2、collectState/applyState、broadcastFull 這些既有機制
      本來就已經把 logo2 當一般圖片欄位在存/傳了（跟 logo1 同一套），不用重做
    - 這裡只補「版位那邊點擊 logo2（換圖／刪除／編輯）時，editor 要怎麼反應」

  之後要接裁切編輯器（比照 host 的 openEraseEditor 模式），
  就在 BN_OPEN_EDITOR 那個分支裡接，其他地方不用動。
*/
(function(){

  window.addEventListener('message', function(e){
    var msg = e.data;
    if(!msg || !msg.type) return;

    if(msg.type === 'BN_REPLACE_IMG' && msg.key === 'logo2'){
      var input = document.getElementById('logo2Up');
      if(input) input.click();
    }
    else if(msg.type === 'BN_DELETE_IMG' && msg.key === 'logo2'){
      clearLogo2();
    }
    else if(msg.type === 'BN_OPEN_EDITOR' && msg.key === 'logo2'){
      // TODO：之後接裁切編輯器，先給個提示避免點了沒反應看起來像壞掉
      toast('logo2 編輯器尚未接上，先用「更換」上傳新圖','err');
    }
  });

  window.clearLogo2 = function(){
    S.imgs.logo2 = null;
    var img = document.getElementById('logo2-img');
    if(img){ img.src=''; }
    var item = document.getElementById('logo2-item');
    if(item) item.style.display='none';
    broadcastFull();
    toast('logo2 已移除','ok');
  };

})();
