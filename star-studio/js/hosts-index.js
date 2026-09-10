/* ══════════════════════════════════════
   js/hosts-index.js
   主持人圖庫清單（對應 hosts/ 資料夾實際內容）

   新增主持人：
   1. 去背圖放進 hosts/姓名/姓名-1.png、姓名-2.png ...（連號命名）
   2. 在下面陣列加一筆 { name:'姓名', count:張數 }

   這份清單是唯一的真實來源（single source of truth）：
   掃描圖庫、選圖順序、進度條，全部依照這裡的順序與張數，
   不再由程式碼裡另外猜測資料夾內容，才不會跟 hosts/ 實際檔案脫節。
══════════════════════════════════════ */
var BN_HOSTS = [
  { name: 'Nancy', count: 3 },
  { name: 'Penny', count: 4 },
  { name: 'Sunny', count: 4 },
  { name: '亞莎', count: 4 },
  { name: '何偉綸', count: 3 },
  { name: '凱特', count: 4 },
  { name: '周庭安', count: 3 },
  { name: '張維尼', count: 3 },
  { name: '郁婷', count: 3 },
];

if (typeof window._bn_hosts_scan_cb === 'function') window._bn_hosts_scan_cb(BN_HOSTS);
