const UMM_REFRESH_SECRET_PROPERTY = 'UMM_REFRESH_SECRET';

/**
 * Dashboard 專用刷新：
 * - 讀取 Google Sheets 內 11 大板塊 GOOGLEFINANCE 公式當刻值
 * - 更新 Yahoo cross-assets + freshness
 * - 建立 CrossAsset snapshot
 * - publish JSON 到 Drive + Cloudflare D1
 * - 不產生 AI report、不寄 Email
 */
function refreshUmmDashboardData_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return {
      status: 'BUSY',
      message: '另一個更新程序正在執行，請稍後再試。'
    };
  }

  try {
    Logger.log('=== Dashboard 即時刷新開始 ===');
    SpreadsheetApp.flush();
    Utilities.sleep(2500);
    SpreadsheetApp.flush();

    const freshnessRes = updateYahooLivePricesWithFreshness_();
    Logger.log('[Yahoo Cross-assets] 成功 ' + freshnessRes.successCount + '，失敗 ' + freshnessRes.errorCount);

    const crossAssetRes = createCrossAssetSnapshot();
    if (crossAssetRes.status !== 'SUCCESS') {
      return {
        status: 'FAILED_CROSS_ASSET',
        message: 'CrossAsset snapshot 失敗：' + crossAssetRes.status,
        freshness: freshnessRes,
        crossAsset: crossAssetRes
      };
    }

    const publishRes = publishUmmSnapshotForDashboard();

    return {
      status: 'SUCCESS',
      refreshedAtHkt: Utilities.formatDate(new Date(), 'Asia/Hong_Kong', 'yyyy-MM-dd HH:mm:ss'),
      sectorSource: 'Google Sheets GOOGLEFINANCE formulas',
      freshness: freshnessRes,
      crossAsset: crossAssetRes,
      publish: publishRes
    };
  } catch (error) {
    Logger.log('Dashboard refresh 失敗：' + error.toString());
    return { status: 'FAILED', message: error.toString() };
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  let body = {};
  try {
    body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
  } catch (error) {
    return jsonResponse_({ status: 'BAD_REQUEST', message: 'Request body 必須是 JSON。' });
  }

  const expectedSecret = PropertiesService.getScriptProperties().getProperty(UMM_REFRESH_SECRET_PROPERTY);
  if (!expectedSecret) return jsonResponse_({ status: 'SERVER_MISCONFIGURED', message: 'UMM_REFRESH_SECRET 未設定。' });
  if (body.secret !== expectedSecret) return jsonResponse_({ status: 'UNAUTHORIZED', message: 'Invalid refresh secret.' });

  return jsonResponse_(refreshUmmDashboardData_());
}

function doGet() {
  return jsonResponse_({ status: 'OK', service: 'UMM Dashboard Refresh API', message: 'Use POST with the refresh secret.' });
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function testRefreshUmmDashboard() {
  const result = refreshUmmDashboardData_();
  Logger.log(JSON.stringify(result, null, 2));
}
