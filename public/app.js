import { STUDY_CONFIG } from "./study-config.js";
import { transformRecording } from "./audio-transform.js";
import { createSubmission, finalizeSubmission, getPublishedStudyConfig, getStudyStatus, uploadTransformedAudio } from "./api-client.js";

let runtimeConfig = STUDY_CONFIG;

const state = {
  step: 0, taskIndex: 0, profile: null, submissionId: null,
  processedAudio: new Map(), stimulusPlays: new Map(), recordingAttempts: new Map(),
  previewUrl: null, mediaRecorder: null, mediaStream: null, recordingChunks: [], recordTimer: null, recordingStartedAt: 0,
  devicePlayed: false, deviceRecorded: false, deviceRecorder: null, deviceStream: null,
  deviceChunks: [], deviceTimer: null, deviceStartedAt: 0, devicePreviewUrl: null, deviceProcessedAudio: null
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  languageGate: $("#language-gate"), platformLanguage: $("#platform-language"), enterPlatform: $("#enter-platform"),
  changeLanguage: $("#change-language"), translateStatus: $("#translate-status"),
  alert: $("#global-alert"), consent: $("#consent"), consentNext: $("#consent-next"),
  profileForm: $("#profile-form"), profileNext: $("#profile-next"), addOtherLanguage: $("#add-other-language"), otherLanguages: $("#other-languages"),
  panels: [...document.querySelectorAll("[data-step-panel]")], progress: [...document.querySelectorAll("#progress-list li")], taskProgressLabel: $("#task-progress-label"),
  devicePlay: $("#device-play"), deviceAudio: $("#device-audio"), deviceRecord: $("#device-record"), deviceStatus: $("#device-status"), deviceHelp: $("#device-help"),
  deviceTime: $("#device-time"), devicePreview: $("#device-preview"), deviceHeardConfirm: $("#device-heard-confirm"), deviceNext: $("#device-next"),
  taskCount: $("#task-count"), taskTitle: $("#task-title"), taskStatus: $("#task-status"),
  taskInstructions: $("#task-instructions"), playbackPolicy: $("#playback-policy"), stimulusAudio: $("#stimulus-audio"),
  stimulusTime: $("#stimulus-time"), playStimulus: $("#play-stimulus"), recordButton: $("#record-button"), recordAttempts: $("#record-attempts"),
  recordLabel: $("#record-label"), recordHelp: $("#record-help"), recordTime: $("#record-time"), processingRow: $("#processing-row"),
  previewRow: $("#preview-row"), processedPreview: $("#processed-preview"), rerecordButton: $("#rerecord-button"),
  taskBack: $("#task-back"), taskNext: $("#task-next"), downloadProof: $("#download-proof")
};

document.body.classList.add("language-locked");

function showAlert(message) {
  elements.alert.textContent = message;
  elements.alert.hidden = false;
  elements.alert.scrollIntoView({ behavior: "smooth", block: "center" });
}
function clearAlert() { elements.alert.hidden = true; elements.alert.textContent = ""; }
function setStep(nextStep) {
  state.step = nextStep;
  clearAlert();
  elements.panels.forEach((panel) => panel.classList.toggle("is-visible", Number(panel.dataset.stepPanel) === nextStep));
  elements.progress.forEach((item, index) => {
    item.classList.toggle("is-active", index === nextStep);
    item.classList.toggle("is-complete", index < nextStep);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
function currentTask() { return runtimeConfig.tasks[state.taskIndex]; }
function activeTransformProfile() {
  const profile = runtimeConfig.transformProfiles[state.profile?.biological_sex];
  if (!profile) throw new Error("找不到適用的聲音去識別化設定。");
  return profile;
}
function validateTaskConfiguration(task) {
  if (task.play_once === task.replay_allowed) throw new Error(`題目 ${task.task_id} 的播放規則互相矛盾。`);
  if (task.max_playbacks !== 2 || task.max_recordings !== 2) throw new Error(`題目 ${task.task_id} 必須設定為播放及錄音各兩次。`);
}

function resetPreview() {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = null;
  elements.processedPreview.removeAttribute("src");
  elements.previewRow.hidden = true;
  elements.taskNext.disabled = true;
  elements.taskStatus.textContent = "尚未錄音";
  elements.taskStatus.classList.remove("ready");
}
function updateTaskLimits() {
  const task = currentTask();
  const plays = state.stimulusPlays.get(task.task_id) || 0;
  const recordings = state.recordingAttempts.get(task.task_id) || 0;
  elements.playbackPolicy.textContent = `播放 ${plays} / ${task.max_playbacks} 次`;
  elements.recordAttempts.textContent = `錄音 ${recordings} / ${task.max_recordings} 次`;
  const recording = state.mediaRecorder?.state === "recording";
  elements.recordButton.disabled = !recording && recordings >= task.max_recordings;
  elements.rerecordButton.hidden = recordings >= task.max_recordings;
  if (elements.stimulusAudio.paused) elements.playStimulus.disabled = plays >= task.max_playbacks;
}
function showProcessedPreview(blob) {
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  state.previewUrl = URL.createObjectURL(blob);
  elements.processedPreview.src = state.previewUrl;
  elements.previewRow.hidden = false;
  elements.taskNext.disabled = false;
  elements.taskStatus.textContent = "已完成本機轉換";
  elements.taskStatus.classList.add("ready");
  elements.recordLabel.textContent = "轉換後音訊已就緒";
  elements.recordHelp.textContent = "可先播放確認；送出時只上傳此版本";
  updateTaskLimits();
}
function renderTask() {
  clearAlert();
  resetPreview();
  const task = currentTask();
  validateTaskConfiguration(task);
  elements.taskCount.textContent = `口說任務 ${state.taskIndex + 1} / ${runtimeConfig.tasks.length}`;
  elements.taskTitle.textContent = task.title;
  elements.taskInstructions.textContent = task.research_instructions;
  elements.stimulusAudio.src = task.audio_stimulus;
  elements.stimulusTime.textContent = "00:00";
  elements.playStimulus.textContent = "▶";
  elements.playStimulus.classList.remove("is-playing");
  elements.recordTime.textContent = "00:00";
  elements.recordLabel.textContent = "點一下開始錄音";
  elements.recordHelp.textContent = "每題最多錄音 2 次，以最後一次錄音送出";
  elements.recordButton.classList.remove("is-recording");
  elements.taskNext.textContent = state.taskIndex === runtimeConfig.tasks.length - 1 ? "送出研究資料 →" : "儲存並下一題 →";
  updateTaskLimits();
  const existing = state.processedAudio.get(task.task_id);
  if (existing) showProcessedPreview(existing);
}

async function playStimulus() {
  const task = currentTask();
  if (!elements.stimulusAudio.paused) { elements.stimulusAudio.pause(); return; }
  const plays = state.stimulusPlays.get(task.task_id) || 0;
  if (plays >= task.max_playbacks) return;
  try {
    clearAlert();
    await elements.stimulusAudio.play();
    state.stimulusPlays.set(task.task_id, plays + 1);
    updateTaskLimits();
  } catch { showAlert("問題語音無法播放。請返回設備與資格確認，確認喇叭後再試一次。"); }
}

function selectRecorderMimeType() {
  return ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type)) || "";
}
function assertRecordingSupport() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error("此瀏覽器不支援錄音。請改用最新版 Chrome、Edge 或 Safari。");
}
function stopMediaTracks() { state.mediaStream?.getTracks().forEach((track) => track.stop()); state.mediaStream = null; }
function stopRecording() {
  if (state.mediaRecorder?.state === "recording") state.mediaRecorder.stop();
  clearInterval(state.recordTimer);
  state.recordTimer = null;
  stopMediaTracks();
  elements.recordButton.classList.remove("is-recording");
  elements.recordButton.setAttribute("aria-label", "開始錄音");
}
async function startRecording() {
  assertRecordingSupport();
  const task = currentTask();
  const attempts = state.recordingAttempts.get(task.task_id) || 0;
  if (attempts >= task.max_recordings) return;
  clearAlert();
  resetPreview();
  state.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  state.recordingChunks = [];
  const mimeType = selectRecorderMimeType();
  state.mediaRecorder = mimeType ? new MediaRecorder(state.mediaStream, { mimeType }) : new MediaRecorder(state.mediaStream);
  state.mediaRecorder.addEventListener("dataavailable", (event) => { if (event.data.size > 0) state.recordingChunks.push(event.data); });
  state.mediaRecorder.addEventListener("stop", finishRecording, { once: true });
  state.mediaRecorder.start(250);
  state.recordingAttempts.set(task.task_id, attempts + 1);
  state.recordingStartedAt = Date.now();
  elements.recordButton.classList.add("is-recording");
  elements.recordButton.disabled = false;
  elements.recordButton.setAttribute("aria-label", "停止錄音");
  elements.recordLabel.textContent = "錄音中，點一下停止";
  elements.recordHelp.textContent = `最長 ${runtimeConfig.maxRecordingSeconds} 秒`;
  updateTaskLimits();
  state.recordTimer = setInterval(() => {
    const elapsed = (Date.now() - state.recordingStartedAt) / 1000;
    elements.recordTime.textContent = formatTime(elapsed);
    if (elapsed >= runtimeConfig.maxRecordingSeconds) stopRecording();
  }, 200);
}
async function finishRecording() {
  const rawBlob = new Blob(state.recordingChunks, { type: state.mediaRecorder?.mimeType || "audio/webm" });
  state.recordingChunks = [];
  state.mediaRecorder = null;
  elements.recordButton.disabled = true;
  elements.processingRow.hidden = false;
  elements.recordLabel.textContent = "錄音完成";
  elements.recordHelp.textContent = "正在準備去識別化預覽";
  try {
    const transformedBlob = await transformRecording(rawBlob, activeTransformProfile());
    state.processedAudio.set(currentTask().task_id, transformedBlob);
    showProcessedPreview(transformedBlob);
  } catch (error) {
    showAlert(`${error.message} 原始錄音未上傳。`);
    elements.recordLabel.textContent = "處理失敗";
    elements.recordHelp.textContent = "沒有任何原始音檔被送出";
  } finally { elements.processingRow.hidden = true; updateTaskLimits(); }
}
async function saveCurrentTask() {
  const task = currentTask();
  const audio = state.processedAudio.get(task.task_id);
  if (!audio) return;
  clearAlert();
  elements.taskNext.disabled = true;
  elements.taskNext.textContent = "正在安全上傳…";
  try {
    await uploadTransformedAudio(state.submissionId, task, audio, activeTransformProfile());
    if (state.taskIndex < runtimeConfig.tasks.length - 1) { state.taskIndex += 1; renderTask(); }
    else {
      await finalizeSubmission(state.submissionId);
      setStep(4);
    }
  } catch (error) {
    showAlert(`${error.message} 已轉換的錄音仍保留在此頁，可直接重試。`);
    elements.taskNext.disabled = false;
    elements.taskNext.textContent = state.taskIndex === runtimeConfig.tasks.length - 1 ? "重新送出研究資料 →" : "重新上傳並下一題 →";
  }
}

function updateDeviceReadyState() {
  elements.deviceHeardConfirm.disabled = !state.devicePlayed;
  const ready = state.devicePlayed && elements.deviceHeardConfirm.checked && state.deviceRecorded && state.deviceProcessedAudio;
  elements.deviceNext.disabled = !ready;
  if (ready) {
    elements.deviceStatus.textContent = "設備與資格確認已完成";
    elements.deviceHelp.textContent = "可播放去識別化預覽；繼續後只上傳這個轉換版本。";
  }
}
async function playDeviceMusic() {
  if (!elements.deviceAudio.paused) { elements.deviceAudio.pause(); return; }
  clearAlert();
  elements.deviceAudio.currentTime = 0;
  try { await elements.deviceAudio.play(); }
  catch { showAlert("測試音樂無法播放，請確認裝置音量或改用最新版瀏覽器後重試。"); }
}
function stopDeviceTracks() { state.deviceStream?.getTracks().forEach((track) => track.stop()); state.deviceStream = null; }
function stopDeviceRecording() {
  if (state.deviceRecorder?.state === "recording") state.deviceRecorder.stop();
  clearInterval(state.deviceTimer);
  state.deviceTimer = null;
  stopDeviceTracks();
  elements.deviceRecord.classList.remove("is-recording");
}
async function startDeviceRecording() {
  assertRecordingSupport();
  clearAlert();
  state.deviceRecorded = false;
  state.deviceProcessedAudio = null;
  updateDeviceReadyState();
  elements.devicePreview.hidden = true;
  if (state.devicePreviewUrl) URL.revokeObjectURL(state.devicePreviewUrl);
  state.devicePreviewUrl = null;
  elements.devicePreview.removeAttribute("src");
  state.deviceStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  state.deviceChunks = [];
  const mimeType = selectRecorderMimeType();
  state.deviceRecorder = mimeType ? new MediaRecorder(state.deviceStream, { mimeType }) : new MediaRecorder(state.deviceStream);
  state.deviceRecorder.addEventListener("dataavailable", (event) => { if (event.data.size > 0) state.deviceChunks.push(event.data); });
  state.deviceRecorder.addEventListener("stop", finishDeviceRecording, { once: true });
  state.deviceRecorder.start(250);
  state.deviceStartedAt = Date.now();
  elements.deviceRecord.classList.add("is-recording");
  elements.deviceStatus.textContent = "第一語言錄音中";
  elements.deviceHelp.textContent = "請自然描述今天早上、中午和晚上的天氣，再按一次停止。";
  state.deviceTimer = setInterval(() => {
    const elapsed = (Date.now() - state.deviceStartedAt) / 1000;
    elements.deviceTime.textContent = formatTime(elapsed);
    if (elapsed >= 20) stopDeviceRecording();
  }, 200);
}
async function finishDeviceRecording() {
  const rawBlob = new Blob(state.deviceChunks, { type: state.deviceRecorder?.mimeType || "audio/webm" });
  state.deviceChunks = [];
  state.deviceRecorder = null;
  elements.deviceRecord.disabled = true;
  elements.deviceStatus.textContent = `正在進行 ${activeTransformProfile().version} 去識別化`;
  elements.deviceHelp.textContent = "原始測試錄音只在瀏覽器記憶體中處理，不會上傳或保存。";
  try {
    const transformedBlob = await transformRecording(rawBlob, activeTransformProfile());
    if (state.devicePreviewUrl) URL.revokeObjectURL(state.devicePreviewUrl);
    state.devicePreviewUrl = URL.createObjectURL(transformedBlob);
    elements.devicePreview.src = state.devicePreviewUrl;
    elements.devicePreview.hidden = false;
    state.deviceProcessedAudio = transformedBlob;
    state.deviceRecorded = true;
    updateDeviceReadyState();
  } catch (error) {
    state.deviceRecorded = false;
    state.deviceProcessedAudio = null;
    elements.deviceStatus.textContent = "去識別化處理失敗";
    elements.deviceHelp.textContent = "原始測試錄音未上傳也未保存，請重新錄製。";
    showAlert(`${error.message} 原始測試錄音未上傳或保存。`);
  } finally {
    elements.deviceRecord.disabled = false;
  }
}

function addOtherLanguageField() {
  const count = elements.otherLanguages.querySelectorAll("input").length;
  if (count >= 5) { showAlert("其他語言欄位最多可新增五個。如仍不足，請聯絡研究人員調整設定。"); return; }
  const row = document.createElement("div");
  row.className = "repeatable-row";
  const input = document.createElement("input");
  Object.assign(input, { name: "other_languages", maxLength: 40, placeholder: `其他語言 ${count + 1}`, autocomplete: "off" });
  const remove = document.createElement("button");
  Object.assign(remove, { type: "button", className: "remove-language", title: "移除此語言欄位", textContent: "×" });
  remove.setAttribute("aria-label", "移除此語言欄位");
  remove.addEventListener("click", () => row.remove());
  row.append(input, remove);
  elements.otherLanguages.append(row);
  input.focus();
}

function drawResearchMark(context, x, y, size) {
  const scale = size / 64;
  context.save();
  context.translate(x, y);
  context.scale(scale, scale);
  context.fillStyle = "#176b51";
  context.fillRect(0, 0, 64, 64);
  context.lineWidth = 4;
  context.lineCap = "round";
  [[18, 32, 27, "#ffffff"], [25, 34, 21, "#e4b84d"], [32, 35, 14, "#ffffff"], [39, 34, 20, "#d65c45"], [46, 32, 26, "#ffffff"]].forEach(([lineX, bottom, top, color]) => {
    context.strokeStyle = color;
    context.beginPath();
    context.moveTo(lineX, bottom);
    context.lineTo(lineX, top);
    context.stroke();
  });
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.moveTo(10, 40);
  context.bezierCurveTo(18, 38, 25, 40, 32, 45);
  context.lineTo(32, 55);
  context.bezierCurveTo(25, 50, 18, 48, 10, 50);
  context.closePath();
  context.fill();
  context.beginPath();
  context.moveTo(54, 40);
  context.bezierCurveTo(46, 38, 39, 40, 32, 45);
  context.lineTo(32, 55);
  context.bezierCurveTo(39, 50, 46, 48, 54, 50);
  context.closePath();
  context.fill();
  context.strokeStyle = "#176b51";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(32, 45);
  context.lineTo(32, 55);
  context.stroke();
  context.restore();
}

function downloadCompletionProof() {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 750;
  const context = canvas.getContext("2d");
  context.fillStyle = "#f4f1ea";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#fffefa";
  context.fillRect(80, 70, 1040, 610);
  context.fillStyle = "#176b51";
  context.fillRect(80, 70, 1040, 12);
  drawResearchMark(context, 150, 145, 70);
  context.fillStyle = "#176b51";
  context.font = "700 24px sans-serif";
  context.textAlign = "left";
  context.fillText("去識別化語音研究 / De-identified Speech Research", 250, 176);
  context.fillStyle = "#1d2925";
  context.font = "700 56px serif";
  context.textAlign = "center";
  context.fillText("完成證明 / Completion Confirmation", 600, 320);
  context.fillStyle = "#176b51";
  context.font = "700 42px sans-serif";
  context.fillText("已完成 / Completed", 600, 410);
  context.fillStyle = "#637069";
  context.font = "24px sans-serif";
  context.fillText("本證明不含提交編號、個人資料或研究內容。", 600, 505);
  context.font = "20px sans-serif";
  context.fillText("Contains no submission ID, personal data, or study response.", 600, 548);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "speech-study-completion.png";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

function closeLanguageGate() {
  elements.languageGate.hidden = true;
  document.body.classList.remove("language-locked");
}
function activateGoogleTranslation(language) {
  const combo = document.querySelector(".goog-te-combo");
  if (!combo) return false;
  combo.value = language;
  combo.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}
elements.enterPlatform.addEventListener("click", () => {
  const language = elements.platformLanguage.value;
  sessionStorage.setItem("platformLanguage", language);
  if (language === "zh-TW") {
    document.cookie = "googtrans=; Max-Age=0; path=/";
    window.location.reload();
    return;
  }
  document.cookie = `googtrans=/zh-TW/${language}; path=/; SameSite=Lax`;
  if (activateGoogleTranslation(language)) closeLanguageGate();
  else window.location.reload();
});
elements.changeLanguage.addEventListener("click", () => {
  elements.languageGate.hidden = false;
  document.body.classList.add("language-locked");
});
document.addEventListener("google-translate-ready", () => { elements.translateStatus.textContent = "選擇語言後繼續 / Select a language to continue."; });

const savedLanguage = sessionStorage.getItem("platformLanguage");
if (savedLanguage) {
  elements.platformLanguage.value = savedLanguage;
  if (savedLanguage !== "zh-TW") document.cookie = `googtrans=/zh-TW/${savedLanguage}; path=/; SameSite=Lax`;
  closeLanguageGate();
}
elements.consent.addEventListener("change", () => { elements.consentNext.disabled = !elements.consent.checked; });
elements.consentNext.addEventListener("click", () => setStep(1));
document.querySelectorAll("[data-back]").forEach((button) => button.addEventListener("click", () => setStep(Number(button.dataset.back))));
elements.addOtherLanguage.addEventListener("click", addOtherLanguageField);
elements.profileNext.addEventListener("click", () => {
  if (!elements.profileForm.reportValidity()) return;
  const data = new FormData(elements.profileForm);
  const otherLanguages = data.getAll("other_languages").map((value) => value.trim()).filter(Boolean);
  state.profile = {
    age_group: data.get("age_group"), biological_sex: data.get("biological_sex"), nationality: data.get("nationality").trim(),
    language_background: otherLanguages.length > 0 ? "multilingual" : "bilingual",
    first_language: data.get("first_language").trim(), second_languages: ["中文（普通話）", ...otherLanguages],
    mandarin_learning_years: Number(data.get("mandarin_learning_years"))
  };
  setStep(2);
});
elements.devicePlay.addEventListener("click", playDeviceMusic);
elements.deviceAudio.addEventListener("play", () => { elements.devicePlay.textContent = "Ⅱ"; });
elements.deviceAudio.addEventListener("pause", () => { elements.devicePlay.textContent = "▶"; });
elements.deviceAudio.addEventListener("ended", () => {
  state.devicePlayed = true;
  elements.devicePlay.textContent = "▶";
  elements.deviceHeardConfirm.disabled = false;
  if (!state.deviceRecorded) {
    elements.deviceStatus.textContent = "測試音樂播放完成";
    elements.deviceHelp.textContent = "若能清楚聽見，請勾選確認，再完成第一語言錄音。";
  }
  updateDeviceReadyState();
});
elements.deviceAudio.addEventListener("error", () => { showAlert("測試音樂載入失敗，請重新整理頁面後再試。"); });
elements.deviceRecord.addEventListener("click", async () => {
  if (state.deviceRecorder?.state === "recording") { stopDeviceRecording(); return; }
  try { await startDeviceRecording(); }
  catch (error) { stopDeviceTracks(); showAlert(error.name === "NotAllowedError" ? "無法使用麥克風。請允許麥克風權限後再試。" : error.message); }
});
elements.deviceHeardConfirm.addEventListener("change", updateDeviceReadyState);
elements.deviceNext.addEventListener("click", async () => {
  if (!elements.deviceHeardConfirm.checked || !state.deviceProcessedAudio || !state.profile) return;
  elements.deviceNext.disabled = true;
  elements.deviceNext.textContent = "正在上傳去識別化資格錄音…";
  try {
    const result = await createSubmission(state.profile, runtimeConfig);
    state.submissionId = result.submission_id;
    await uploadTransformedAudio(state.submissionId, runtimeConfig.eligibilityTask, state.deviceProcessedAudio, activeTransformProfile());
    setStep(3);
    renderTask();
  } catch (error) {
    showAlert(error.message);
    elements.deviceNext.disabled = false;
    elements.deviceNext.textContent = "重新上傳資格錄音並繼續 →";
  }
});

elements.playStimulus.addEventListener("click", playStimulus);
elements.stimulusAudio.addEventListener("play", () => { elements.playStimulus.textContent = "Ⅱ"; elements.playStimulus.classList.add("is-playing"); });
elements.stimulusAudio.addEventListener("pause", () => { elements.playStimulus.textContent = "▶"; elements.playStimulus.classList.remove("is-playing"); updateTaskLimits(); });
elements.stimulusAudio.addEventListener("ended", updateTaskLimits);
elements.stimulusAudio.addEventListener("timeupdate", () => { elements.stimulusTime.textContent = formatTime(elements.stimulusAudio.currentTime); });
elements.recordButton.addEventListener("click", async () => {
  if (state.mediaRecorder?.state === "recording") { stopRecording(); return; }
  try { await startRecording(); }
  catch (error) { stopMediaTracks(); showAlert(error.name === "NotAllowedError" ? "無法使用麥克風。請在瀏覽器網址列允許麥克風權限後重試。" : error.message); }
});
elements.rerecordButton.addEventListener("click", () => {
  state.processedAudio.delete(currentTask().task_id);
  resetPreview();
  elements.recordLabel.textContent = "點一下開始重新錄音";
  updateTaskLimits();
});
elements.taskBack.addEventListener("click", () => {
  if (state.taskIndex > 0) { state.taskIndex -= 1; renderTask(); }
  else setStep(2);
});
elements.taskNext.addEventListener("click", saveCurrentTask);
elements.downloadProof.addEventListener("click", downloadCompletionProof);
window.addEventListener("beforeunload", () => {
  stopMediaTracks(); stopDeviceTracks();
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
  if (state.devicePreviewUrl) URL.revokeObjectURL(state.devicePreviewUrl);
});

try {
  if (window.location.hostname.endsWith(".pages.dev")) {
    const [published, availability] = await Promise.all([getPublishedStudyConfig(), getStudyStatus()]);
    runtimeConfig = { ...STUDY_CONFIG, version: `published-${published.version}`, tasks: published.tasks };
    if (!availability.open) {
      elements.consent.disabled = true;
      elements.consentNext.disabled = true;
      showAlert("本研究目前已停止收件，暫時無法建立新的提交。感謝你的關注。");
    }
  }
} catch (error) {
  console.warn("Published study configuration unavailable; using bundled fallback.", error);
}
elements.taskProgressLabel.textContent = `${runtimeConfig.tasks.length} 題`;
