# Changelog

## 2026-09-03

### Security and repository hygiene

- Rotated the dashboard refresh secret after it appeared in a screenshot.
- Confirmed that runtime secrets remain outside GitHub.
- Removed generated `radar_snapshot.json` from the public dashboard repository.
- Removed the local macOS LaunchAgent plist from the public dashboard repository.

### Documentation

- Expanded the main UMM README with entry points, configuration, deployment flow, dashboard flow, data sources, and security rules.
- Added a debugging log and operations runbook.

## 2026-09-02

### Dashboard architecture

- Added Cloudflare D1 snapshot publishing.
- Added Cloudflare Worker `/api/snapshot` GET and POST routes.
- Added Cloudflare Worker `/api/refresh` POST route for Apps Script refresh.
- Changed the dashboard to read from Cloudflare `/api/snapshot`.
- Connected the dashboard refresh button to `/api/refresh`.
- Stopped automatic Pipedream polling to avoid unnecessary quota usage.

### Apps Script pipeline

- Updated the US sector monitor to v1.13.
- Added Cross-Asset Extension Parts 1 through 7.
- Added freshness checks and invalid-data guards.
- Added AI output validation and protection against internal reasoning text.
- Added dashboard snapshot building and publishing.
- Added a dashboard-only refresh API that does not generate AI reports or send email.

## Operational status

The dashboard refresh was manually tested successfully after the Cloudflare environment configuration and secret rotation were completed.

Generated snapshots and local machine configuration should remain outside the public repository.
