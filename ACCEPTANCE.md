# UMM Acceptance Checklist (manual)

Use after deploy or before merging product/docs changes. Dashboard-only refresh must not send email or invent new AI behavior.

## Pass criteria

- [ ] Dashboard URL loads (Worker + static assets); no blank/error shell
- [ ] `GET /api/snapshot` returns either a valid UMM payload (`source: "umm"`) **or** `404` with `status: "NO_DATA"` while waiting for first publish
- [ ] After one **刷新 UMM** click (or one Apps Script `testRefreshUmmDashboard` / `publishUmmSnapshotForDashboard`):
  - [ ] Apps Script execution completes without unauthorized / misconfigured secret errors
  - [ ] Worker refresh returns success-shaped JSON (not `SERVER_MISCONFIGURED` / `REFRESH_FAILED`)
  - [ ] Dashboard timestamp / snapshot id updates within a short reload window
- [ ] Sector table and cross-asset cards show data from D1 (not stuck on “載入中” after success)
- [ ] Existing AI summary section still renders prior report content if present — **no new model/prompt work required for this checklist**
- [ ] Dashboard-only refresh did **not** create a duplicate outbound email
- [ ] Negative checks (optional but recommended):
  - [ ] Missing Worker secret → `SERVER_MISCONFIGURED` (or equivalent) per [OPERATIONS.md](./OPERATIONS.md)
  - [ ] Mismatched secret → Apps Script `UNAUTHORIZED` / invalid refresh secret path

## Blockers that need a human

Record here if blocked:

- [ ] Cloudflare: set/redeploy `UMM_REFRESH_URL` / `UMM_REFRESH_SECRET`
- [ ] Apps Script: Web App deploy + Script Properties
- [ ] Confirm production Worker hostname and Drive folder id still match `UMM_Publish_Snapshot.gs`

## Sign-off

| Field | Value |
| --- | --- |
| Date (HKT) | |
| Tester | |
| Worker URL | |
| Result | PASS / FAIL |
| Notes | |
