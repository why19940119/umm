/**
 * WP-UMM-3 Cross-Asset session / freshness guards + snapshot create.
 * Loaded with CrossAsset_Monitor_Extension.gs (no duplicate function names).
 */

const XA_SNAPSHOT_HEADERS = [
  'Snapshot ID', 'Data Timestamp HKT', 'Market Date ET', 'Data Status',
  'Instrument ID', 'Display Name', 'GoogleFinance Symbol', 'Last Price',
  'Day Change %', 'Price Unit', 'Mapping Status',
  'Canonical Symbol', 'Source Timestamp HKT', 'Quote As-Of ET', 'Data Age Minutes'
];

function classifyXaQuoteSession_(sourceTimestampHKT, ageMinutes, now) {
  const nowDate = now || new Date();
  const marketDateET = Utilities.formatDate(nowDate, 'America/New_York', 'yyyy-MM-dd');
  const nonTrading = xaIsNonTradingDayET_(nowDate);

  let quoteAsOfEt = '';
  if (sourceTimestampHKT) {
    const parsed = xaParseHktTimestamp_(sourceTimestampHKT);
    if (parsed) {
      quoteAsOfEt = Utilities.formatDate(parsed, 'America/New_York', 'yyyy-MM-dd');
    }
  }

  if (nonTrading) {
    return {
      status: 'NON_TRADING',
      emitPct: false,
      quoteAsOfEt: quoteAsOfEt,
      ageMinutes: ageMinutes,
      reason: 'US equity session closed (weekend/holiday)'
    };
  }

  if (quoteAsOfEt && quoteAsOfEt !== marketDateET) {
    return {
      status: 'STALE',
      emitPct: false,
      quoteAsOfEt: quoteAsOfEt,
      ageMinutes: ageMinutes,
      reason: 'Quote as-of ET date does not match expected US session date'
    };
  }

  if (ageMinutes !== null && ageMinutes !== '' && Number.isFinite(Number(ageMinutes)) &&
      Number(ageMinutes) > FRESHNESS_WARNING_THRESHOLD_MINUTES) {
    return {
      status: 'STALE',
      emitPct: false,
      quoteAsOfEt: quoteAsOfEt || marketDateET,
      ageMinutes: Number(ageMinutes),
      reason: 'Quote age exceeds freshness threshold'
    };
  }

  return {
    status: 'SUCCESS',
    emitPct: true,
    quoteAsOfEt: quoteAsOfEt || marketDateET,
    ageMinutes: ageMinutes,
    reason: ''
  };
}

function xaIsNonTradingDayET_(now) {
  const nowDate = now || new Date();
  const etDay = Utilities.formatDate(nowDate, 'America/New_York', 'u');
  if (etDay === '6' || etDay === '7') return true;
  const marketDateET = Utilities.formatDate(nowDate, 'America/New_York', 'yyyy-MM-dd');
  return xaIsUsMarketHoliday_(marketDateET);
}

function xaIsUsMarketHoliday_(marketDateET) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const calendarSheet = ss.getSheetByName(CONFIG_XA.SHEET_CALENDAR);
  if (!calendarSheet || calendarSheet.getLastRow() < 2) return false;
  const rows = calendarSheet.getRange(2, 1, calendarSheet.getLastRow() - 1, 2).getDisplayValues();
  return rows.some(([date, isTradingDay]) =>
    date.trim() === marketDateET && isTradingDay.trim().toUpperCase() === 'FALSE'
  );
}

function xaParseHktTimestamp_(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}+08:00`;
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d : null;
}

function createCrossAssetSnapshot() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName(CONFIG_XA.SHEET_XA_CONFIG);
  const snapshotSheet = ss.getSheetByName(CONFIG_XA.SHEET_XA_SNAPSHOT);
  if (!configSheet || !snapshotSheet) throw new Error('找不到 CrossAsset_Config 或 CrossAsset_Snapshot。');
  SpreadsheetApp.flush();

  const now = new Date();
  const marketDateET = Utilities.formatDate(now, 'America/New_York', 'yyyy-MM-dd');
  const nowHKT = Utilities.formatDate(now, 'Asia/Hong_Kong', 'yyyy-MM-dd HH:mm:ss');
  const snapshotId = `XA_SNAP_${marketDateET.replace(/-/g, '')}_${Utilities.formatDate(now, 'Asia/Hong_Kong', 'HHmmss')}`;

  const headerRow = configSheet.getRange(1, 1, 1, configSheet.getLastColumn()).getValues()[0];
  const col = name => headerRow.indexOf(name);
  const tsCol = col('Source Timestamp HKT');
  const ageCol = col('Data Age Minutes');
  const lastCol = Math.max(configSheet.getLastColumn(), 10);

  const configData = configSheet.getRange(2, 1, configSheet.getLastRow() - 1, lastCol).getValues();
  const rowsToInsert = [];
  let anyPublishable = false;
  let anyFreshSuccess = false;
  const sourceTimestamps = [];

  for (const row of configData) {
    const instId = row[0];
    const displayName = row[1];
    const gfSymbol = row[3];
    const mappingStatus = row[4];
    const priceUnit = row[5];
    const enabled = row[7];
    const livePrice = row[8];
    const liveChange = row[9];
    const sourceTs = tsCol >= 0 ? row[tsCol] : '';
    const ageMinutes = ageCol >= 0 ? row[ageCol] : null;
    const canonical = resolveUmmCanonicalSymbol_(instId);
    const resolvedId = resolveUmmInstrumentId_(instId, gfSymbol) || String(instId || '').trim();

    if (!enabled || mappingStatus === 'PENDING_MAPPING') {
      rowsToInsert.push([
        snapshotId, nowHKT, marketDateET, 'SKIPPED_UNVERIFIED_MAPPING',
        resolvedId, displayName, gfSymbol || '', '', '', priceUnit, mappingStatus,
        canonical, '', '', ''
      ]);
      continue;
    }

    if (isInvalidXaNumericValue_(livePrice)) {
      rowsToInsert.push([
        snapshotId, nowHKT, marketDateET, 'INVALID_DATA',
        resolvedId, displayName, gfSymbol || '', livePrice, '', priceUnit, mappingStatus,
        canonical, sourceTs || '', '', ageMinutes === null || ageMinutes === '' ? '' : ageMinutes
      ]);
      continue;
    }

    const session = classifyXaQuoteSession_(sourceTs, ageMinutes, now);
    const rowAsOfHkt = sourceTs ? String(sourceTs).trim() : nowHKT;
    let dayChangePct = '';
    if (session.emitPct && !isInvalidXaNumericValue_(liveChange)) {
      dayChangePct = liveChange;
    }
    if (!session.emitPct) dayChangePct = '';

    const dataStatus = session.status;
    rowsToInsert.push([
      snapshotId, rowAsOfHkt, marketDateET, dataStatus,
      resolvedId, displayName, gfSymbol || '', livePrice, dayChangePct, priceUnit, mappingStatus,
      canonical, sourceTs || '', session.quoteAsOfEt || '', ageMinutes === null || ageMinutes === '' ? '' : ageMinutes
    ]);

    anyPublishable = true;
    if (dataStatus === 'SUCCESS') anyFreshSuccess = true;
    if (sourceTs) sourceTimestamps.push(String(sourceTs).trim());
  }

  const existingHeader = snapshotSheet.getRange(1, 1, 1, XA_SNAPSHOT_HEADERS.length).getValues()[0];
  if (String(existingHeader[0]).trim() !== 'Snapshot ID' || existingHeader.length < XA_SNAPSHOT_HEADERS.length ||
      String(existingHeader[11] || '').trim() !== 'Canonical Symbol') {
    snapshotSheet.getRange(1, 1, 1, XA_SNAPSHOT_HEADERS.length).setValues([XA_SNAPSHOT_HEADERS]);
  }

  if (rowsToInsert.length) {
    snapshotSheet.getRange(snapshotSheet.getLastRow() + 1, 1, rowsToInsert.length, rowsToInsert[0].length).setValues(rowsToInsert);
  }
  SpreadsheetApp.flush();

  const reportAsOfHkt = sourceTimestamps.length
    ? sourceTimestamps.slice().sort().reverse()[0]
    : nowHKT;

  return {
    snapshotId: anyPublishable ? snapshotId : '',
    marketDateET: marketDateET,
    reportAsOfHkt: reportAsOfHkt,
    hasFreshSuccess: anyFreshSuccess,
    status: anyPublishable ? 'SUCCESS' : 'FAILED_NO_VALID_INSTRUMENT'
  };
}

function runCrossAssetPipelineWithFreshness() {
  updateYahooLivePricesWithFreshness_();
  runCrossAssetPipeline();
}

function runCrossAssetPipelineWithAllGuards() {
  const now = new Date();
  if (xaIsNonTradingDayET_(now)) {
    updateYahooLivePricesWithFreshness_();
    createCrossAssetSnapshot();
    return { status: 'SKIPPED_NON_TRADING_DAY' };
  }
  return runCrossAssetPipelineWithFreshness();
}

function setupCrossAssetConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG_XA.SHEET_XA_CONFIG) || ss.insertSheet(CONFIG_XA.SHEET_XA_CONFIG);
  sheet.clear();
  const headers = [
    'Instrument ID', 'Display Name', 'Asset Class', 'GoogleFinance Symbol',
    'Mapping Status', 'Price Unit', 'Currency', 'Enabled',
    'Live Price (Formula)', 'Live Day Change % (Formula)', 'Notes', 'Last Setup At HKT',
    'Source Timestamp HKT', 'Data Age Minutes', 'Canonical Symbol'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  const nowHKT = Utilities.formatDate(new Date(), 'Asia/Hong_Kong', 'yyyy-MM-dd HH:mm:ss');
  const rows = XA_INSTRUMENTS.map(inst => {
    const canonical = resolveUmmCanonicalSymbol_(inst.id);
    return [
      inst.id, inst.displayName, inst.assetClass, inst.gfSymbol || '',
      inst.mappingStatus, inst.priceUnit, inst.currency, inst.enabled,
      '', '', inst.notes, nowHKT, '', '', canonical
    ];
  });
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  XA_INSTRUMENTS.forEach((inst, idx) => {
    const rowIndex = idx + 2;
    if (YAHOO_SOURCE_MAP[inst.id]) {
      sheet.getRange(rowIndex, 9).setValue('');
      sheet.getRange(rowIndex, 10).setValue('');
    } else if (inst.gfSymbol) {
      sheet.getRange(rowIndex, 9).setFormula(`=IFERROR(GOOGLEFINANCE("${inst.gfSymbol}"),"N/A")`);
      sheet.getRange(rowIndex, 10).setFormula(`=IFERROR(GOOGLEFINANCE("${inst.gfSymbol}","changepct"),"N/A")`);
    } else {
      sheet.getRange(rowIndex, 9).setValue('NOT_AVAILABLE');
      sheet.getRange(rowIndex, 10).setValue('NOT_AVAILABLE');
    }
  });
  SpreadsheetApp.flush();
}

function setupCrossAssetSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let snapshotSheet = ss.getSheetByName(CONFIG_XA.SHEET_XA_SNAPSHOT) || ss.insertSheet(CONFIG_XA.SHEET_XA_SNAPSHOT);
  snapshotSheet.clear();
  snapshotSheet.getRange(1, 1, 1, XA_SNAPSHOT_HEADERS.length).setValues([XA_SNAPSHOT_HEADERS]);
  let aiReportSheet = ss.getSheetByName(CONFIG_XA.SHEET_XA_AI_REPORT) || ss.insertSheet(CONFIG_XA.SHEET_XA_AI_REPORT);
  aiReportSheet.getRange(1, 1, 1, 9).setValues([['Report Time HKT', 'Market Date ET', 'Data Timestamp HKT', 'Model', 'Status', 'Snapshot ID', 'AI Report', 'Error Message', 'Notification Status']]);
  SpreadsheetApp.flush();
}

function runCrossAssetPipeline() {
  const props = PropertiesService.getScriptProperties();
  const runningFlag = props.getProperty(CONFIG_XA.LOCK_FLAG_KEY);
  if (runningFlag && (Date.now() - Number(runningFlag)) < 5 * 60 * 1000) return;
  props.setProperty(CONFIG_XA.LOCK_FLAG_KEY, String(Date.now()));
  try {
    const snapshotRes = createCrossAssetSnapshot();
    if (snapshotRes.status !== 'SUCCESS') return;
    const aiRes = generateCrossAssetAIReport_(snapshotRes.snapshotId, snapshotRes.marketDateET, 'AUTO');
    if (aiRes.status !== 'SUCCESS' && aiRes.status !== 'SKIPPED_ALREADY_EXISTS') return;
    sendCrossAssetReportEmail_(snapshotRes.snapshotId);
  } finally {
    props.deleteProperty(CONFIG_XA.LOCK_FLAG_KEY);
  }
}

function isInvalidXaNumericValue_(value) {
  const text = String(value).trim();
  return value === '' || value === null || text === 'N/A' || text === 'NOT_AVAILABLE' || text.includes('#') || text.includes('Loading') || !Number.isFinite(Number(value));
}
