/**
 * LEGACY FILE — intentionally empty of function definitions.
 *
 * Previously this file defined buildUmmDashboardSnapshot_ / publishUmmSnapshotForDashboard
 * that only notified Pipedream. That implementation overwrote (or was the only deployed)
 * Cloudflare publisher and caused: refresh SUCCESS + Drive write OK + Pipedream 400 + D1 never updated.
 *
 * Canonical implementation: UMM_Publish_Snapshot.gs
 * After pulling this change into Apps Script, delete any leftover Pipedream-only copies of
 * publishUmmSnapshotForDashboard from the project, then redeploy the Web App.
 */
