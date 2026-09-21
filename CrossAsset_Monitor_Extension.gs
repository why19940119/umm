/**
 * ============================================================================
 * US Market Monitor — Cross-Asset Extension (Parts 1 - 7) + WP-UMM-3 guards
 * ============================================================================
 * WP-UMM-3: never emit scary day-change % from frozen/stale prints.
 * Data Status values: SUCCESS | STALE | NON_TRADING | INVALID_DATA |
 *   SKIPPED_UNVERIFIED_MAPPING | API_ERROR
 */

const CONFIG_XA = {
  SHEET_XA_CONFIG: 'CrossAsset_Config',
  SHEET_XA_SNAPSHOT: 'CrossAsset_Snapshot',
  SHEET_XA_AI_REPORT: 'CrossAsset_AI_Report',
  SHEET_CALENDAR: 'Market_Calendar',
  PROP_OPENROUTER_KEY_XA: CONFIG.PROP_OPENROUTER_KEY,
  OPENROUTER_URL_XA: CONFIG.OPENROUTER_URL,
  RECIPIENT_EMAILS_XA: CONFIG.RECIPIENT_EMAILS,
  AI_MODEL_XA: CONFIG.AI_MODEL,
  LOCK_FLAG_KEY: 'XA_PIPELINE_RUNNING'
};

const XA_INSTRUMENTS = [
  { id: 'VIX_INDEX', displayName: '.VIX 恐慌指數', assetClass: 'Volatility', gfSymbol: 'INDEXCBOE:VIX', mappingStatus: 'ATTEMPT_VERIFY_REQUIRED', priceUnit: 'Index Points', currency: 'N/A', enabled: true, notes: 'Prefer Yahoo ^VIX for as-of; GF symbol kept as alias.' },
  { id: 'USD_INDEX', displayName: 'USDindex 美元指數 (DXY)', assetClass: 'FX Index', gfSymbol: null, mappingStatus: 'PENDING_MAPPING', priceUnit: 'Index Points', currency: 'USD', enabled: false, notes: 'Yahoo Finance' },
  { id: 'SOX_INDEX', displayName: '.SOX 費城半導體指數', assetClass: 'Equity Index', gfSymbol: null, mappingStatus: 'PENDING_MAPPING', priceUnit: 'Index Points', currency: 'USD', enabled: false, notes: 'Yahoo Finance ^SOX; enable only after verify.' },
  { id: 'ZT_FUT', displayName: 'ZTmain 2年期美債期貨', assetClass: 'Bond Futures', gfSymbol: null, mappingStatus: 'PENDING_MAPPING', priceUnit: 'Futures Price', currency: 'USD', enabled: false, notes: 'Yahoo Finance' },
  { id: 'ZN_FUT', displayName: 'ZNmain 10年期美債期貨', assetClass: 'Bond Futures', gfSymbol: null, mappingStatus: 'PENDING_MAPPING', priceUnit: 'Futures Price', currency: 'USD', enabled: false, notes: 'Yahoo Finance' },
  { id: 'BZ_FUT', displayName: 'BZmain Brent原油期貨', assetClass: 'Energy Futures', gfSymbol: null, mappingStatus: 'PENDING_MAPPING', priceUnit: 'USD/Barrel', currency: 'USD', enabled: false, notes: 'Yahoo Finance' },
  { id: 'CL_FUT', displayName: 'CLmain WTI原油期貨', assetClass: 'Energy Futures', gfSymbol: null, mappingStatus: 'PENDING_MAPPING', priceUnit: 'USD/Barrel', currency: 'USD', enabled: false, notes: 'Yahoo Finance' },
  { id: 'XAU_USD', displayName: 'XAUUSD 黃金/美元', assetClass: 'Precious Metal Spot', gfSymbol: 'CURRENCY:XAUUSD', mappingStatus: 'ATTEMPT_VERIFY_REQUIRED', priceUnit: 'USD/Troy Oz', currency: 'USD', enabled: true, notes: 'Yahoo Finance' },
  { id: 'XAG_USD', displayName: 'XAGUSD 白銀/美元', assetClass: 'Precious Metal Spot', gfSymbol: 'CURRENCY:XAGUSD', mappingStatus: 'ATTEMPT_VERIFY_REQUIRED', priceUnit: 'USD/Troy Oz', currency: 'USD', enabled: true, notes: 'Yahoo Finance' }
];

// Runtime helpers: UMM_XaSessionGuards.gs, UMM_XaYahooFreshness.gs, UMM_XaReports.gs (WP-UMM-3).
