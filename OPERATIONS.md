# UMM Operations Runbook

## System overview

The production flow is:

```text
Google Sheets
  -> Google Apps Script
  -> Cloudflare Worker
  -> Cloudflare D1
  -> UMM Dashboard
```

The dashboard-only refresh updates data and publishes a snapshot. It does not generate an AI report or send email.

## Normal checks

1. Open the dashboard and note the displayed data timestamp.
2. Use the dashboard refresh button once.
3. Confirm that the timestamp changes or that the response reports the latest snapshot.
4. Confirm the Apps Script execution completed.
5. Confirm the Cloudflare Worker deployment is active and serving production traffic.
6. Confirm that no duplicate email or duplicate snapshot was created.

## Refresh failure checklist

1. Check Cloudflare Worker Settings -> Variables and Secrets.
2. Confirm `UMM_REFRESH_URL` exists and points to the Apps Script Web App `/exec` URL.
3. Confirm `UMM_REFRESH_SECRET` exists as a Cloudflare Secret.
4. Confirm the Apps Script Script Property name is exactly `UMM_REFRESH_SECRET`.
5. Confirm both secret values match exactly without leading or trailing spaces.
6. Redeploy the Worker after changing a variable or secret.
7. Force-reload the browser.
8. Check the Worker deployment and logs.
9. Check Apps Script Executions and Logger output.

## Error interpretation

- `UMM_REFRESH_URL or UMM_REFRESH_SECRET missing`: a Worker runtime setting is missing or the active deployment has not picked it up.
- `Invalid refresh secret`: the Apps Script and Cloudflare secret values do not match.
- `UMM_REFRESH_SECRET 未設定`: the Apps Script Script Property is missing or misspelled.
- HTTP 403 or a Google sign-in page: review the Apps Script Web App access setting and deployment version.
- `No snapshot available`: the Worker is reachable, but D1 does not yet contain a snapshot.

## Logging rules

Safe log fields include timestamp, function name, route, HTTP status, deployment ID, commit ID, snapshot ID, row counts, and success/failure status.

Never log or commit:

- Refresh secrets.
- API keys.
- Access tokens.
- Private request bodies.
- Personal email addresses.
- Full private URLs containing credentials.

Use Apps Script Executions and `Logger.log()` for Apps Script diagnostics. Use Cloudflare Workers Logs, `console.log()`, or `wrangler tail` for Worker diagnostics.

## Recovery

- If the dashboard fails after a code deployment, inspect the active deployment first.
- If a secret is exposed, rotate it in Apps Script and Cloudflare, then redeploy.
- If D1 data is corrupted or lost, restore from the configured backup/export process.
- Do not repeatedly run the full daily pipeline while debugging; this can create duplicate snapshots or duplicate emails.
