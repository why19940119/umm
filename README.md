# UMM — US Market Monitor

Google Apps Script pipeline for monitoring the 11 major US market sectors and selected cross-asset instruments.

## Main entry points

- `runDailyMarketPipeline()` — official sector snapshot, AI report, email, and dashboard publishing flow.
- `runCrossAssetPipelineWithAllGuards()` — guarded cross-asset data refresh and report flow.
- `refreshUmmDashboardData_()` — dashboard-only refresh; updates market data and publishes a snapshot without generating an AI report or sending email.
- `previewUmmDashboardSnapshot()` — previews the dashboard payload in Apps Script logs.
- `publishUmmSnapshotForDashboard()` — publishes the current snapshot to Google Drive and Cloudflare D1.
- `setupMarketCalendar()` — creates or resets the US market holiday calendar.
- `setupCrossAssetConfig()` — creates the cross-asset configuration sheet.
- `setupCrossAssetSheets()` — creates the cross-asset snapshot and AI report sheets.

## Required configuration

### Google Apps Script Script Properties

Configure these values in the Apps Script project settings:

- `OPENROUTER_API_KEY`
- `UMM_REFRESH_SECRET`

The value of `UMM_REFRESH_SECRET` is used by the dashboard refresh API.

### Cloudflare Worker variables and secrets

Configure these values in Cloudflare Worker settings, outside this repository:

- `UMM_REFRESH_URL`
- `UMM_REFRESH_SECRET`

The Apps Script and Cloudflare `UMM_REFRESH_SECRET` values must match exactly.

`UMM_REFRESH_SECRET` should be stored as a Cloudflare Secret, not as a normal text variable.

## Deployment flow

1. Copy the `.gs` files into the bound Google Apps Script project.
2. Configure the required Apps Script Script Properties.
3. Deploy the Apps Script project as a Web App.
4. Set access to allow the dashboard Worker to call the Web App.
5. Add `UMM_REFRESH_URL` and `UMM_REFRESH_SECRET` to the Cloudflare Worker environment.
6. Deploy or redeploy the Cloudflare Worker.
7. Open the dashboard and test the refresh button.
8. Verify that the latest snapshot is published and displayed.

## Dashboard flow

The dashboard refresh flow is:

```text
Dashboard
  -> Cloudflare Worker /api/refresh
  -> Google Apps Script Web App
  -> Google Sheets data refresh
  -> Cross-asset update
  -> Snapshot publishing
  -> Cloudflare D1
  -> Dashboard /api/snapshot
```

The dashboard-only refresh does not generate an AI report and does not send email.

## Data sources

- Sector data is maintained in Google Sheets and uses Google Finance formulas.
- Cross-asset data may use Google Finance or Yahoo Finance quote retrieval, depending on the instrument mapping.
- AI reports use the configured OpenRouter model.
- Dashboard snapshots are published to the configured Google Drive folder and Cloudflare D1 endpoint.

## Security rules

Never commit any of the following to GitHub:

- API keys.
- Refresh secrets.
- Access tokens.
- Cloudflare tokens.
- Alpaca credentials.
- Private spreadsheet data.
- Generated private market snapshots.
- Local machine configuration files.
- Personal file paths.

Do not place secrets in:

- Frontend HTML.
- Cloudflare Worker source code.
- README files.
- GitHub issues or pull requests.
- Screenshots or public messages.

Rotate a secret immediately if it appears in a screenshot, log, commit, issue, pull request, or public message.

## Repository structure

The repository contains the Google Apps Script source files for:

- US sector monitoring.
- Cross-asset monitoring.
- AI report generation.
- Dashboard snapshot publishing.
- Dashboard refresh API integration.

Generated market snapshots should remain in Google Drive, Cloudflare D1, or other configured storage layers rather than being committed to GitHub.

## Operational notes

- Use `runDailyMarketPipeline()` for the official automated workflow.
- Use the manual report functions when a report requires human review before sending.
- Use `refreshUmmDashboardData_()` for dashboard refresh only.
- Avoid running the full daily pipeline repeatedly, because it may create duplicate snapshots or send duplicate emails.
- Keep the Apps Script and Cloudflare refresh secrets synchronized.
- Redeploy the Cloudflare Worker after changing its variables or secrets.
