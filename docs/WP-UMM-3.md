# WP-UMM-3 — Stop false signals from stale / non-trading prints

## Problem

1. VIX / SOX (and similar) frozen weekend/holiday quotes still showed large day-change % (e.g. −4.08%) → false signals.
2. Mixed timestamps in one report (snapshot clock vs quote as-of).
3. Trading-day guard inconsistent (weekend/holiday/closed still treated as a live move).
4. Ticker naming drift (`^VIX` vs `VIX` vs `INDEXCBOE:VIX`) caused wrong joins.

## Root cause (verified)

- Yahoo `fetchYahooQuoteWithTimestamp_` always computed `(price/prevClose)-1` even when `regularMarketTime` was from the prior session.
- `updateYahooLivePricesWithFreshness_` only **counted** stale warnings (`FRESHNESS_WARNING_THRESHOLD_MINUTES`); it still wrote `changePct` into the sheet.
- `createCrossAssetSnapshot()` marked rows `SUCCESS` whenever price/% were numeric — **no** as-of vs US session check.
- GOOGLEFINANCE `changepct` (VIX) freezes on weekends and looks like a live move.
- `runCrossAssetPipelineWithAllGuards()` skipped weekends only; **not** holidays. Dashboard refresh had no session suppress for %.
- Publish used `gfSymbol` (often empty for Yahoo instruments) instead of a canonical key.

## Fix (data layer, not UI-only hide)

| Area | Change |
| --- | --- |
| Session / freshness | `classifyXaQuoteSession_` → `NON_TRADING` (weekend/holiday) or `STALE` (as-of ≠ expected ET session or age > 180m). **`emitPct=false`** clears day-change %. |
| Yahoo fetch | Returns `STALE` / `NON_TRADING`; `changePct` is null unless `SUCCESS`. |
| Snapshot | Per-row as-of (`Data Timestamp HKT` / `Source Timestamp HKT` / `Quote As-Of ET`); status column carries flags. |
| Symbols | `UMM_SymbolKeys.gs` — Instrument ID join key; canonical short names (`VIX`, `SOX`, …). |
| Publish | Includes `dataStatus`; forces `dayChangePct: null` unless `SUCCESS`; adds `reportAsOfHkt` / `crossAssetAsOfHkt`. |
| Cloudflare path | **Unchanged**: `UMM_Publish_Snapshot.gs` → `POST /api/snapshot` with `X-UMM-Publish-Secret`. No Pipedream. |

## Files

- `UMM_SymbolKeys.gs` (new)
- `CrossAsset_Monitor_Extension.gs`
- `UMM_Publish_Snapshot.gs`
- `docs/WP-UMM-3.md` (this file)
- `ACCEPTANCE.md` (extended)
- `umm-dashboard` `index.html` (optional companion PR): show `NON_TRADING` / `STALE` badges instead of a fake %

## Manual acceptance checklist

### Must NOT appear

- [ ] On a US weekend or listed holiday: VIX/SOX (or any XA card) must **not** show a large live day-change % such as `−4.08%` / `+3.xx%` from a frozen print
- [ ] Snapshot / publish payload: rows with `dataStatus` of `STALE` or `NON_TRADING` must have `dayChangePct: null` (or empty) — never a scary number
- [ ] AI cross-asset path must not cite day-change % from `STALE` / `NON_TRADING` rows (those statuses are excluded from SUCCESS)

### Must appear / behave

- [ ] Weekend or holiday run of `updateYahooLivePricesWithFreshness_` + `createCrossAssetSnapshot()` writes `NON_TRADING` (or `STALE` if quote as-of ≠ session) into `CrossAsset_Snapshot`
- [ ] Each XA snapshot row has a coherent as-of (`Source Timestamp HKT` and/or `Quote As-Of ET`); publish JSON has `reportAsOfHkt` / `crossAssetAsOfHkt`
- [ ] Canonical symbols: VIX→`VIX` / `VIX_INDEX`, SOX→`SOX` / `SOX_INDEX` (no `^VIX` vs `INDEXCBOE:VIX` join mismatch in publish `symbol` / `canonicalSymbol`)
- [ ] `publishUmmSnapshotForDashboard()` still POSTs to Cloudflare `/api/snapshot` with `X-UMM-Publish-Secret`; Drive `umm_snapshot.json` updated; **no** Pipedream call
- [ ] Dashboard refresh (`refreshUmmDashboardData_` / 刷新 UMM) still completes without inventing new AI features or sending email

### Optional UI (umm-dashboard)

- [ ] Cross-asset cards show a `NON_TRADING` or `STALE` label when `dataStatus` is set; day-change cell shows `—` not a fake %

## Sign-off

| Field | Value |
| --- | --- |
| Date (HKT) | |
| Tester | |
| Result | PASS / FAIL |
| Notes | |
