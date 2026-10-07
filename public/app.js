import { STUDY_CONFIG } from "./study-config.js";
import { transformRecording } from "./audio-transform.js";
import { createSubmission, finalizeSubmission, uploadTransformedAudio } from "./api-client.js";

const state = {
  step: 0, taskIndex: 0, profile: null, submissionId: null,
  processedAudio: new Map(), stimulusPlays: new Map(), recordingAttempts: new Map(),
  previewUrl: null, mediaRecorder: null, mediaStream: null, recordingChunks: [], recordTimer: null, recordingStartedAt: 0,
  devicePlayed: false, deviceRecorded: false, deviceRecorder: null, deviceStream: null,
  deviceChunks: [], deviceTimer: null, deviceStartedAt: 0, devicePreviewUrl: null
};

const $ = (selector) => document.querySelector(selector);
const elements = {
  languageGate: $("#language-gate"), platformLanguage: $("#platform-language"), enterPlatform: $("#enter-platform"),
  changeLanguage: $("#change-language"), translateStatus: $("#translate-status"),
  alert: $("#global-alert"), consent: $("#consent"), consentNext: $("#consent-next"),
  profileForm: $("#profile-form"), profileNext: $("#profile-next"), addLanguage: $("#add-language"), secondLanguages: $("#second-languages"),
  panels: [...document.querySelectorAll("[data-step-panel]")], progress: [...document.querySelectorAll("#progress-list li")], taskProgressLabel: $("#task-progress-label"),
  devicePlay: $("#device-play"), deviceRecord: $("#device-record"), deviceStatus: $("#device-status"), deviceHelp: $("#device-help"),
  deviceTime: $("#device-time"), devicePreview: $("#device-preview"), deviceConfirm: $("#device-confirm"), deviceNext: $("#device-next"),
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
function currentTask() { return STUDY_CONFIG.tasks[state.taskIndex]; }
function activeTransformProfile() {
  const profile = STUDY_CONFIG.transformProfiles[state.profile?.biological_sex];
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
  elements.taskCount.textContent = `口說任務 ${state.taskIndex + 1} / ${STUDY_CONFIG.tasks.length}`;
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
  elements.taskNext.textContent = state.taskIndex === STUDY_CONFIG.tasks.length - 1 ? "送出研究資料 →" : "儲存並下一題 →";
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
  } catch { showAlert("問題語音無法播放。請返回設備測試，確認喇叭後再試一次。"); }
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
  elements.recordHelp.textContent = `最長 ${STUDY_CONFIG.maxRecordingSeconds} 秒`;
  updateTaskLimits();
  state.recordTimer = setInterval(() => {
    const elapsed = (Date.now() - state.recordingStartedAt) / 1000;
    elements.recordTime.textContent = formatTime(elapsed);
    if (elapsed >= STUDY_CONFIG.maxRecordingSeconds) stopRecording();
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
    if (state.taskIndex < STUDY_CONFIG.tasks.length - 1) { state.taskIndex += 1; renderTask(); }
    else {
      await finalizeSubmission(state.submissionId);
      setStep(4);
    }
  } catch (error) {
    showAlert(`${error.message} 已轉換的錄音仍保留在此頁，可直接重試。`);
    elements.taskNext.disabled = false;
    elements.taskNext.textContent = state.taskIndex === STUDY_CONFIG.tasks.length - 1 ? "重新送出研究資料 →" : "重新上傳並下一題 →";
  }
}

function updateDeviceReadyState() {
  const ready = state.devicePlayed && state.deviceRecorded;
  elements.deviceConfirm.disabled = !ready;
  if (ready) {
    elements.deviceStatus.textContent = "去識別化測試已完成";
    elements.deviceHelp.textContent = "請播放轉換後的錄音確認效果，然後勾選下方確認。";
  }
}
function playDevicePrompt() {
  if (!("speechSynthesis" in window)) { showAlert("此瀏覽器無法產生設備測試語句，請改用最新版 Chrome、Edge 或 Safari。"); return; }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance("請從數字一數到十");
  utterance.lang = "zh-TW";
  utterance.rate = 0.85;
  utterance.addEventListener("start", () => { state.devicePlayed = true; elements.devicePlay.textContent = "Ⅱ"; updateDeviceReadyState(); });
  utterance.addEventListener("end", () => { elements.devicePlay.textContent = "▶"; });
  utterance.addEventListener("error", () => { elements.devicePlay.textContent = "▶"; showAlert("設備測試語句播放失敗，請確認裝置音量後重試。"); });
  window.speechSynthesis.speak(utterance);
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
  elements.deviceConfirm.checked = false;
  elements.deviceConfirm.disabled = true;
  elements.deviceNext.disabled = true;
  elements.devicePreview.hidden = true;
  if (state.devicePreviewUrl) URL.revokeObjectURL(state.devicePreviewUrl);
  state.devicePreviewUrl = null;
  elements.devicePreview.removeAttribute("src");
  state.deviceStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  state.deviceChunks = [];
  const mimeType = selectRecorderMimeType();
  state.deviceRecorder = mimeType ? new MediaRecorder(state.deviceStream, { mimeType }) : new MediaRecorder(state.deviceStream);
  state.deviceRecorder.addEventListener("dataavailable", (event) => { if (event.data.size > 0) state.deviceChunks.push(event.data); });
  state.deviceRecorder.addEventListener("stop", finishDeviceRecording, { once: true });
  state.deviceRecorder.start(250);
  state.deviceStartedAt = Date.now();
  elements.deviceRecord.classList.add("is-recording");
  elements.deviceStatus.textContent = "設備測試錄音中";
  elements.deviceHelp.textContent = "請從一數到十，再按一次停止";
  state.deviceTimer = setInterval(() => {
    const elapsed = (Date.now() - state.deviceStartedAt) / 1000;
    elements.deviceTime.textContent = formatTime(elapsed);
    if (elapsed >= 15) stopDeviceRecording();
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
    state.deviceRecorded = true;
    updateDeviceReadyState();
  } catch (error) {
    state.deviceRecorded = false;
    elements.deviceStatus.textContent = "去識別化處理失敗";
    elements.deviceHelp.textContent = "原始測試錄音未上傳也未保存，請重新錄製。";
    showAlert(`${error.message} 原始測試錄音未上傳或保存。`);
  } finally {
    elements.deviceRecord.disabled = false;
  }
}

function addSecondLanguageField() {
  const count = elements.secondLanguages.querySelectorAll("input").length;
  if (count >= 6) { showAlert("第二語言欄位最多可新增六個。如仍不足，請聯絡研究人員調整設定。"); return; }
  const row = document.createElement("div");
  row.className = "repeatable-row";
  const input = document.createElement("input");
  Object.assign(input, { name: "second_languages", maxLength: 40, placeholder: `第二語言 ${count + 1}`, autocomplete: "off" });
  const remove = document.createElement("button");
  Object.assign(remove, { type: "button", className: "remove-language", title: "移除此語言欄位", textContent: "×" });
  remove.setAttribute("aria-label", "移除此語言欄位");
  remove.addEventListener("click", () => row.remove());
  row.append(input, remove);
  elements.secondLanguages.append(row);
  input.focus();
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
  context.fillRect(150, 145, 70, 70);
  context.fillStyle = "#ffffff";
  context.font = "700 36px sans-serif";
  context.textAlign = "center";
  context.fillText("聲", 185, 194);
  context.fillStyle = "#176b51";
  context.font = "700 24px sans-serif";
  context.textAlign = "left";
  context.fillText("匿名語音研究 / Anonymous Speech Research", 250, 176);
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
    closeLanguageGate();
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
document.addEventListener("google-translate-ready", () => { elements.translateStatus.textContent = "選好語言後，按下方按鈕進入平台。"; });

const savedLanguage = sessionStorage.getItem("platformLanguage");
if (savedLanguage) {
  elements.platformLanguage.value = savedLanguage;
  if (savedLanguage !== "zh-TW") document.cookie = `googtrans=/zh-TW/${savedLanguage}; path=/; SameSite=Lax`;
  closeLanguageGate();
}
elements.consent.addEventListener("change", () => { elements.consentNext.disabled = !elements.consent.checked; });
elements.consentNext.addEventListener("click", () => setStep(1));
document.querySelectorAll("[data-back]").forEach((button) => button.addEventListener("click", () => setStep(Number(button.dataset.back))));
elements.addLanguage.addEventListener("click", addSecondLanguageField);
elements.profileNext.addEventListener("click", () => {
  if (!elements.profileForm.reportValidity()) return;
  const data = new FormData(elements.profileForm);
  const secondLanguages = data.getAll("second_languages").map((value) => value.trim()).filter(Boolean);
  if (data.get("language_background") !== "monolingual" && secondLanguages.length === 0) {
    showAlert("選擇雙語或多語時，請至少填寫一個第二語言。");
    return;
  }
  state.profile = {
    age_group: data.get("age_group"), biological_sex: data.get("biological_sex"), nationality: data.get("nationality").trim(), language_background: data.get("language_background"),
    first_language: data.get("first_language").trim(), second_languages: secondLanguages,
    mandarin_learning_years: Number(data.get("mandarin_learning_years"))
  };
  setStep(2);
});
elements.devicePlay.addEventListener("click", playDevicePrompt);
elements.deviceRecord.addEventListener("click", async () => {
  if (state.deviceRecorder?.state === "recording") { stopDeviceRecording(); return; }
  try { await startDeviceRecording(); }
  catch (error) { stopDeviceTracks(); showAlert(error.name === "NotAllowedError" ? "無法使用麥克風。請允許麥克風權限後再試。" : error.message); }
});
elements.deviceConfirm.addEventListener("change", () => { elements.deviceNext.disabled = !elements.deviceConfirm.checked; });
elements.deviceNext.addEventListener("click", async () => {
  if (!elements.deviceConfirm.checked || !state.profile) return;
  elements.deviceNext.disabled = true;
  elements.deviceNext.textContent = "正在建立匿名工作階段…";
  try {
    const result = await createSubmission(state.profile, STUDY_CONFIG);
    state.submissionId = result.submission_id;
    setStep(3);
    renderTask();
  } catch (error) {
    showAlert(error.message);
    elements.deviceNext.disabled = false;
    elements.deviceNext.textContent = "重新開始正式問答 →";
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

elements.taskProgressLabel.textContent = `${STUDY_CONFIG.tasks.length} 題`;
