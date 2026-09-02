/**
 * ============================================================================
 * US Market Monitor — Cross-Asset Extension (Parts 1 - 7)
 * ============================================================================
 */

const CONFIG_XA = {
  SHEET_XA_CONFIG: 'CrossAsset_Config',
  SHEET_XA_SNAPSHOT: 'CrossAsset_Snapshot',
  SHEET_XA_AI_REPORT: 'CrossAsset_AI_Report',
  PROP_OPENROUTER_KEY_XA: CONFIG.PROP_OPENROUTER_KEY,
  OPENROUTER_URL_XA: CONFIG.OPENROUTER_URL,
  RECIPIENT_EMAILS_XA: CONFIG.RECIPIENT_EMAILS,
  AI_MODEL_XA: CONFIG.AI_MODEL,
  LOCK_FLAG_KEY: 'XA_PIPELINE_RUNNING'
};

const XA_INSTRUMENTS = [
  { id: 'VIX_INDEX', displayName: '.VIX 恐慌指數', assetClass: 'Volatility', gfSymbol: 'INDEXCBOE:VIX', mappingStatus: 'ATTEMPT_VERIFY_REQUIRED', priceUnit: 'Index Points', currency: 'N/A', enabled: true, notes: 'GOOGLEFINANCE 官方支援。' },
  { id: 'USD_INDEX', displayName: 'USDindex 美元指數 (DXY)', assetClass: 'FX Index', gfSymbol: null, mappingStatus: 'PENDING_MAPPING', priceUnit: 'Index Points', currency: 'USD', enabled: false, notes: 'Yahoo Finance' },
  { id: 'SOX_INDEX', displayName: '.SOX 費城半導體指數', assetClass: 'Equity Index', gfSymbol: null, mappingStatus: 'PENDING_MAPPING', priceUnit: 'Index Points', currency: 'USD', enabled: false, notes: 'Yahoo Finance' },
  { id: 'ZT_FUT', displayName: 'ZTmain 2年期美債期貨', assetClass: 'Bond Futures', gfSymbol: null, mappingStatus: 'PENDING_MAPPING', priceUnit: 'Futures Price', currency: 'USD', enabled: false, notes: 'Yahoo Finance' },
  { id: 'ZN_FUT', displayName: 'ZNmain 10年期美債期貨', assetClass: 'Bond Futures', gfSymbol: null, mappingStatus: 'PENDING_MAPPING', priceUnit: 'Futures Price', currency: 'USD', enabled: false, notes: 'Yahoo Finance' },
  { id: 'BZ_FUT', displayName: 'BZmain Brent原油期貨', assetClass: 'Energy Futures', gfSymbol: null, mappingStatus: 'PENDING_MAPPING', priceUnit: 'USD/Barrel', currency: 'USD', enabled: false, notes: 'Yahoo Finance' },
  { id: 'CL_FUT', displayName: 'CLmain WTI原油期貨', assetClass: 'Energy Futures', gfSymbol: null, mappingStatus: 'PENDING_MAPPING', priceUnit: 'USD/Barrel', currency: 'USD', enabled: false, notes: 'Yahoo Finance' },
  { id: 'XAU_USD', displayName: 'XAUUSD 黃金/美元', assetClass: 'Precious Metal Spot', gfSymbol: 'CURRENCY:XAUUSD', mappingStatus: 'ATTEMPT_VERIFY_REQUIRED', priceUnit: 'USD/Troy Oz', currency: 'USD', enabled: true, notes: 'Yahoo Finance' },
  { id: 'XAG_USD', displayName: 'XAGUSD 白銀/美元', assetClass: 'Precious Metal Spot', gfSymbol: 'CURRENCY:XAGUSD', mappingStatus: 'ATTEMPT_VERIFY_REQUIRED', priceUnit: 'USD/Troy Oz', currency: 'USD', enabled: true, notes: 'Yahoo Finance' }
];

const YAHOO_SOURCE_MAP = {
  'USD_INDEX': { yahooSymbol: 'DX-Y.NYB', priceUnit: 'Index Points', notes: 'Yahoo Finance 非官方 API；ICE 美元指數本身。' },
  'SOX_INDEX': { yahooSymbol: '^SOX', priceUnit: 'Index Points', notes: 'Yahoo Finance 非官方 API；PHLX半導體指數本身。' },
  'ZT_FUT': { yahooSymbol: 'ZT=F', priceUnit: 'Futures Price (points)', notes: 'Yahoo Finance 非官方 API；2年期美債近月期貨。' },
  'ZN_FUT': { yahooSymbol: 'ZN=F', priceUnit: 'Futures Price (points)', notes: 'Yahoo Finance 非官方 API；10年期美債近月期貨。' },
  'BZ_FUT': { yahooSymbol: 'BZ=F', priceUnit: 'USD/Barrel', notes: 'Yahoo Finance 非官方 API；Brent原油近月期貨。' },
  'CL_FUT': { yahooSymbol: 'CL=F', priceUnit: 'USD/Barrel', notes: 'Yahoo Finance 非官方 API；WTI原油近月期貨。' },
  'XAU_USD': { yahooSymbol: 'GC=F', priceUnit: 'USD/Troy Oz (Futures)', notes: 'Yahoo Finance 非官方 API；COMEX黃金近月期貨。' },
  'XAG_USD': { yahooSymbol: 'SI=F', priceUnit: 'USD/Troy Oz (Futures)', notes: 'Yahoo Finance 非官方 API；COMEX白銀近月期貨。' }
};

const OVERCLAIM_KEYWORDS = [
  '避險需求', '資金流向', '資金流入', '資金流出',
  '機構買入', '機構賣出', '機構動向', '機構資金',
  '通脹預期', '地緣政治', '央行', '加息', '減息',
  '期權流', '財報', '公司公告', 'SEC文件', 'SEC 文件',
  '新聞消息', '宏觀經濟', '經濟數據', '政策利好', '政策利淡'
];

const FRESHNESS_WARNING_THRESHOLD_MINUTES = 180;

function setupCrossAssetConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG_XA.SHEET_XA_CONFIG) || ss.insertSheet(CONFIG_XA.SHEET_XA_CONFIG);
  sheet.clear();
  const headers = ['Instrument ID', 'Display Name', 'Asset Class', 'GoogleFinance Symbol', 'Mapping Status', 'Price Unit', 'Currency', 'Enabled', 'Live Price (Formula)', 'Live Day Change % (Formula)', 'Notes', 'Last Setup At HKT'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  const nowHKT = Utilities.formatDate(new Date(), 'Asia/Hong_Kong', 'yyyy-MM-dd HH:mm:ss');
  const rows = XA_INSTRUMENTS.map(inst => [inst.id, inst.displayName, inst.assetClass, inst.gfSymbol || '', inst.mappingStatus, inst.priceUnit, inst.currency, inst.enabled, '', '', inst.notes, nowHKT]);
  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  XA_INSTRUMENTS.forEach((inst, idx) => {
    const rowIndex = idx + 2;
    if (inst.gfSymbol) {
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
  snapshotSheet.getRange(1, 1, 1, 11).setValues([['Snapshot ID', 'Data Timestamp HKT', 'Market Date ET', 'Data Status', 'Instrument ID', 'Display Name', 'GoogleFinance Symbol', 'Last Price', 'Day Change %', 'Price Unit', 'Mapping Status']]);
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

function createCrossAssetSnapshot() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName(CONFIG_XA.SHEET_XA_CONFIG);
  const snapshotSheet = ss.getSheetByName(CONFIG_XA.SHEET_XA_SNAPSHOT);
  if (!configSheet || !snapshotSheet) throw new Error('找不到 CrossAsset_Config 或 CrossAsset_Snapshot。');
  SpreadsheetApp.flush();

  const marketDateET = Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd');
  const nowHKT = Utilities.formatDate(new Date(), 'Asia/Hong_Kong', 'yyyy-MM-dd HH:mm:ss');
  const snapshotId = `XA_SNAP_${marketDateET.replace(/-/g, '')}_${Utilities.formatDate(new Date(), 'Asia/Hong_Kong', 'HHmmss')}`;
  const configData = configSheet.getRange(2, 1, configSheet.getLastRow() - 1, 10).getValues();
  const rowsToInsert = [];
  let anyValid = false;

  for (const row of configData) {
    const [instId, displayName, , gfSymbol, mappingStatus, priceUnit, , enabled, livePrice, liveChange] = row;
    if (!enabled || mappingStatus === 'PENDING_MAPPING') {
      rowsToInsert.push([snapshotId, nowHKT, marketDateET, 'SKIPPED_UNVERIFIED_MAPPING', instId, displayName, gfSymbol || '', '', '', priceUnit, mappingStatus]);
      continue;
    }
    if (isInvalidXaNumericValue_(livePrice) || isInvalidXaNumericValue_(liveChange)) {
      rowsToInsert.push([snapshotId, nowHKT, marketDateET, 'INVALID_DATA', instId, displayName, gfSymbol || '', livePrice, liveChange, priceUnit, mappingStatus]);
      continue;
    }
    rowsToInsert.push([snapshotId, nowHKT, marketDateET, 'SUCCESS', instId, displayName, gfSymbol || '', livePrice, liveChange, priceUnit, mappingStatus]);
    anyValid = true;
  }

  snapshotSheet.getRange(snapshotSheet.getLastRow() + 1, 1, rowsToInsert.length, rowsToInsert[0].length).setValues(rowsToInsert);
  SpreadsheetApp.flush();
  return { snapshotId: anyValid ? snapshotId : '', marketDateET: marketDateET, status: anyValid ? 'SUCCESS' : 'FAILED_NO_VALID_INSTRUMENT' };
}

function generateCrossAssetAIReport_(snapshotId, marketDateET, mode) {
  const isManual = mode === 'MANUAL';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const snapshotSheet = ss.getSheetByName(CONFIG_XA.SHEET_XA_SNAPSHOT);
  const aiReportSheet = ss.getSheetByName(CONFIG_XA.SHEET_XA_AI_REPORT);
  if (!snapshotSheet || !aiReportSheet) throw new Error('找不到 CrossAsset_Snapshot 或 CrossAsset_AI_Report。');

  const snapshotData = snapshotSheet.getDataRange().getValues();
  const successRows = snapshotData.filter(row => row[0] === snapshotId && row[3] === 'SUCCESS');
  const skippedRows = snapshotData.filter(row => row[0] === snapshotId && row[3] !== 'SUCCESS');
  if (successRows.length === 0) return { status: 'FAILED_NO_VALID_DATA' };

  const apiKey = PropertiesService.getScriptProperties().getProperty(CONFIG_XA.PROP_OPENROUTER_KEY_XA);
  if (!apiKey) throw new Error('找不到 OPENROUTER_API_KEY。');

  const dataJson = JSON.stringify(successRows.map(row => ({ instrumentId: row[4], displayName: row[5], lastPrice: row[7], dayChangePct: row[8], priceUnit: row[9] })));
  const excludedList = skippedRows.map(row => row[5]).join('、') || '無';
  const prompt = `你係嚴格嘅跨資產市場數據分析助手。只可以使用我提供嘅表格數據，絕對唔可以自行加入新聞、利率、宏觀、財報、期權流、資金流或任何外部資訊。\n事實同推論必須分開，嚴禁給予任何買入、沽出、槓桿、倉位或止蝕建議。\n以下標的因資料未驗證或無效，已被排除：${excludedList}。\n如果數據不足或不完整，請明確輸出「數據不全無法判斷」。\n如數據中包含債券期貨，只可描述「期貨價格變動」，不可稱為「殖利率」變動。\n所有結論必須引用實際數值：Last Price 或 Day Change %。\n\n只輸出最終報告。第一個字必須是「【資產價格狀態】」。\n不得輸出 Thinking Process、推理步驟、英文草稿、分析過程、<think> 標籤或任何內部思考內容。\n\n請用繁體中文／廣東話，按以下固定格式輸出：\n【資產價格狀態】...\n【最大升幅標的】...\n【最大跌幅標的】...\n【訊號一致或矛盾】...\n【明日監察重點】...\n【資料限制】...\n\n數據：${dataJson}`;

  const payload = { model: CONFIG_XA.AI_MODEL_XA, messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 1500, reasoning: { effort: 'none', exclude: true } };
  const options = { method: 'post', contentType: 'application/json', headers: { Authorization: `Bearer ${apiKey}`, 'HTTP-Referer': 'https://us-market-monitor', 'X-Title': 'US Market Monitor - Cross Asset' }, payload: JSON.stringify(payload), muteHttpExceptions: true };

  try {
    const response = UrlFetchApp.fetch(CONFIG_XA.OPENROUTER_URL_XA, options);
    const httpCode = response.getResponseCode();
    const responseText = response.getContentText();
    let result = JSON.parse(responseText);
    if (httpCode < 200 || httpCode >= 300) throw new Error(`OpenRouter HTTP ${httpCode}: ${result.error?.message || responseText}`);
    const cleanReport = sanitizeCrossAssetAiOutput_(result.choices?.[0]?.message?.content);

    aiReportSheet.appendRow([new Date(), marketDateET, successRows[0][1], CONFIG_XA.AI_MODEL_XA, isManual ? 'MANUAL_SUCCESS' : 'SUCCESS', snapshotId, cleanReport, '', isManual ? 'MANUAL_PENDING' : 'PENDING']);
    SpreadsheetApp.flush();
    return { status: 'SUCCESS' };
  } catch (error) {
    aiReportSheet.appendRow([new Date(), marketDateET, successRows.length ? successRows[0][1] : '', CONFIG_XA.AI_MODEL_XA, isManual ? 'MANUAL_API_ERROR' : 'API_ERROR', snapshotId, '', error.toString(), 'NOT_SENT']);
    SpreadsheetApp.flush();
    return { status: 'FAILED_API_ERROR' };
  }
}

function sendCrossAssetReportEmail_(snapshotId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aiReportSheet = ss.getSheetByName(CONFIG_XA.SHEET_XA_AI_REPORT);
  if (!aiReportSheet) throw new Error(`找不到必要工作表：${CONFIG_XA.SHEET_XA_AI_REPORT}`);
  const data = aiReportSheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (row[5] === snapshotId && row[4] === 'SUCCESS' && row[8] === 'PENDING') {
      return sendCrossAssetReportRow_({ sheet: aiReportSheet, rowIndex: i + 1, row: row }, false);
    }
  }
  return { status: 'FAILED_NO_REPORT' };
}

function sendCrossAssetReportRow_(report, isManual) {
  if (!CONFIG_XA.RECIPIENT_EMAILS_XA || !CONFIG_XA.RECIPIENT_EMAILS_XA.length) return { status: 'FAILED_NO_RECIPIENTS' };
  const { row, sheet, rowIndex } = report;
  const marketDateET = row[1];
  const snapshotId = row[5];
  const reportContent = String(row[6] || '').trim();
  if (!reportContent) return { status: 'FAILED_EMPTY_REPORT' };

  sheet.getRange(rowIndex, 9).setValue(isManual ? 'MANUAL_SENDING' : 'SENDING');
  SpreadsheetApp.flush();
  try {
    const recipients = CONFIG_XA.RECIPIENT_EMAILS_XA.join(',');
    const subject = isManual ? `🧪 [手動報告] 跨資產監察 AI 分析報告 (${marketDateET})` : `📊 跨資產監察 AI 分析報告 (${marketDateET})`;
    const testNotice = isManual ? '注意：這是人工生成後、人工確認寄出的手動報告。\n\n' : '';
    const body = `【跨資產市場監察日報】\n\n${testNotice}美東市場日期 (Market Date ET): ${marketDateET}\nSnapshot ID: ${snapshotId}\n---------------------------------------\n\n${reportContent}\n\n---------------------------------------\n提示：此報告由系統自動生成，僅供參考，不構成投資建議。部分標的因資料未驗證而被排除，詳情請查閱 CrossAsset_Config 分頁。`;
    MailApp.sendEmail(recipients, subject, body);
    sheet.getRange(rowIndex, 9).setValue(isManual ? 'MANUAL_SENT' : 'SENT');
    SpreadsheetApp.flush();
    return { status: 'SUCCESS' };
  } catch (error) {
    sheet.getRange(rowIndex, 9).setValue(isManual ? 'MANUAL_EMAIL_FAILED' : 'FAILED');
    sheet.getRange(rowIndex, 8).setValue(error.toString());
    SpreadsheetApp.flush();
    return { status: 'FAILED_EMAIL_ERROR' };
  }
}

function sanitizeCrossAssetAiOutput_(content) {
  const rawText = String(content || '').trim();
  if (!rawText) throw new Error('AI 回應內容為空。');
  const startIndex = rawText.indexOf('【資產價格狀態】');
  if (startIndex === -1) throw new Error('AI 回應找不到正式報告起點【資產價格狀態】。');
  const finalReport = rawText.slice(startIndex).trim();
  const requiredSections = ['【資產價格狀態】', '【最大升幅標的】', '【最大跌幅標的】', '【訊號一致或矛盾】', '【明日監察重點】', '【資料限制】'];
  const missing = requiredSections.filter(section => !finalReport.includes(section));
  if (missing.length) throw new Error(`AI Cross-Asset 報告格式不完整，缺少：${missing.join('、')}。`);
  const forbidden = [/thinking process/i, /<think>/i, /<\/think>/i, /reasoning process/i, /^analysis\s*:/im];
  if (forbidden.some(pattern => pattern.test(finalReport))) throw new Error('AI Cross-Asset 報告內容仍包含內部推理文字。');
  return finalReport;
}

function isInvalidXaNumericValue_(value) {
  const text = String(value).trim();
  return value === '' || value === null || text === 'N/A' || text === 'NOT_AVAILABLE' || text.includes('#') || text.includes('Loading') || !Number.isFinite(Number(value));
}

function fetchYahooQuoteWithTimestamp_(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
  const options = { method: 'get', muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } };
  try {
    const response = UrlFetchApp.fetch(url, options);
    const httpCode = response.getResponseCode();
    const responseText = response.getContentText();
    if (httpCode < 200 || httpCode >= 300) return { status: 'API_ERROR', price: null, changePct: null, sourceTimestampHKT: '', ageMinutes: null, error: `HTTP ${httpCode}` };
    let json = JSON.parse(responseText);
    const result = json?.chart?.result?.[0];
    if (!result || !result.meta) return { status: 'API_ERROR', price: null, changePct: null, sourceTimestampHKT: '', ageMinutes: null, error: '缺少 meta' };
    const price = result.meta.regularMarketPrice;
    const prevClose = result.meta.previousClose || result.meta.chartPreviousClose;
    const marketTimeEpoch = result.meta.regularMarketTime;
    if (!Number.isFinite(price) || !Number.isFinite(prevClose) || prevClose === 0) return { status: 'INVALID_DATA', price: null, changePct: null, sourceTimestampHKT: '', ageMinutes: null, error: '數值缺失' };
    const changePct = ((price / prevClose) - 1) * 100;
    let sourceTimestampHKT = '';
    let ageMinutes = null;
    if (Number.isFinite(marketTimeEpoch)) {
      const sourceDate = new Date(marketTimeEpoch * 1000);
      sourceTimestampHKT = Utilities.formatDate(sourceDate, 'Asia/Hong_Kong', 'yyyy-MM-dd HH:mm:ss');
      ageMinutes = Math.round((Date.now() - sourceDate.getTime()) / 60000);
    }
    return { status: 'SUCCESS', price, changePct, sourceTimestampHKT, ageMinutes, error: '' };
  } catch (error) {
    return { status: 'API_ERROR', price: null, changePct: null, sourceTimestampHKT: '', ageMinutes: null, error: error.toString() };
  }
}

function updateYahooLivePricesWithFreshness_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName(CONFIG_XA.SHEET_XA_CONFIG);
  if (!configSheet) throw new Error('找不到 CrossAsset_Config。');
  const headerRow = configSheet.getRange(1, 1, 1, configSheet.getLastColumn()).getValues()[0];
  const ageColIndex = headerRow.indexOf('Data Age Minutes') + 1;
  const tsColIndex = headerRow.indexOf('Source Timestamp HKT') + 1;
  const lastRow = configSheet.getLastRow();
  const data = configSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let successCount = 0, errorCount = 0, staleWarningCount = 0;

  for (let i = 0; i < data.length; i++) {
    const instId = data[i][0];
    const source = YAHOO_SOURCE_MAP[instId];
    if (!source) continue;
    const rowIndex = i + 2;
    const quote = fetchYahooQuoteWithTimestamp_(source.yahooSymbol);
    if (quote.status === 'SUCCESS') {
      configSheet.getRange(rowIndex, 9).setValue(quote.price);
      configSheet.getRange(rowIndex, 10).setValue(quote.changePct);
      if (tsColIndex > 0) configSheet.getRange(rowIndex, tsColIndex).setValue(quote.sourceTimestampHKT);
      if (ageColIndex > 0) configSheet.getRange(rowIndex, ageColIndex).setValue(quote.ageMinutes);
      if (quote.ageMinutes !== null && quote.ageMinutes > FRESHNESS_WARNING_THRESHOLD_MINUTES) staleWarningCount++;
      successCount++;
    } else {
      configSheet.getRange(rowIndex, 9).setValue(quote.status);
      configSheet.getRange(rowIndex, 10).setValue(quote.status);
      errorCount++;
    }
  }
  SpreadsheetApp.flush();
  return { successCount, errorCount, staleWarningCount };
}

function runCrossAssetPipelineWithFreshness() {
  updateYahooLivePricesWithFreshness_();
  runCrossAssetPipeline();
}

function runCrossAssetPipelineWithAllGuards() {
  const now = new Date();
  const weekdayET = Utilities.formatDate(now, 'America/New_York', 'u');
  if (weekdayET === '6' || weekdayET === '7') return { status: 'SKIPPED_NON_TRADING_DAY' };
  return runCrossAssetPipelineWithFreshness();
}
