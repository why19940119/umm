# UMM Debug Log

## Scope

This log records the UMM dashboard debugging and deployment work performed on 2026-09-02 and 2026-09-03. It intentionally excludes secrets, API keys, tokens, private email addresses, and private request bodies.

## Timeline

### Dashboard refresh configuration

- Symptom: The dashboard displayed `UMM_REFRESH_URL or UMM_REFRESH_SECRET missing in Cloudflare environment`.
- Root cause: The Cloudflare Worker environment did not yet contain both required runtime settings, or the active deployment had not yet picked up the settings.
- Fix: Added `UMM_REFRESH_URL` as a normal variable and `UMM_REFRESH_SECRET` as a secret in the `umm-dashboard` Worker settings, then redeployed.
- Verification: The dashboard refresh completed successfully.

### Deployment propagation

- Symptom: The variables appeared in the Cloudflare dashboard, but the site initially continued to show the old configuration error.
- Root cause: Deployment propagation and browser cache made the previous response remain visible temporarily.
- Fix: Confirmed the active deployment, verified 100 percent traffic, redeployed where required, and force-reloaded the browser.
- Verification: The site subsequently refreshed without the configuration error.

### Secret rotation

- Reason: The previous refresh secret appeared in a screenshot and was treated as exposed.
- Fix: Generated a new refresh secret, updated the Apps Script Script Property, updated the Cloudflare Worker secret, and redeployed.
- Verification: Dashboard refresh continued to work using the new value.

### GitHub repository cleanup

- Risk: Generated radar data and a local macOS LaunchAgent configuration were not suitable for a public repository.
- Fix: Removed `radar_snapshot.json` and `com.why19940119.umm-radar.plist` from `why19940119/umm-dashboard`.
- Verification: Both removal commits completed successfully.

### Documentation

- Fix: Expanded the UMM README with entry points, deployment flow, data flow, and secret-handling rules.
- Verification: README update completed successfully.

## Lessons learned

1. Runtime variables must be configured in the environment that serves production traffic.
2. A Cloudflare variable change requires a deployment or redeployment before it is reliably used by the active Worker.
3. Browser cache can make a resolved configuration problem appear to persist.
4. A secret shown in a screenshot must be rotated even if it was never committed to GitHub.
5. Generated snapshots and local machine configuration should not be committed to a public repository.
