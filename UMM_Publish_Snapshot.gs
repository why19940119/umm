/**
 * ============================================================================
 * UMM Dashboard Snapshot Builder, Drive Publisher, and Cloudflare D1 Notifier
 * ============================================================================
 * Sole implementation of publishUmmSnapshotForDashboard / buildUmmDashboardSnapshot_.
 * Do not redefine these in UMM_Dashboard_Publisher.gs (legacy Pipedream path removed).
 * WP-UMM-3: pass through NON_TRADING / STALE flags; never publish scary % for those rows.
 */
const UMM_FOLDER_ID = '1rkF6g7-qP2rIEP21F_P6lsM-4KCBUu7t';
const SNAPSHOT_FILE_NAME = 'umm_snapshot.json';
const CLOUDFLARE_SNAPSHOT_URL = 'https://umm-dashboard.65ng8nnrjp.workers.dev/api/snapshot';
const UMM_REFRESH_SECRET_PROPERTY = 'UMM_REFRESH_SECRET';

const UMM_XA_PUBLISHABLE_STATUSES = {
  SUCCESS: true,
  STALE: true,
  NON_TRADING: true
};

function buildUmmDashboardSnapshot_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const getRows = name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet || sheet.getLastRow() < 2) return [];
    return sheet.getDataRange().getValues().slice(1);
  };
  const allowed = ['XLC','XLY','XLP','XLE','XLF','XLV','XLI','XLB','XLRE','XLK','XLU'];
  const sectors = getRows('US_11_Sectors')
    .filter(r => allowed.includes(String(r[1]).trim().toUpperCase()))
    .map(r => ({
      ticker: resolveUmmCanonicalSymbol_(r[1]),
      name: r[2],
      lastPrice: r[3],
      dayChangePct: r[4],
      dayChangeDollar: r[5],
      range52wPosition: r[6],
      high52w: r[7],
      low52w: r[8],
      vsSpy5d: r[9],
      vsSpy20d: r[10],
      classification: r[11]
    }));

  const groups = {};
  getRows('Daily_Snapshot').forEach(r => {
    if (r[0] && r[3] === 'COMPLETE') {
      if (!groups[r[0]]) groups[r[0]] = [];
      groups[r[0]].push(r);
    }
  });
  const ids = Object.keys(groups).filter(id => groups[id].length === 11);
  const id = ids.length ? ids[ids.length - 1] : '';
  const rows = id ? groups[id] : [];
  const report = [...getRows('AI_Report')].reverse()
    .find(r => r[5] === id && (r[4] === 'SUCCESS' || r[4] === 'MANUAL_SUCCESS')) || [];

  const xa = getRows('CrossAsset_Snapshot');
  let xaId = '';
  for (let i = xa.length - 1; i >= 0; i--) {
    const status = String(xa[i][3] || '');
    if (xa[i][0] && UMM_XA_PUBLISHABLE_STATUSES[status]) {
      xaId = xa[i][0];
      break;
    }
  }
  const xaRows = xa.filter(r => r[0] === xaId && UMM_XA_PUBLISHABLE_STATUSES[String(r[3] || '')]);
  const crossAssets = xaRows.map(r => {
    const dataStatus = String(r[3] || '');
    const instrumentId = resolveUmmInstrumentId_(r[4], r[6]) || String(r[4] || '').trim();
    const canonicalSymbol = String(r[11] || '').trim() || resolveUmmCanonicalSymbol_(instrumentId);
    const emitPct = dataStatus === 'SUCCESS';
    const rawPct = r[8];
    const dayChangePct = emitPct && !(rawPct === '' || rawPct === null) ? rawPct : null;
    return {
      instrumentId: instrumentId,
      displayName: r[5],
      symbol: canonicalSymbol || r[6] || '',
      canonicalSymbol: canonicalSymbol,
      lastPrice: r[7],
      dayChangePct: dayChangePct,
      priceUnit: r[9],
      mappingStatus: r[10],
      dataStatus: dataStatus,
      asOfHkt: r[1] || '',
      sourceTimestampHkt: r[12] || '',
      quoteAsOfEt: r[13] || '',
      dataAgeMinutes: r[14] === '' || r[14] === null || r[14] === undefined ? null : r[14]
    };
  });

  const generatedAtHkt = Utilities.formatDate(new Date(), 'Asia/Hong_Kong', 'yyyy-MM-dd HH:mm:ss');
  const publishId = 'PUB_' + generatedAtHkt.replace(/[-:\s]/g, '');

  const xaAsOfCandidates = crossAssets
    .map(x => x.sourceTimestampHkt || x.asOfHkt)
    .filter(Boolean)
    .sort()
    .reverse();
  const crossAssetAsOfHkt = xaAsOfCandidates.length ? xaAsOfCandidates[0] : '';

  return {
    source: 'umm',
    generatedAtHkt: generatedAtHkt,
    publishId: publishId,
    reportAsOfHkt: crossAssetAsOfHkt || (rows[0] ? rows[0][1] : '') || generatedAtHkt,
    crossAssetAsOfHkt: crossAssetAsOfHkt,
    latestSnapshot: id ? {
      snapshotId: id,
      timestampHkt: rows[0][1],
      marketDateEt: rows[0][2],
      status: rows[0][3]
    } : null,
    sectors: sectors,
    crossAssets: crossAssets,
    aiReport: report.length ? {
      reportTimeHkt: report[0],
      marketDateEt: report[1],
      status: report[4],
      snapshotId: report[5],
      content: report[6],
      notificationStatus: report[8]
    } : null
  };
}

function previewUmmDashboardSnapshot() {
  const snapshot = buildUmmDashboardSnapshot_();
  Logger.log(JSON.stringify(snapshot, null, 2));
  return snapshot;
}

function notifyCloudflareD1UmmDashboard_(snapshot) {
  try {
    const headers = { 'Content-Type': 'application/json' };
    const secret = PropertiesService.getScriptProperties().getProperty(UMM_REFRESH_SECRET_PROPERTY);
    if (secret) {
      headers['X-UMM-Publish-Secret'] = secret;
    }
    const response = UrlFetchApp.fetch(CLOUDFLARE_SNAPSHOT_URL, {
      method: 'post',
      headers: headers,
      payload: JSON.stringify(snapshot),
      muteHttpExceptions: true
    });
    const statusCode = response.getResponseCode();
    const body = response.getContentText();
    const status = statusCode >= 200 && statusCode < 300 ? 'SUCCESS' : 'FAILED_HTTP_' + statusCode;
    Logger.log('[Cloudflare D1] ' + status + ': ' + body);
    return { status: status, httpStatus: statusCode, response: body };
  } catch (error) {
    Logger.log('[Cloudflare D1] FAILED_EXCEPTION: ' + error.toString());
    return { status: 'FAILED_EXCEPTION', error: error.toString() };
  }
}

/**
 * Publish current dashboard payload to Drive + Cloudflare D1.
 * Returns status SUCCESS only when Cloudflare D1 write succeeds.
 * Pipedream is no longer part of this path (legacy webhook returned 400 and never updated D1).
 */
function publishUmmSnapshotForDashboard() {
  const snapshot = buildUmmDashboardSnapshot_();
  const folder = DriveApp.getFolderById(UMM_FOLDER_ID);
  const jsonContent = JSON.stringify(snapshot, null, 2);
  const files = folder.getFilesByName(SNAPSHOT_FILE_NAME);
  let file;
  if (files.hasNext()) {
    file = files.next();
    file.setContent(jsonContent);
  } else {
    const blob = Utilities.newBlob(jsonContent, 'application/json', SNAPSHOT_FILE_NAME);
    file = folder.createFile(blob);
  }
  const cloudflare = notifyCloudflareD1UmmDashboard_(snapshot);
  const ok = cloudflare && cloudflare.status === 'SUCCESS';
  const result = {
    status: ok ? 'SUCCESS' : 'FAILED_CLOUDFLARE',
    fileName: file.getName(),
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    folderUrl: folder.getUrl(),
    snapshotId: snapshot.latestSnapshot ? snapshot.latestSnapshot.snapshotId : null,
    publishId: snapshot.publishId,
    generatedAtHkt: snapshot.generatedAtHkt,
    reportAsOfHkt: snapshot.reportAsOfHkt,
    cloudflare: cloudflare
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function createUmmFolderIfNotExists() {
  const root = DriveApp.getRootFolder();
  const folders = root.getFolders();
  let ummFolder = null;
  while (folders.hasNext()) {
    const f = folders.next();
    if (f.getName() === 'UMM') {
      ummFolder = f;
      break;
    }
  }
  if (!ummFolder) ummFolder = DriveApp.createFolder('UMM');
  const result = { name: ummFolder.getName(), id: ummFolder.getId(), url: 'https://drive.google.com/drive/folders/' + ummFolder.getId() };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
