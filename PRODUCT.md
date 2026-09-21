# UMM Product Setup — Zero to Dashboard Snapshot

`why19940119/umm` (Google Apps Script + Sheets) and [`why19940119/umm-dashboard`](https://github.com/why19940119/umm-dashboard) (Cloudflare Worker + D1 + static UI) are **one finished product**: US Market Monitor with a private intelligence dashboard.

This guide gets a stranger from an empty checkout to a dashboard that shows a live snapshot. For day-to-day ops and failure codes, see [OPERATIONS.md](./OPERATIONS.md). For a short pass/fail list, see [ACCEPTANCE.md](./ACCEPTANCE.md).

> **Scope note (WP-UMM-1):** Existing AI report and email flows stay as-is. Do **not** add models, prompts, or new AI features without PM + user approval.

## Architecture

```text
Google Sheets (GOOGLEFINANCE + Cross-Asset)
  -> Google Apps Script (pipeline + refresh Web App)
  -> Cloudflare Worker (/api/refresh, /api/snapshot)
  -> Cloudflare D1 (umm-snapshots)
  -> UMM Dashboard (index.html)
```

Dashboard-only refresh updates market data and publishes a snapshot. It does **not** generate an AI report and does **not** send email.

## What runs today

| Piece | Role |
| --- | --- |
| Apps Script `.gs` files in this repo | Sector pipeline, cross-asset guards, AI report/email (existing), dashboard refresh API, Drive + D1 snapshot publish |
| Bound Google Spreadsheet | Source of truth for sector formulas and snapshots |
| Cloudflare Worker (`umm-dashboard`) | Serves UI, proxies refresh to Apps Script, stores/serves D1 snapshots |
| Cloudflare D1 `umm-snapshots` | Latest dashboard payload |

### Main Apps Script entry points

- `runDailyMarketPipeline()` — official sector snapshot, AI report, email, and dashboard publishing
- `runCrossAssetPipelineWithAllGuards()` — guarded cross-asset refresh and report
- `refreshUmmDashboardData_()` — dashboard-only refresh (no AI report, no email)
- `previewUmmDashboardSnapshot()` — log the payload without publishing
- `publishUmmSnapshotForDashboard()` — write Drive JSON + POST to Worker `/api/snapshot`
- `setupMarketCalendar()`, `setupCrossAssetConfig()`, `setupCrossAssetSheets()` — one-time sheet setup

## Prerequisites

- Access to the bound Google Spreadsheet and Apps Script project
- Ability to deploy an Apps Script **Web App**
- Cloudflare account with Worker `umm-dashboard` and D1 database `umm-snapshots` (see dashboard `wrangler.toml`)
- Values for secrets listed below (never commit them)

## Secrets and configuration (outside GitHub)

### Apps Script Script Properties

| Name | Purpose |
| --- | --- |
| `OPENROUTER_API_KEY` | Existing AI report path (leave config as-is; no new AI work) |
| `UMM_REFRESH_SECRET` | Shared secret for dashboard refresh `doPost` |

### Cloudflare Worker variables / secrets

| Name | Kind | Purpose |
| --- | --- | --- |
| `UMM_REFRESH_URL` | Variable | Apps Script Web App `/exec` URL |
| `UMM_REFRESH_SECRET` | **Secret** | Must match Apps Script `UMM_REFRESH_SECRET` exactly |

Redeploy the Worker after any variable or secret change.

### Hardcoded values in Apps Script today

Documented so setup matches production; change only with a deliberate code update:

- Drive folder id `UMM_FOLDER_ID` (snapshot JSON home)
- `CLOUDFLARE_SNAPSHOT_URL` — currently `https://umm-dashboard.65ng8nnrjp.workers.dev/api/snapshot`

## Ordered deploy (zero → snapshot on screen)

1. **Copy source** — Put every `.gs` file from this repo into the bound Apps Script project.
2. **Script Properties** — Set `OPENROUTER_API_KEY` and `UMM_REFRESH_SECRET`.
3. **Deploy Web App** — Deploy Apps Script as a Web App. Access must allow the Cloudflare Worker to `POST` without an interactive Google sign-in page.
4. **Note the `/exec` URL** — This becomes Cloudflare `UMM_REFRESH_URL`.
5. **Cloudflare env** — In Worker settings, set `UMM_REFRESH_URL` and `UMM_REFRESH_SECRET` (as a Secret). Values must match Apps Script with no leading/trailing spaces.
6. **Deploy Worker** — From [`umm-dashboard`](https://github.com/why19940119/umm-dashboard), deploy with Wrangler so D1 binding `DB` → `umm-snapshots` and assets are live.
7. **Seed or refresh** — Either run `publishUmmSnapshotForDashboard()` / `testRefreshUmmDashboard()` in Apps Script, or open the dashboard and click **刷新 UMM** once.
8. **Open dashboard** — Load the Worker URL (production hostname currently `umm-dashboard.65ng8nnrjp.workers.dev`). Confirm sectors / cross-assets render from D1.

## How to verify

1. Open the dashboard; status should show a generated-at timestamp or a clear “waiting for first snapshot” state (`NO_DATA`).
2. Click **刷新 UMM** once.
3. Confirm Apps Script execution succeeded and the dashboard timestamp updates after reload.
4. Confirm dashboard-only refresh did **not** send a duplicate email.
5. If refresh fails, follow [OPERATIONS.md](./OPERATIONS.md) (secret mismatch, missing env, Web App 403, empty D1).

## Repository map

| Repo | Contents |
| --- | --- |
| This repo (`umm`) | Apps Script sources, product setup, ops runbook, acceptance checklist |
| [`umm-dashboard`](https://github.com/why19940119/umm-dashboard) | Worker, D1 binding, static dashboard, API contract docs |

## Security

Never commit: API keys, refresh secrets, access tokens, Cloudflare tokens, Alpaca credentials, private spreadsheet dumps, generated snapshots, or local machine paths.

Do not put secrets in frontend HTML, Worker source, README, issues, PRs, or screenshots. Rotate immediately if a secret is exposed.

## Related docs

- [OPERATIONS.md](./OPERATIONS.md) — runbook and error interpretation
- [ACCEPTANCE.md](./ACCEPTANCE.md) — manual acceptance checklist
- [CHANGELOG.md](./CHANGELOG.md) — recent product changes
- [umm-dashboard README](https://github.com/why19940119/umm-dashboard#readme) — Worker API contracts
