/** WP-UMM-3 Yahoo fetch + live price freshness (clears % when STALE/NON_TRADING) */

/** Yahoo source map — includes VIX so as-of timestamps exist (WP-UMM-3). */
const YAHOO_SOURCE_MAP = {
  'VIX_INDEX': { yahooSymbol: '^VIX', priceUnit: 'Index Points', notes: 'CBOE VIX; canonical key VIX_INDEX / VIX.' },
  'USD_INDEX': { yahooSymbol: 'DX-Y.NYB', priceUnit: 'Index Points', notes: 'Yahoo Finance 非官方 API；ICE 美元指數本身。' },
  'SOX_INDEX': { yahooSymbol: '^SOX', priceUnit: 'Index Points', notes: 'Yahoo Finance 非官方 API；PHLX半導體指數本身。canonical SOX.' },
  'ZT_FUT': { yahooSymbol: 'ZT=F', priceUnit: 'Futures Price (points)', notes: 'Yahoo Finance 非官方 API；2年期美債近月期貨。' },
  'ZN_FUT': { yahooSymbol: 'ZN=F', priceUnit: 'Futures Price (points)', notes: 'Yahoo Finance 非官方 API；10年期美債近月期貨。' },
  'BZ_FUT': { yahooSymbol: 'BZ=F', priceUnit: 'USD/Barrel', notes: 'Yahoo Finance 非官方 API；Brent原油近月期貨。' },
  'CL_FUT': { yahooSymbol: 'CL=F', priceUnit: 'USD/Barrel', notes: 'Yahoo Finance 非官方 API；WTI原油近月期貨。' },
  'XAU_USD': { yahooSymbol: 'GC=F', priceUnit: 'USD/Troy Oz (Futures)', notes: 'Yahoo Finance 非官方 API；COMEX黃金近月期貨。' },
  'XAG_USD': { yahooSymbol: 'SI=F', priceUnit: 'USD/Troy Oz (Futures)', notes: 'Yahoo Finance 非官方 API；COMEX白銀近月期貨。' }
};

const FRESHNESS_WARNING_THRESHOLD_MINUTES = 180;

function fetchYahooQuoteWithTimestamp_(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
  const options = { method: 'get', muteHttpExceptions: true, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' } };
  try {
    const response = UrlFetchApp.fetch(url, options);
    const httpCode = response.getResponseCode();
    const responseText = response.getContentText();
    if (httpCode < 200 || httpCode >= 300) return { status: 'API_ERROR', price: null, changePct: null, sourceTimestampHKT: '', ageMinutes: null, quoteAsOfEt: '', error: `HTTP ${httpCode}` };
    let json = JSON.parse(responseText);
    const result = json?.chart?.result?.[0];
    if (!result || !result.meta) return { status: 'API_ERROR', price: null, changePct: null, sourceTimestampHKT: '', ageMinutes: null, quoteAsOfEt: '', error: '缺少 meta' };
    const price = result.meta.regularMarketPrice;
    const prevClose = result.meta.previousClose || result.meta.chartPreviousClose;
    const marketTimeEpoch = result.meta.regularMarketTime;
    if (!Number.isFinite(price) || !Number.isFinite(prevClose) || prevClose === 0) return { status: 'INVALID_DATA', price: null, changePct: null, sourceTimestampHKT: '', ageMinutes: null, quoteAsOfEt: '', error: '數值缺失' };

    let sourceTimestampHKT = '';
    let ageMinutes = null;
    let quoteAsOfEt = '';
    let sourceDate = null;
    if (Number.isFinite(marketTimeEpoch)) {
      sourceDate = new Date(marketTimeEpoch * 1000);
      sourceTimestampHKT = Utilities.formatDate(sourceDate, 'Asia/Hong_Kong', 'yyyy-MM-dd HH:mm:ss');
      ageMinutes = Math.round((Date.now() - sourceDate.getTime()) / 60000);
      quoteAsOfEt = Utilities.formatDate(sourceDate, 'America/New_York', 'yyyy-MM-dd');
    }

    const session = classifyXaQuoteSession_(sourceTimestampHKT, ageMinutes, new Date());
    const rawChangePct = ((price / prevClose) - 1) * 100;
    const changePct = session.emitPct ? rawChangePct : null;

    return {
      status: session.status === 'SUCCESS' ? 'SUCCESS' : session.status,
      price,
      changePct,
      rawChangePct,
      sourceTimestampHKT,
      ageMinutes,
      quoteAsOfEt,
      error: session.reason || ''
    };
  } catch (error) {
    return { status: 'API_ERROR', price: null, changePct: null, sourceTimestampHKT: '', ageMinutes: null, quoteAsOfEt: '', error: error.toString() };
  }
}

function updateYahooLivePricesWithFreshness_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const configSheet = ss.getSheetByName(CONFIG_XA.SHEET_XA_CONFIG);
  if (!configSheet) throw new Error('找不到 CrossAsset_Config。');
  const headerRow = configSheet.getRange(1, 1, 1, configSheet.getLastColumn()).getValues()[0];
  let ageColIndex = headerRow.indexOf('Data Age Minutes') + 1;
  let tsColIndex = headerRow.indexOf('Source Timestamp HKT') + 1;
  let canonicalColIndex = headerRow.indexOf('Canonical Symbol') + 1;

  if (tsColIndex <= 0) {
    const newCol = configSheet.getLastColumn() + 1;
    configSheet.getRange(1, newCol).setValue('Source Timestamp HKT');
    tsColIndex = newCol;
  }
  if (ageColIndex <= 0) {
    const newCol = configSheet.getLastColumn() + 1;
    configSheet.getRange(1, newCol).setValue('Data Age Minutes');
    ageColIndex = newCol;
  }
  if (canonicalColIndex <= 0) {
    const newCol = configSheet.getLastColumn() + 1;
    configSheet.getRange(1, newCol).setValue('Canonical Symbol');
    canonicalColIndex = newCol;
  }

  const lastRow = configSheet.getLastRow();
  const data = configSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  let successCount = 0, errorCount = 0, staleWarningCount = 0, nonTradingCount = 0;

  for (let i = 0; i < data.length; i++) {
    const instId = data[i][0];
    const source = YAHOO_SOURCE_MAP[instId];
    if (!source) continue;
    const rowIndex = i + 2;
    const canonical = resolveUmmCanonicalSymbol_(instId);
    configSheet.getRange(rowIndex, canonicalColIndex).setValue(canonical);

    const quote = fetchYahooQuoteWithTimestamp_(source.yahooSymbol);
    if (quote.status === 'SUCCESS' || quote.status === 'STALE' || quote.status === 'NON_TRADING') {
      configSheet.getRange(rowIndex, 9).setValue(quote.price);
      if (quote.changePct === null || quote.changePct === undefined || quote.status !== 'SUCCESS') {
        configSheet.getRange(rowIndex, 10).setValue('');
      } else {
        configSheet.getRange(rowIndex, 10).setValue(quote.changePct);
      }
      if (tsColIndex > 0) configSheet.getRange(rowIndex, tsColIndex).setValue(quote.sourceTimestampHKT);
      if (ageColIndex > 0) configSheet.getRange(rowIndex, ageColIndex).setValue(quote.ageMinutes);
      if (quote.status === 'STALE') staleWarningCount++;
      if (quote.status === 'NON_TRADING') nonTradingCount++;
      if (quote.status === 'SUCCESS') successCount++;
    } else {
      configSheet.getRange(rowIndex, 9).setValue(quote.status);
      configSheet.getRange(rowIndex, 10).setValue('');
      errorCount++;
    }
  }
  SpreadsheetApp.flush();
  return { successCount, errorCount, staleWarningCount, nonTradingCount };
}
