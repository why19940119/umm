/** WP-UMM-3 Cross-Asset AI report + email helpers */

function generateCrossAssetAIReport_(snapshotId, marketDateET, mode) {
  const isManual = mode === 'MANUAL';
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const snapshotSheet = ss.getSheetByName(CONFIG_XA.SHEET_XA_SNAPSHOT);
  const aiReportSheet = ss.getSheetByName(CONFIG_XA.SHEET_XA_AI_REPORT);
  if (!snapshotSheet || !aiReportSheet) throw new Error('找不到 CrossAsset_Snapshot 或 CrossAsset_AI_Report。');

  const snapshotData = snapshotSheet.getDataRange().getValues();
  // Only SUCCESS rows may drive AI — STALE / NON_TRADING never contribute scary %.
  const successRows = snapshotData.filter(row => row[0] === snapshotId && row[3] === 'SUCCESS');
  const skippedRows = snapshotData.filter(row => row[0] === snapshotId && row[3] !== 'SUCCESS');
  if (successRows.length === 0) return { status: 'FAILED_NO_VALID_DATA' };

  const apiKey = PropertiesService.getScriptProperties().getProperty(CONFIG_XA.PROP_OPENROUTER_KEY_XA);
  if (!apiKey) throw new Error('找不到 OPENROUTER_API_KEY。');

  const dataJson = JSON.stringify(successRows.map(row => ({
    instrumentId: row[4],
    displayName: row[5],
    canonicalSymbol: row[11] || resolveUmmCanonicalSymbol_(row[4]),
    lastPrice: row[7],
    dayChangePct: row[8],
    priceUnit: row[9],
    asOfHkt: row[1],
    quoteAsOfEt: row[13] || ''
  })));
  const excludedList = skippedRows.map(row => {
    const flag = row[3] ? ` [${row[3]}]` : '';
    return `${row[5]}${flag}`;
  }).join('、') || '無';
  const prompt = `你係嚴格嘅跨資產市場數據分析助手。只可以使用我提供嘅表格數據，絕對唔可以自行加入新聞、利率、宏觀、財報、期權流、資金流或任何外部資訊。\n事實同推論必須分開，嚴禁給予任何買入、沽出、槓桿、倉位或止蝕建議。\n以下標的因資料未驗證、無效、STALE 或 NON_TRADING，已被排除：${excludedList}。\n如果數據不足或不完整，請明確輸出「數據不全無法判斷」。\n如數據中包含債券期貨，只可描述「期貨價格變動」，不可稱為「殖利率」變動。\n所有結論必須引用實際數值：Last Price 或 Day Change %。\n\n只輸出最終報告。第一個字必須是「【資產價格狀態】」。\n不得輸出 Thinking Process、推理步驟、英文草稿、分析過程、<think> 標籤或任何內部思考內容。\n\n請用繁體中文／廣東話，按以下固定格式輸出：\n【資產價格狀態】...\n【最大升幅標的】...\n【最大跌幅標的】...\n【訊號一致或矛盾】...\n【明日監察重點】...\n【資料限制】...\n\n數據：${dataJson}`;

  const payload = { model: CONFIG_XA.AI_MODEL_XA, messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 1500, reasoning: { effort: 'none', exclude: true } };
  const options = { method: 'post', contentType: 'application/json', headers: { Authorization: `Bearer ${apiKey}`, 'HTTP-Referer': 'https://us-market-monitor', 'X-Title': 'US Market Monitor - Cross Asset' }, payload: JSON.stringify(payload), muteHttpExceptions: true };

  try {
    const response = UrlFetchApp.fetch(CONFIG_XA.OPENROUTER_URL_XA, options);
    const httpCode = response.getResponseCode();
    const responseText = response.getContentText();
    let result = JSON.parse(responseText);
    if (httpCode < 200 || httpCode >= 300) throw new Error(`OpenRouter HTTP ${httpCode}: ${result.error?.message || responseText}`);
    const cleanReport = sanitizeCrossAssetAiOutput_(result.choices?.[0]?.message?.content);

    aiReportSheet.appendRow([new Date(), marketDateET, successRows[0][1], CONFIG_XA.AI_MODEL_XA, isManual ? 'MANUAL_SUCCESS' : 'SUCCESS', snapshotId, cleanReport, '', isManual ? 'MANUAL_PENDING' : 'PENDING']);
    SpreadsheetApp.flush();
    return { status: 'SUCCESS' };
  } catch (error) {
    aiReportSheet.appendRow([new Date(), marketDateET, successRows.length ? successRows[0][1] : '', CONFIG_XA.AI_MODEL_XA, isManual ? 'MANUAL_API_ERROR' : 'API_ERROR', snapshotId, '', error.toString(), 'NOT_SENT']);
    SpreadsheetApp.flush();
    return { status: 'FAILED_API_ERROR' };
  }
}

function sendCrossAssetReportEmail_(snapshotId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aiReportSheet = ss.getSheetByName(CONFIG_XA.SHEET_XA_AI_REPORT);
  if (!aiReportSheet) throw new Error(`找不到必要工作表：${CONFIG_XA.SHEET_XA_AI_REPORT}`);
  const data = aiReportSheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    if (row[5] === snapshotId && row[4] === 'SUCCESS' && row[8] === 'PENDING') {
      return sendCrossAssetReportRow_({ sheet: aiReportSheet, rowIndex: i + 1, row: row }, false);
    }
  }
  return { status: 'FAILED_NO_REPORT' };
}

function sendCrossAssetReportRow_(report, isManual) {
  if (!CONFIG_XA.RECIPIENT_EMAILS_XA || !CONFIG_XA.RECIPIENT_EMAILS_XA.length) return { status: 'FAILED_NO_RECIPIENTS' };
  const { row, sheet, rowIndex } = report;
  const marketDateET = row[1];
  const snapshotId = row[5];
  const reportContent = String(row[6] || '').trim();
  if (!reportContent) return { status: 'FAILED_EMPTY_REPORT' };

  sheet.getRange(rowIndex, 9).setValue(isManual ? 'MANUAL_SENDING' : 'SENDING');
  SpreadsheetApp.flush();
  try {
    const recipients = CONFIG_XA.RECIPIENT_EMAILS_XA.join(',');
    const subject = isManual ? `🧪 [手動報告] 跨資產監察 AI 分析報告 (${marketDateET})` : `📊 跨資產監察 AI 分析報告 (${marketDateET})`;
    const testNotice = isManual ? '注意：這是人工生成後、人工確認寄出的手動報告。\n\n' : '';
    const body = `【跨資產市場監察日報】\n\n${testNotice}美東市場日期 (Market Date ET): ${marketDateET}\nSnapshot ID: ${snapshotId}\n---------------------------------------\n\n${reportContent}\n\n---------------------------------------\n提示：此報告由系統自動生成，僅供參考，不構成投資建議。部分標的因資料未驗證、STALE 或 NON_TRADING 而被排除，詳情請查閱 CrossAsset_Config / CrossAsset_Snapshot。`;
    MailApp.sendEmail(recipients, subject, body);
    sheet.getRange(rowIndex, 9).setValue(isManual ? 'MANUAL_SENT' : 'SENT');
    SpreadsheetApp.flush();
    return { status: 'SUCCESS' };
  } catch (error) {
    sheet.getRange(rowIndex, 9).setValue(isManual ? 'MANUAL_EMAIL_FAILED' : 'FAILED');
    sheet.getRange(rowIndex, 8).setValue(error.toString());
    SpreadsheetApp.flush();
    return { status: 'FAILED_EMAIL_ERROR' };
  }
}

function sanitizeCrossAssetAiOutput_(content) {
  const rawText = String(content || '').trim();
  if (!rawText) throw new Error('AI 回應內容為空。');
  const startIndex = rawText.indexOf('【資產價格狀態】');
  if (startIndex === -1) throw new Error('AI 回應找不到正式報告起點【資產價格狀態】。');
  const finalReport = rawText.slice(startIndex).trim();
  const requiredSections = ['【資產價格狀態】', '【最大升幅標的】', '【最大跌幅標的】', '【訊號一致或矛盾】', '【明日監察重點】', '【資料限制】'];
  const missing = requiredSections.filter(section => !finalReport.includes(section));
  if (missing.length) throw new Error(`AI Cross-Asset 報告格式不完整，缺少：${missing.join('、')}。`);
  const forbidden = [/thinking process/i, /<think>/i, /<\/think>/i, /reasoning process/i, /^analysis\s*:/im];
  if (forbidden.some(pattern => pattern.test(finalReport))) throw new Error('AI Cross-Asset 報告內容仍包含內部推理文字。');
  return finalReport;
}
