// Research suitability is a planning rule, not a measured preservation guarantee.
export const GOALS = [
  ["content", "文字、詞彙與句法", "保留實際說出的內容，包含錯詞與不完整句。", "人工轉寫比對、CER / WER"],
  ["pragmatics", "語用與敘事內容", "分析回答意義與語境；若涉及語氣，另勾語調或情緒。", "人工語意與語境評分"],
  ["relative_f0", "相對語調", "保留升降走向，允許整體音域平移。", "去中位數半音輪廓相關與 RMSE"],
  ["tone", "中文詞彙聲調", "保留每個音節的聲調曲線，不以辨字正確取代聲調驗證。", "音節正規化 F0 RMSE、聲調正確率"],
  ["absolute_f0", "絕對音高 F0", "研究實際 Hz 與音域，不能整體改調。", "Hz / 半音 MAE、清濁音判定誤差"],
  ["formants", "共振峰 F1–F4 與母音空間", "保留共振峰軌跡與頻寬，不能做聲道頻率扭曲。", "F1–F4 誤差、頻寬與追蹤失敗率"],
  ["energy", "相對能量與重音", "保留強弱變化；固定增益可用，動態壓縮不可用。", "相對 dB RMSE、能量輪廓相關"],
  ["timing", "語速、停頓與流暢度", "保留音節、停頓與事件時間，不能只比音檔總長。", "事件起訖偏移、停頓與時長誤差"],
  ["vot", "VOT 與細部發音時序", "保留爆破到起聲的間隔。", "逐事件 VOT 偏移（ms）"],
  ["jitter", "Jitter 週期微擾", "需在裝置內對原始週期量測。", "與參考量測器比較、相對誤差與 ICC"],
  ["shimmer", "Shimmer 振幅微擾", "需在裝置內量測；麥克風 AGC 也會干擾。", "相對誤差、ICC、錄音增益條件"],
  ["quality", "CPP / HNR 與音質", "合成器會改變諧波與噪音，優先原音本地量測。", "dB 誤差、ICC、量測不確定度"],
  ["emotion", "情緒與態度", "語調、強弱、節奏與音質皆可能影響判讀。", "人工評分、SER UAR / CCC"],
  ["pronunciation", "發音偏誤與口音", "保留真實發音差異，避免 ASR / TTS 自動修正。", "人工語音標註、音素混淆與声學比對"],
  ["longitudinal", "跨次錄音比較", "固定量測版本與處理策略；跨次可連結也增加識別風險。", "批次一致性與跨次可連結性測試"]
].map(([id, label, note, metric]) => ({ id, label, note, metric }));

const acoustic = ["relative_f0", "tone", "absolute_f0", "formants", "energy", "timing", "vot", "jitter", "shimmer", "quality"];
export const MODELS = [
  { id: "profile_a", name: "PROFILE_A v2.0.1", engine: true, modes: ["audio"], supports: ["content", "pragmatics"], note: "既有裝置內引擎。固定 ±3 半音、共振峰偏移、限幅與 RMS 正規化；不承諾精密聲學保留。", modules: "改調、共振峰重塑、頻帶限制、限幅、音量正規化" },
  { id: "world_pitch", name: "WORLD 共振峰保留式改調", modes: ["audio"], supports: ["content", "pragmatics", "relative_f0", "tone", "formants", "timing"], note: "固定頻譜包絡、改變 F0；需驗證實際 F1–F4，不能保證逐點完全相同。", modules: "F0 × 2^(半音/12)、固定頻譜包絡、無時間伸縮" },
  { id: "psola", name: "PSOLA 相對語調方案", modes: ["audio"], supports: ["content", "pragmatics", "relative_f0", "tone", "timing"], note: "適合小幅度改調；起聲標記錯誤會造成失真，未列為精密共振峰保留方案。", modules: "週期同步疊加、固定時間映射" },
  { id: "world_f0", name: "WORLD 絕對 F0 保留方案", modes: ["audio"], supports: ["content", "pragmatics", "absolute_f0", "relative_f0", "tone", "timing"], note: "固定 F0、改變頻譜包絡；不適用共振峰研究。", modules: "固定 F0、聲道包絡轉換、無時間伸縮" },
  { id: "mcadams", name: "McAdams LPC 聲道轉換", modes: ["audio"], supports: ["content", "pragmatics"], note: "改變 LPC 極點角度與共振峰，須另驗內容可懂度。", modules: "LPC 分析、極點角度扭曲、重合成" },
  { id: "local_features", name: "本地聲學特徵提取", modes: ["features"], supports: acoustic.concat("longitudinal"), note: "只送數值與品質資訊，不能回聽；VOT 等事件仍需可靠分段及量測器驗證。", modules: "原音本地量測、追蹤信心、量測器版本鎖定" },
  { id: "hybrid", name: "本地量測＋轉換音訊", modes: ["hybrid"], supports: acoustic.concat("content", "pragmatics", "longitudinal"), note: "聲學分析使用原音本地數值；轉換音訊僅供內容聆聽，兩者不可混用。", modules: "原音本地量測、PROFILE_A 聆聽副本、分離品質報告" },
  { id: "local_text", name: "本地 ASR 純文字", modes: ["text"], supports: ["content", "pragmatics"], note: "不保留聲音；ASR 可能修正偏誤，文字亦可能包含身分線索。", modules: "裝置內 ASR、文字品質比對" },
  { id: "asr_tts", name: "ASR → TTS 重合成", modes: ["audio"], supports: ["content", "pragmatics"], note: "重新生成聲音，不適用原始語調、音質、口音與細部時序。", modules: "裝置內辨識、合成說話者、內容品質檢查" },
  { id: "neural_vc", name: "條件式神經音色轉換", modes: ["audio"], supports: ["content", "pragmatics", "emotion"], note: "AutoVC / StarGAN / flow / diffusion 候選族；尚未選定權重，情緒保留須獨立驗證。", modules: "內容／說話者分離、條件式音色轉換、情緒評估" }
];
export const OUTPUTS = { audio: "轉換後音訊", features: "僅聲學數值", hybrid: "聲學數值＋轉換音訊", text: "僅文字" };
export const defaultPlan = () => ({ schema: 1, goals: ["content"], output: "audio", model: "profile_a" });
export function candidates(plan) {
  const goals = Array.isArray(plan?.goals) ? plan.goals : [];
  return MODELS.map(model => {
    const reasons = [];
    if (!goals.length) reasons.push("尚未選擇研究目的");
    if (!model.modes.includes(plan?.output)) reasons.push(`需要${model.modes.map(mode => OUTPUTS[mode]).join("或")}輸出`);
    goals.forEach(id => { if (!model.supports.includes(id)) reasons.push(`不適用：${GOALS.find(goal => goal.id === id)?.label || "未知研究目的"}`); });
    return { ...model, reasons, compatible: reasons.length === 0 };
  });
}
export function planIssues(plan) {
  const model = candidates(plan).find(row => row.id === plan?.model);
  if (!model) return ["請選擇符合研究目的的處理方案"];
  if (!model.compatible) return model.reasons;
  if (!model.engine) return ["所選方案尚未接入本地處理引擎與驗證流程；可儲存草稿，尚不可發布收錄"];
  return [];
}
export function planManifest(plan) {
  const model = MODELS.find(row => row.id === plan.model);
  return { schema: 1, rulesVersion: "2026-10-08.1", goals: [...plan.goals], output: plan.output, model: plan.model,
    engineVersion: model?.engine ? "2.0.1" : null, runtimeIntegrated: Boolean(model?.engine),
    qualityValidation: "not_run", privacyValidation: "not_run", rawAudioUpload: false,
    requiredMetrics: GOALS.filter(goal => plan.goals.includes(goal.id)).map(goal => goal.metric) };
}
const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
export function mountPlanner(root, plan, onChange) {
  root.classList.add("voice-planner");
  root.innerHTML = `<h2>研究目的與去識別化方案</h2><p>選擇本專案必須保留的資訊。候選表示方法可評估，並非已通過研究效度或隱私驗證。</p>
    <fieldset class="voice-goals"><legend>1. 研究目的（可複選，所有條件須同時符合）</legend>${GOALS.map(goal => `<label><input type="checkbox" value="${goal.id}" ${plan.goals.includes(goal.id) ? "checked" : ""}><span><strong>${goal.label}</strong><small>${goal.note}</small></span></label>`).join("")}</fieldset>
    <label class="voice-output">2. 上傳資料形式<select>${Object.entries(OUTPUTS).map(([id, label]) => `<option value="${id}" ${plan.output === id ? "selected" : ""}>${label}</option>`).join("")}</select></label>
    <div class="voice-results" aria-live="polite"></div>`;
  const results = root.querySelector(".voice-results");
  function renderResults() {
    const rows = candidates(plan), suitable = rows.filter(row => row.compatible);
    const chosen = rows.find(row => row.id === plan.model && row.compatible);
    const rowHtml = row => `<article class="voice-model"><label><input type="radio" name="voice-model-${root.id}" value="${row.id}" ${chosen?.id === row.id ? "checked" : ""}><span><strong>${row.name}</strong><small>${row.engine ? "既有引擎 · 保留效度未驗證" : "規劃候選 · 引擎尚未接入"}</small></span></label><p>${row.note}</p><small>處理組合：${row.modules}</small></article>`;
    results.innerHTML = `<h3>3. 可評估方案（${suitable.length}）</h3>${suitable.length ? suitable.map(rowHtml).join("") : '<p class="voice-warning">目前沒有同時符合所有條件的方案。聲學量測可考慮「僅聲學數值」或「聲學數值＋轉換音訊」；無須放棄原本研究目標。</p>'}
      <details><summary>檢視排除原因（${rows.length - suitable.length}）</summary>${rows.filter(row => !row.compatible).map(row => `<div class="voice-excluded"><strong>${row.name}</strong><p>${row.reasons.join("；")}</p></div>`).join("")}</details>
      <div class="voice-decision"><strong>${chosen ? `已選擇：${chosen.name}` : "尚未選擇方案"}</strong><p>${chosen?.engine ? "可沿用既有處理引擎；仍需人工確認內容保留程度。" : "可儲存專案規劃；引擎與品質驗證完成前不得發布收錄。"}</p><small>研究效度：尚未測試　／　隱私攻擊評估：尚未測試</small></div>
      <details><summary>本專案必要驗證與版本紀錄</summary><ul>${GOALS.filter(goal => plan.goals.includes(goal.id)).map(goal => `<li>${goal.label}：${goal.metric}</li>`).join("")}<li>多種說話者辨識攻擊、韻律與文字可連結性評估；不以單一 EER 保證匿名。</li><li>錄音裝置的 AGC、降噪、回音消除狀態與量測信心需記錄。</li></ul><pre>${escape(JSON.stringify(planManifest(plan), null, 2))}</pre></details>`;
    results.querySelectorAll('input[type="radio"]').forEach(input => input.onchange = () => { plan.model = input.value; renderResults(); onChange(plan); });
  }
  root.querySelectorAll('.voice-goals input').forEach(input => input.onchange = () => {
    plan.goals = [...root.querySelectorAll('.voice-goals input:checked')].map(row => row.value);
    reconcile();
  });
  root.querySelector(".voice-output select").onchange = event => { plan.output = event.target.value; reconcile(); };
  function reconcile() {
    if (!candidates(plan).some(row => row.id === plan.model && row.compatible)) plan.model = null;
    renderResults(); onChange(plan);
  }
  renderResults();
}
