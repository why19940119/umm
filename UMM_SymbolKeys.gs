/**
 * ============================================================================
 * UMM canonical instrument / ticker keys (WP-UMM-3)
 * ============================================================================
 * Join key for all pipelines and publish payloads: Instrument ID (e.g. VIX_INDEX).
 * Display names and vendor symbols (GOOGLEFINANCE / Yahoo) are aliases only —
 * never use them as join keys.
 *
 * Canonical short names (for UI / radar joins):
 *   VIX_INDEX  -> VIX
 *   SOX_INDEX  -> SOX
 *   USD_INDEX  -> DXY
 *   Sector ETFs -> ticker itself (XLC … XLU)
 *
 * Aliases normalized by normalizeUmmInstrumentKey_ / resolveUmmCanonicalSymbol_:
 *   ^VIX, VIX, INDEXCBOE:VIX, .VIX  -> VIX_INDEX / VIX
 *   ^SOX, SOX, .SOX                 -> SOX_INDEX / SOX
 * ============================================================================
 */

const UMM_SECTOR_ETF_TICKERS = [
  'XLC', 'XLY', 'XLP', 'XLE', 'XLF',
  'XLV', 'XLI', 'XLB', 'XLRE', 'XLK', 'XLU'
];

/**
 * Canonical cross-asset registry.
 * instrumentId is the only join key used in snapshots and publish JSON.
 */
const UMM_CANONICAL_CROSS_ASSETS = {
  VIX_INDEX: {
    instrumentId: 'VIX_INDEX',
    canonicalSymbol: 'VIX',
    aliases: ['VIX', '^VIX', 'INDEXCBOE:VIX', '.VIX', 'VIX_INDEX'],
    yahooSymbol: '^VIX',
    gfSymbol: 'INDEXCBOE:VIX'
  },
  SOX_INDEX: {
    instrumentId: 'SOX_INDEX',
    canonicalSymbol: 'SOX',
    aliases: ['SOX', '^SOX', '.SOX', 'SOX_INDEX'],
    yahooSymbol: '^SOX',
    gfSymbol: null
  },
  USD_INDEX: {
    instrumentId: 'USD_INDEX',
    canonicalSymbol: 'DXY',
    aliases: ['DXY', 'DX-Y.NYB', 'USD_INDEX', 'USDindex'],
    yahooSymbol: 'DX-Y.NYB',
    gfSymbol: null
  },
  ZT_FUT: {
    instrumentId: 'ZT_FUT',
    canonicalSymbol: 'ZT',
    aliases: ['ZT', 'ZT=F', 'ZT_FUT', 'ZTmain'],
    yahooSymbol: 'ZT=F',
    gfSymbol: null
  },
  ZN_FUT: {
    instrumentId: 'ZN_FUT',
    canonicalSymbol: 'ZN',
    aliases: ['ZN', 'ZN=F', 'ZN_FUT', 'ZNmain'],
    yahooSymbol: 'ZN=F',
    gfSymbol: null
  },
  BZ_FUT: {
    instrumentId: 'BZ_FUT',
    canonicalSymbol: 'BZ',
    aliases: ['BZ', 'BZ=F', 'BZ_FUT', 'BZmain'],
    yahooSymbol: 'BZ=F',
    gfSymbol: null
  },
  CL_FUT: {
    instrumentId: 'CL_FUT',
    canonicalSymbol: 'CL',
    aliases: ['CL', 'CL=F', 'CL_FUT', 'CLmain'],
    yahooSymbol: 'CL=F',
    gfSymbol: null
  },
  XAU_USD: {
    instrumentId: 'XAU_USD',
    canonicalSymbol: 'XAUUSD',
    aliases: ['XAUUSD', 'XAU_USD', 'GC=F', 'CURRENCY:XAUUSD'],
    yahooSymbol: 'GC=F',
    gfSymbol: 'CURRENCY:XAUUSD'
  },
  XAG_USD: {
    instrumentId: 'XAG_USD',
    canonicalSymbol: 'XAGUSD',
    aliases: ['XAGUSD', 'XAG_USD', 'SI=F', 'CURRENCY:XAGUSD'],
    yahooSymbol: 'SI=F',
    gfSymbol: 'CURRENCY:XAGUSD'
  }
};

/**
 * Strip vendor punctuation and uppercase for alias matching.
 */
function ummNormalizeAliasToken_(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/^INDEXCBOE:/, '')
    .replace(/^CURRENCY:/, '')
    .replace(/^\./, '')
    .replace(/^\^/, '');
}

/**
 * Resolve any alias / vendor symbol to canonical Instrument ID, or '' if unknown.
 */
function normalizeUmmInstrumentKey_(raw) {
  const token = ummNormalizeAliasToken_(raw);
  if (!token) return '';

  if (UMM_CANONICAL_CROSS_ASSETS[token]) return token;
  if (UMM_SECTOR_ETF_TICKERS.indexOf(token) !== -1) return token;

  const keys = Object.keys(UMM_CANONICAL_CROSS_ASSETS);
  for (let i = 0; i < keys.length; i++) {
    const entry = UMM_CANONICAL_CROSS_ASSETS[keys[i]];
    for (let j = 0; j < entry.aliases.length; j++) {
      if (ummNormalizeAliasToken_(entry.aliases[j]) === token) {
        return entry.instrumentId;
      }
    }
    if (ummNormalizeAliasToken_(entry.canonicalSymbol) === token) {
      return entry.instrumentId;
    }
    if (entry.yahooSymbol && ummNormalizeAliasToken_(entry.yahooSymbol) === token) {
      return entry.instrumentId;
    }
    if (entry.gfSymbol && ummNormalizeAliasToken_(entry.gfSymbol) === token) {
      return entry.instrumentId;
    }
  }
  return '';
}

/**
 * Resolve to short canonical symbol (VIX, SOX, XLC, …) for display/publish.
 */
function resolveUmmCanonicalSymbol_(raw) {
  const instrumentId = normalizeUmmInstrumentKey_(raw);
  if (!instrumentId) return String(raw || '').trim().toUpperCase();
  if (UMM_SECTOR_ETF_TICKERS.indexOf(instrumentId) !== -1) return instrumentId;
  const entry = UMM_CANONICAL_CROSS_ASSETS[instrumentId];
  return entry ? entry.canonicalSymbol : instrumentId;
}

/**
 * Prefer Instrument ID; fall back to alias resolution.
 */
function resolveUmmInstrumentId_(instrumentId, vendorSymbol) {
  const fromId = normalizeUmmInstrumentKey_(instrumentId);
  if (fromId && UMM_CANONICAL_CROSS_ASSETS[fromId]) return fromId;
  const fromVendor = normalizeUmmInstrumentKey_(vendorSymbol);
  if (fromVendor && UMM_CANONICAL_CROSS_ASSETS[fromVendor]) return fromVendor;
  return String(instrumentId || '').trim();
}
