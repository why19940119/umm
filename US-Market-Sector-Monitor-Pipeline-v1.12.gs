/**
 * ============================================================================
 * US Market Sector Monitor Pipeline v1.12 — Clean Manual-Control Edition
 *
 * 正式自動流程：runDailyMarketPipeline()
 * - 美東 18:00 後、交易日、資料完整才生成報告並自動寄 Email。
 *
 * 手動流程：
 * 1. manualGenerateAIReport()：使用最近完整 Snapshot，生成報告但不寄 Email。
 * 2. manualSendAIReport()：只寄出最新一份手動生成、仍在等待寄送的報告。
 *
 * 注意：手動流程不受週末、美東收市時間限制；但仍需要完整 Daily_Snapshot。
 * ============================================================================
 */

const CONFIG = {
  SHEET_SECTORS: 'US_11_Sectors',
  SHEET_SNAPSHOT: 'Daily_Snapshot',
  SHEET_AI_REPORT: 'AI_Report',
  SHEET_CALENDAR: 'Market_Calendar',

  PROP_OPENROUTER_KEY: 'OPENROUTER_API_KEY',
  OPENROUTER_URL: 'https://openrouter.ai/api/v1/chat/completions',

  RECIPIENT_EMAILS: [
  ],

  EXPECTED_ETF_COUNT: 11,

  ALLOWED_ETFS: new Set([
    'XLC', 'XLY', 'XLP', 'XLE', 'XLF',
    'XLV', 'XLI', 'XLB', 'XLRE', 'XLK', 'XLU'
  ]),

  AI_MODEL: 'qwen/qwen3.5-flash-02-23'
};

/**
 * 正式自動流程：只可於美東交易日收市後運行。
 */
function runDailyMarketPipeline() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    Logger.log('⚠️ 已有另一個 Pipeline 執行中，跳過本次執行。');
    return;
  }

  try {
    Logger.log('=== 開始執行 US Market Monitor Pipeline v1.12 ===');

    const snapshotRes = createDailySnapshot();
    Logger.log(`[Snapshot] ${snapshotRes.status}, ${snapshotRes.snapshotId || ''}`);

    if (snapshotRes.status === 'MARKET_NOT_CLOSED' || snapshotRes.status === 'NON_TRADING_DAY') {
      Logger.log('正式流程條件未符合，安全退出。');
      return;
    }

    if (snapshotRes.status === 'FAILED_INCOMPLETE' || !snapshotRes.snapshotId) {
      Logger.log('Snapshot 資料不完整，停止後續流程。');
      return;
    }

    const aiRes = generateAIReport_(snapshotRes.snapshotId, snapshotRes.marketDateET, 'AUTO');
    Logger.log(`[AI Report] ${aiRes.status}`);

    if (aiRes.status !== 'SUCCESS' && aiRes.status !== 'SKIPPED_ALREADY_EXISTS') {
      throw new Error(`AI 報告生成失敗：${aiRes.status}`);
    }

    const emailRes = sendAutoReportEmail_(snapshotRes.snapshotId);
    Logger.log(`[Email] ${emailRes.status}`);

    if (emailRes.status !== 'SUCCESS' && emailRes.status !== 'SKIPPED_ALREADY_SENT') {
      throw new Error(`Email 發送失敗：${emailRes.status}`);
    }

    Logger.log('✅ 正式 Pipeline 完成。');
  } catch (error) {
    Logger.log(`❌ Pipeline 失敗：${error.toString()}`);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

/**
 * 手動第 1 步：只生成報告，不寄 Email。
 * 使用 Daily_Snapshot 中最近一個完整 Snapshot。
 */
function manualGenerateAIReport() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('已有另一個 Pipeline 或手動程序正在執行，請稍後再試。');
  }

  try {
    const latest = getLatestCompleteSnapshot_();
    Logger.log(`開始手動生成 AI 報告，Snapshot：${latest.snapshotId}`);

    const result = generateAIReport_(latest.snapshotId, latest.marketDateET, 'MANUAL');

    if (result.status !== 'SUCCESS') {
      throw new Error(`手動生成 AI 報告失敗：${result.status}`);
    }

    Logger.log('✅ 手動 AI 報告已寫入 AI_Report，尚未寄送 Email。');
  } finally {
    lock.releaseLock();
  }
}

/**
 * 手動第 2 步：只寄出最新一份 MANUAL_SUCCESS / MANUAL_PENDING 報告。
 * 不會重新呼叫 AI，不會建立 Snapshot。
 */
function manualSendAIReport() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('已有另一個 Pipeline 或手動程序正在執行，請稍後再試。');
  }

  try {
    const result = sendLatestManualReport_();

    if (result.status !== 'SUCCESS') {
      throw new Error(`手動寄送 Email 失敗：${result.status}`);
    }

    Logger.log('✅ 手動 Email 已成功發送。');
  } finally {
    lock.releaseLock();
  }
}

/**
 * 建立 Daily Snapshot：只供正式自動流程使用。
 */
function createDailySnapshot() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sectorsSheet = ss.getSheetByName(CONFIG.SHEET_SECTORS);
  const snapshotSheet = ss.getSheetByName(CONFIG.SHEET_SNAPSHOT);

  if (!sectorsSheet || !snapshotSheet) {
    throw new Error(`找不到必要工作表：${CONFIG.SHEET_SECTORS} 或 ${CONFIG.SHEET_SNAPSHOT}`);
  }

  const marketDateET = getUSMarketDateET_();

  if (!isAfterUsMarketClose_()) {
    return { snapshotId: '', marketDateET: marketDateET, status: 'MARKET_NOT_CLOSED' };
  }

  const etDay = Utilities.formatDate(new Date(), 'America/New_York', 'u');
  if (etDay === '6' || etDay === '7' || isUsMarketHoliday_(marketDateET)) {
    return { snapshotId: '', marketDateET: marketDateET, status: 'NON_TRADING_DAY' };
  }

  const existingSnapshotId = checkExistingSnapshot_(snapshotSheet, marketDateET);
  if (existingSnapshotId) {
    return {
      snapshotId: existingSnapshotId,
      marketDateET: marketDateET,
      status: 'SKIPPED_ALREADY_EXISTS'
    };
  }

  const lastRow = sectorsSheet.getLastRow();
  if (lastRow < 2) {
    return { snapshotId: '', marketDateET: marketDateET, status: 'FAILED_INCOMPLETE' };
  }

  const rawData = sectorsSheet.getRange(2, 1, lastRow - 1, 12).getValues();
  const validRows = [];

  for (const row of rawData) {
    const ticker = String(row[1]).trim().toUpperCase();
    if (!CONFIG.ALLOWED_ETFS.has(ticker)) continue;

    const numericValues = [row[3], row[4], row[6], row[9], row[10]];
    if (numericValues.some(isInvalidNumericValue_)) {
      Logger.log(`Ticker ${ticker} 存在無效或未完成數值。`);
      return { snapshotId: '', marketDateET: marketDateET, status: 'FAILED_INCOMPLETE' };
    }

    const category = String(row[11]).trim();
    if (!category || category.includes('#') || category.includes('載入中') || category.includes('Loading')) {
      Logger.log(`Ticker ${ticker} 分類欄未完成。`);
      return { snapshotId: '', marketDateET: marketDateET, status: 'FAILED_INCOMPLETE' };
    }

    validRows.push(row);
  }

  const tickers = validRows.map(row => String(row[1]).trim().toUpperCase());
  const uniqueTickers = new Set(tickers);
  const complete = validRows.length === CONFIG.EXPECTED_ETF_COUNT &&
    uniqueTickers.size === CONFIG.EXPECTED_ETF_COUNT &&
    [...CONFIG.ALLOWED_ETFS].every(ticker => uniqueTickers.has(ticker));

  if (!complete) {
    Logger.log('11 隻 ETF 完整性或去重驗證失敗。');
    return { snapshotId: '', marketDateET: marketDateET, status: 'FAILED_INCOMPLETE' };
  }

  const nowHKT = Utilities.formatDate(new Date(), 'Asia/Hong_Kong', 'yyyy-MM-dd HH:mm:ss');
  const snapshotId = `SNAP_${marketDateET.replace(/-/g, '')}_${Utilities.formatDate(new Date(), 'Asia/Hong_Kong', 'HHmmss')}`;

  const rowsToInsert = validRows.map(row => [
    snapshotId,
    nowHKT,
    marketDateET,
    'COMPLETE',
    row[0],
    row[1],
    row[2],
    row[3],
    row[4],
    row[5],
    row[6],
    row[9],
    row[10],
    row[11]
  ]);

  snapshotSheet.getRange(
    snapshotSheet.getLastRow() + 1,
    1,
    rowsToInsert.length,
    rowsToInsert[0].length
  ).setValues(rowsToInsert);

  SpreadsheetApp.flush();
  return { snapshotId: snapshotId, marketDateET: marketDateET, status: 'SUCCESS' };
}

/**
 * 生成 AI 報告。
 * mode = AUTO：正式報告，SUCCESS / PENDING。
 * mode = MANUAL：手動報告，MANUAL_SUCCESS / MANUAL_PENDING，不寄 Email。
 */
function generateAIReport_(snapshotId, marketDateET, mode) {
  const isManual = mode === 'MANUAL';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const snapshotSheet = ss.getSheetByName(CONFIG.SHEET_SNAPSHOT);
  const aiReportSheet = ss.getSheetByName(CONFIG.SHEET_AI_REPORT);

  if (!snapshotSheet || !aiReportSheet) {
    throw new Error(`找不到必要工作表：${CONFIG.SHEET_SNAPSHOT} 或 ${CONFIG.SHEET_AI_REPORT}`);
  }

  if (!isManual && checkExistingAIReport_(aiReportSheet, snapshotId)) {
    return { status: 'SKIPPED_ALREADY_EXISTS' };
  }

  const apiKey = PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_OPENROUTER_KEY);
  if (!apiKey) {
    throw new Error('找不到 OPENROUTER_API_KEY，請檢查 Script Properties。');
  }

  const snapshotData = snapshotSheet.getDataRange().getValues();
  const targetRows = snapshotData.filter(row => row[0] === snapshotId && row[3] === 'COMPLETE');

  if (targetRows.length !== CONFIG.EXPECTED_ETF_COUNT) {
    return { status: 'FAILED_INCOMPLETE_SNAPSHOT' };
  }

  const dataJson = JSON.stringify(targetRows.map(row => ({
    sector: row[4],
    ticker: row[5],
    lastPrice: row[7],
    change5d: row[11],
    change20d: row[12],
    range52w: row[10],
    classification: row[13]
  })));

  const prompt = `你係嚴格嘅美股板塊分析助手。只可以使用我提供嘅表格數據，絕對唔可以自行加入新聞、利率、宏觀、財報、期權流或任何外部資訊。
事實同推論必須分開，嚴禁給予任何買入、沽出、追貨或止蝕建議。
System Classification 只係預設公式標籤，唔係獨立證據。所有結論必須引用至少一項實際數值：Vs SPY (5D)、Vs SPY (20D) 或 52W Range Position。
如果數據不足或不完整，請明確輸出「數據不全無法判斷」。

只輸出最終報告。第一個字必須是「【市場結構】」。
不得輸出 Thinking Process、推理步驟、英文草稿、分析過程、<think> 標籤或任何內部思考內容。

請用繁體中文／廣東話，按以下固定格式輸出：
【市場結構】...
【最強板塊】...
【最弱板塊】...
【短期轉變】...
【明日監察重點】...
【資料限制】...

數據：${dataJson}`;

  const payload = {
    model: CONFIG.AI_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 1500,
    reasoning: {
      effort: 'none',
      exclude: true
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://us-market-monitor',
      'X-Title': 'US Market Monitor'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(CONFIG.OPENROUTER_URL, options);
    const httpCode = response.getResponseCode();
    const responseText = response.getContentText();

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error(`OpenRouter 回傳非 JSON（HTTP ${httpCode}）：${responseText.slice(0, 500)}`);
    }

    if (httpCode < 200 || httpCode >= 300) {
      throw new Error(`OpenRouter HTTP ${httpCode}: ${result.error?.message || responseText}`);
    }

    const rawContent = result.choices?.[0]?.message?.content;
    const cleanReport = sanitizeAiOutput_(rawContent);

    aiReportSheet.appendRow([
      new Date(),
      marketDateET,
      targetRows[0][1],
      CONFIG.AI_MODEL,
      isManual ? 'MANUAL_SUCCESS' : 'SUCCESS',
      snapshotId,
      cleanReport,
      '',
      isManual ? 'MANUAL_PENDING' : 'PENDING'
    ]);

    SpreadsheetApp.flush();
    return { status: 'SUCCESS' };
  } catch (error) {
    aiReportSheet.appendRow([
      new Date(),
      marketDateET,
      targetRows.length ? targetRows[0][1] : '',
      CONFIG.AI_MODEL,
      isManual ? 'MANUAL_API_ERROR' : 'API_ERROR',
      snapshotId,
      '',
      error.toString(),
      'NOT_SENT'
    ]);

    SpreadsheetApp.flush();
    return { status: 'FAILED_API_ERROR' };
  }
}

/**
 * 正式流程寄送：只讀 SUCCESS / PENDING 的最新正式報告。
 */
function sendAutoReportEmail_(snapshotId) {
  const report = findReportRow_(snapshotId, 'SUCCESS', 'PENDING');
  if (!report) {
    const sentReport = findReportRow_(snapshotId, 'SUCCESS', 'SENT');
    return sentReport ? { status: 'SKIPPED_ALREADY_SENT' } : { status: 'FAILED_NO_REPORT' };
  }

  return sendReportRow_(report, false);
}

/**
 * 手動流程寄送：只讀最新 MANUAL_SUCCESS / MANUAL_PENDING 報告。
 */
function sendLatestManualReport_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aiReportSheet = ss.getSheetByName(CONFIG.SHEET_AI_REPORT);

  if (!aiReportSheet) {
    throw new Error(`找不到必要工作表：${CONFIG.SHEET_AI_REPORT}`);
  }

  const data = aiReportSheet.getDataRange().getValues();

  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (row[4] === 'MANUAL_SUCCESS' && row[8] === 'MANUAL_PENDING') {
      return sendReportRow_({ sheet: aiReportSheet, rowIndex: i + 1, row: row }, true);
    }
  }

  return { status: 'FAILED_NO_MANUAL_PENDING_REPORT' };
}

/**
 * 寄送指定的 AI_Report 行。
 */
function sendReportRow_(report, isManual) {
  if (!CONFIG.RECIPIENT_EMAILS || !CONFIG.RECIPIENT_EMAILS.length) {
    return { status: 'FAILED_NO_RECIPIENTS' };
  }

  const row = report.row;
  const sheet = report.sheet;
  const rowIndex = report.rowIndex;
  const marketDateET = row[1];
  const snapshotId = row[5];
  const reportContent = String(row[6] || '').trim();

  if (!reportContent) {
    return { status: 'FAILED_EMPTY_REPORT' };
  }

  const sendingStatus = isManual ? 'MANUAL_SENDING' : 'SENDING';
  const sentStatus = isManual ? 'MANUAL_SENT' : 'SENT';
  const failedStatus = isManual ? 'MANUAL_EMAIL_FAILED' : 'FAILED';

  sheet.getRange(rowIndex, 9).setValue(sendingStatus);
  SpreadsheetApp.flush();

  try {
    const recipients = CONFIG.RECIPIENT_EMAILS.join(',');
    const subject = isManual
      ? `🧪 [手動報告] 美股板塊 AI 分析報告 (${marketDateET})`
      : `📈 美股板塊 AI 分析報告 (${marketDateET})`;

    const testNotice = isManual
      ? '注意：這是人工生成後、人工確認寄出的手動報告。\n\n'
      : '';

    const body = `【美股板塊每日監察日報】\n\n` +
      testNotice +
      `美東市場日期 (Market Date ET): ${marketDateET}\n` +
      `Snapshot ID: ${snapshotId}\n` +
      '---------------------------------------\n\n' +
      `${reportContent}\n\n` +
      '---------------------------------------\n' +
      '提示：此報告由系統自動生成，僅供參考，不構成投資建議。';

    MailApp.sendEmail(recipients, subject, body);
    sheet.getRange(rowIndex, 9).setValue(sentStatus);
    SpreadsheetApp.flush();

    Logger.log(`Email 已成功發送給：${recipients}`);
    return { status: 'SUCCESS' };
  } catch (error) {
    sheet.getRange(rowIndex, 9).setValue(failedStatus);
    sheet.getRange(rowIndex, 8).setValue(error.toString());
    SpreadsheetApp.flush();
    return { status: 'FAILED_EMAIL_ERROR' };
  }
}

/**
 * 找指定 Snapshot、Status 和 Notification Status 的最新報告行。
 */
function findReportRow_(snapshotId, reportStatus, notificationStatus) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aiReportSheet = ss.getSheetByName(CONFIG.SHEET_AI_REPORT);

  if (!aiReportSheet) {
    throw new Error(`找不到必要工作表：${CONFIG.SHEET_AI_REPORT}`);
  }

  const data = aiReportSheet.getDataRange().getValues();

  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (row[5] === snapshotId && row[4] === reportStatus && row[8] === notificationStatus) {
      return { sheet: aiReportSheet, rowIndex: i + 1, row: row };
    }
  }

  return null;
}

/**
 * 只保留正式六段報告，拒絕無最終報告的 Qwen 回覆。
 */
function sanitizeAiOutput_(content) {
  const rawText = String(content || '').trim();

  if (!rawText) {
    throw new Error('AI 回應內容為空。');
  }

  const startIndex = rawText.indexOf('【市場結構】');
  if (startIndex === -1) {
    throw new Error('AI 回應找不到正式報告起點【市場結構】，已拒絕寫入及寄送。');
  }

  const finalReport = rawText.slice(startIndex).trim();
  const requiredSections = [
    '【市場結構】',
    '【最強板塊】',
    '【最弱板塊】',
    '【短期轉變】',
    '【明日監察重點】',
    '【資料限制】'
  ];

  const missing = requiredSections.filter(section => !finalReport.includes(section));
  if (missing.length) {
    throw new Error(`AI 正式報告格式不完整，缺少：${missing.join('、')}。`);
  }

  const forbidden = [
    /thinking process/i,
    /<think>/i,
    /<\/think>/i,
    /reasoning process/i,
    /^analysis\s*:/im
  ];

  if (forbidden.some(pattern => pattern.test(finalReport))) {
    throw new Error('AI 正式報告內容仍包含內部推理文字，已拒絕寫入及寄送。');
  }

  return finalReport;
}

/**
 * 取 Daily_Snapshot 最近一個完整 Snapshot。
 */
function getLatestCompleteSnapshot_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const snapshotSheet = ss.getSheetByName(CONFIG.SHEET_SNAPSHOT);

  if (!snapshotSheet) {
    throw new Error(`找不到必要工作表：${CONFIG.SHEET_SNAPSHOT}`);
  }

  const data = snapshotSheet.getDataRange().getValues();

  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (!row[0] || row[3] !== 'COMPLETE') continue;

    const snapshotId = String(row[0]).trim();
    const targetRows = data.filter(item => item[0] === snapshotId && item[3] === 'COMPLETE');
    const tickers = new Set(targetRows.map(item => String(item[5]).trim().toUpperCase()));

    const isComplete = targetRows.length === CONFIG.EXPECTED_ETF_COUNT &&
      tickers.size === CONFIG.EXPECTED_ETF_COUNT &&
      [...CONFIG.ALLOWED_ETFS].every(ticker => tickers.has(ticker));

    if (isComplete) {
      return {
        snapshotId: snapshotId,
        marketDateET: normalizeDate_(row[2])
      };
    }
  }

  throw new Error('找不到完整的 11 ETF Daily_Snapshot。');
}

function getUSMarketDateET_() {
  return Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd');
}

function isAfterUsMarketClose_() {
  const etHour = Number(Utilities.formatDate(new Date(), 'America/New_York', 'HH'));
  return etHour >= 18;
}

function isUsMarketHoliday_(marketDateET) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const calendarSheet = ss.getSheetByName(CONFIG.SHEET_CALENDAR);
  if (!calendarSheet || calendarSheet.getLastRow() < 2) return false;

  const rows = calendarSheet.getRange(2, 1, calendarSheet.getLastRow() - 1, 2).getDisplayValues();
  return rows.some(([date, isTradingDay]) =>
    date.trim() === marketDateET && isTradingDay.trim().toUpperCase() === 'FALSE'
  );
}

function isInvalidNumericValue_(value) {
  const text = String(value).trim();
  return value === '' ||
    value === null ||
    text.includes('#') ||
    text.includes('載入') ||
    text.includes('Loading') ||
    !Number.isFinite(Number(value));
}

function normalizeDate_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'America/New_York', 'yyyy-MM-dd');
  }
  return String(value).trim();
}

function checkExistingSnapshot_(sheet, marketDateET) {
  const data = sheet.getDataRange().getValues();
  const grouped = {};

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const snapshotId = String(row[0] || '').trim();
    const rowDate = normalizeDate_(row[2]);

    if (snapshotId && rowDate === marketDateET && row[3] === 'COMPLETE') {
      if (!grouped[snapshotId]) grouped[snapshotId] = [];
      grouped[snapshotId].push(row);
    }
  }

  for (const [snapshotId, rows] of Object.entries(grouped)) {
    const tickers = new Set(rows.map(row => String(row[5]).trim().toUpperCase()));
    const complete = rows.length === CONFIG.EXPECTED_ETF_COUNT &&
      tickers.size === CONFIG.EXPECTED_ETF_COUNT &&
      [...CONFIG.ALLOWED_ETFS].every(ticker => tickers.has(ticker));

    if (complete) return snapshotId;
  }

  return null;
}

function checkExistingAIReport_(sheet, snapshotId) {
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][5] === snapshotId && data[i][4] === 'SUCCESS') {
      return true;
    }
  }

  return false;
}

/**
 * 一鍵建立／重建 2026 Market_Calendar。
 * 注意：會清空既有 Market_Calendar 資料。
 */
function setupMarketCalendar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let calendarSheet = ss.getSheetByName(CONFIG.SHEET_CALENDAR);

  if (!calendarSheet) {
    calendarSheet = ss.insertSheet(CONFIG.SHEET_CALENDAR);
  } else {
    calendarSheet.clear();
  }

  const calendarData = [
    ['Date', 'Is_Trading_Day'],
    ['2026-01-01', 'FALSE'],
    ['2026-01-19', 'FALSE'],
    ['2026-02-16', 'FALSE'],
    ['2026-04-03', 'FALSE'],
    ['2026-05-25', 'FALSE'],
    ['2026-06-19', 'FALSE'],
    ['2026-07-03', 'FALSE'],
    ['2026-09-07', 'FALSE'],
    ['2026-11-26', 'FALSE'],
    ['2026-12-25', 'FALSE']
  ];

  calendarSheet.getRange(1, 1, calendarData.length, 2).setValues(calendarData);
  SpreadsheetApp.flush();
  Logger.log('✅ Market_Calendar 已成功建立。');
}
