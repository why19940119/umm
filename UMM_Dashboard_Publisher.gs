/** Read-only dashboard snapshot builder. Run previewUmmDashboardSnapshot() manually. */
function buildUmmDashboardSnapshot_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const getRows = name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return [];
    return sheet.getDataRange().getValues().slice(1);
  };
  const allowed = ['XLC','XLY','XLP','XLE','XLF','XLV','XLI','XLB','XLRE','XLK','XLU'];
  const sectors = getRows('US_11_Sectors').filter(r => allowed.includes(String(r[1]).trim().toUpperCase())).map(r => ({ticker:r[1],name:r[2],lastPrice:r[3],dayChangePct:r[4],dayChangeDollar:r[5],range52wPosition:r[6],high52w:r[7],low52w:r[8],vsSpy5d:r[9],vsSpy20d:r[10],classification:r[11]}));
  const groups = {};
  getRows('Daily_Snapshot').forEach(r => { if (r[0] && r[3] === 'COMPLETE') (groups[r[0]] ||= []).push(r); });
  const ids = Object.keys(groups).filter(id => groups[id].length === 11);
  const id = ids.length ? ids[ids.length - 1] : '';
  const rows = id ? groups[id] : [];
  const report = [...getRows('AI_Report')].reverse().find(r => r[5] === id && (r[4] === 'SUCCESS' || r[4] === 'MANUAL_SUCCESS')) || [];
  const xa = getRows('CrossAsset_Snapshot');
  const xaId = [...xa].reverse().find(r => r[0] && r[3] === 'SUCCESS')?.[0] || '';
  const crossAssets = xa.filter(r => r[0] === xaId && r[3] === 'SUCCESS').map(r => ({instrumentId:r[4],displayName:r[5],symbol:r[6],lastPrice:r[7],dayChangePct:r[8],priceUnit:r[9],mappingStatus:r[10]}));
  return {source:'umm',generatedAtHkt:Utilities.formatDate(new Date(),'Asia/Hong_Kong','yyyy-MM-dd HH:mm:ss'),latestSnapshot:id?{snapshotId:id,timestampHkt:rows[0][1],marketDateEt:rows[0][2],status:rows[0][3]}:null,sectors:sectors,crossAssets:crossAssets,aiReport:report.length?{reportTimeHkt:report[0],marketDateEt:report[1],status:report[4],snapshotId:report[5],content:report[6],notificationStatus:report[8]}:null};
}
function previewUmmDashboardSnapshot() {
  const snapshot = buildUmmDashboardSnapshot_();
  Logger.log(JSON.stringify(snapshot, null, 2));
  return snapshot;
}
