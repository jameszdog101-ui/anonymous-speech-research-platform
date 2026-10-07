import { STUDY_CONFIG } from "./study-config.js";
import { transformRecording } from "./audio-transform.js";
import { createSubmission, finalizeSubmission, uploadTransformedAudio } from "./api-client.js";

const state = {
  step: 0,
  taskIndex: 0,
  profile: null,
  submissionId: null,
  processedAudio: new Map(),
  previewUrl: null,
  mediaRecorder: null,
  mediaStream: null,
  recordingChunks: [],
  recordingStartedAt: 0,
  recordTimer: null,
  stimulusPlays: new Map()
};

const elements = {
  alert: document.querySelector("#global-alert"),
  consent: document.querySelector("#consent"),
  consentNext: document.querySelector("#consent-next"),
  profileForm: document.querySelector("#profile-form"),
  profileNext: document.querySelector("#profile-next"),
  panels: [...document.querySelectorAll("[data-step-panel]")],
  progress: [...document.querySelectorAll("#progress-list li")],
  taskProgressLabel: document.querySelector("#task-progress-label"),
  taskCount: document.querySelector("#task-count"),
  taskTitle: document.querySelector("#task-title"),
  taskStatus: document.querySelector("#task-status"),
  taskPrompt: document.querySelector("#task-prompt"),
  taskInstructions: document.querySelector("#task-instructions"),
  playbackPolicy: document.querySelector("#playback-policy"),
  stimulusAudio: document.querySelector("#stimulus-audio"),
  stimulusTime: document.querySelector("#stimulus-time"),
  playStimulus: document.querySelector("#play-stimulus"),
  recordButton: document.querySelector("#record-button"),
  recordLabel: document.querySelector("#record-label"),
  recordHelp: document.querySelector("#record-help"),
  recordTime: document.querySelector("#record-time"),
  processingRow: document.querySelector("#processing-row"),
  previewRow: document.querySelector("#preview-row"),
  processedPreview: document.querySelector("#processed-preview"),
  rerecordButton: document.querySelector("#rerecord-button"),
  taskBack: document.querySelector("#task-back"),
  taskNext: document.querySelector("#task-next"),
  receiptId: document.querySelector("#receipt-id")
};

function showAlert(message) {
  elements.alert.textContent = message;
  elements.alert.hidden = false;
  elements.alert.scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearAlert() {
  elements.alert.hidden = true;
  elements.alert.textContent = "";
}

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

function currentTask() {
  return STUDY_CONFIG.tasks[state.taskIndex];
}

function validateTaskConfiguration(task) {
  if (task.play_once === task.replay_allowed) {
    throw new Error(`題目 ${task.task_id} 的播放規則互相矛盾，請聯絡研究人員。`);
  }
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

function renderTask() {
  clearAlert();
  resetPreview();
  const task = currentTask();
  validateTaskConfiguration(task);
  elements.taskCount.textContent = `語音任務 ${state.taskIndex + 1} / ${STUDY_CONFIG.tasks.length}`;
  elements.taskTitle.textContent = task.title;
  elements.taskPrompt.textContent = task.prompt_text;
  elements.taskInstructions.textContent = task.research_instructions;
  elements.playbackPolicy.textContent = task.play_once ? "僅可播放一次" : "可重複播放";
  elements.stimulusAudio.src = task.audio_stimulus;
  elements.stimulusTime.textContent = "00:00";
  elements.playStimulus.disabled = task.play_once && (state.stimulusPlays.get(task.task_id) || 0) > 0;
  elements.playStimulus.textContent = "▶";
  elements.playStimulus.classList.remove("is-playing");
  elements.recordTime.textContent = "00:00";
  elements.recordLabel.textContent = "點一下開始錄音";
  elements.recordHelp.textContent = "瀏覽器會詢問麥克風權限";
  elements.recordButton.classList.remove("is-recording");
  elements.taskNext.textContent = state.taskIndex === STUDY_CONFIG.tasks.length - 1 ? "送出研究資料 →" : "儲存並下一題 →";

  const existing = state.processedAudio.get(task.task_id);
  if (existing) showProcessedPreview(existing);
}

async function playStimulus() {
  const task = currentTask();
  const plays = state.stimulusPlays.get(task.task_id) || 0;
  if (task.play_once && plays >= 1) return;

  try {
    clearAlert();
    if (!elements.stimulusAudio.paused) {
      elements.stimulusAudio.pause();
      return;
    }
    await elements.stimulusAudio.play();
    state.stimulusPlays.set(task.task_id, plays + 1);
    if (task.play_once) elements.playStimulus.disabled = true;
  } catch {
    showAlert("刺激語音無法播放。請確認網路或音訊格式後再試一次。");
  }
}

function selectRecorderMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    throw new Error("此瀏覽器不支援錄音。請改用最新版 Chrome、Edge 或 Safari。");
  }
  clearAlert();
  resetPreview();
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: false
  });
  state.mediaStream = stream;
  state.recordingChunks = [];
  const mimeType = selectRecorderMimeType();
  state.mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  state.mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) state.recordingChunks.push(event.data);
  });
  state.mediaRecorder.addEventListener("stop", finishRecording, { once: true });
  state.mediaRecorder.start(250);
  state.recordingStartedAt = Date.now();
  elements.recordButton.classList.add("is-recording");
  elements.recordButton.setAttribute("aria-label", "停止錄音");
  elements.recordLabel.textContent = "錄音中，點一下停止";
  elements.recordHelp.textContent = `最長 ${STUDY_CONFIG.maxRecordingSeconds} 秒`;
  state.recordTimer = window.setInterval(() => {
    const elapsed = (Date.now() - state.recordingStartedAt) / 1000;
    elements.recordTime.textContent = formatTime(elapsed);
    if (elapsed >= STUDY_CONFIG.maxRecordingSeconds) stopRecording();
  }, 200);
}

function stopMediaTracks() {
  state.mediaStream?.getTracks().forEach((track) => track.stop());
  state.mediaStream = null;
}

function stopRecording() {
  if (state.mediaRecorder?.state === "recording") state.mediaRecorder.stop();
  window.clearInterval(state.recordTimer);
  state.recordTimer = null;
  stopMediaTracks();
  elements.recordButton.classList.remove("is-recording");
  elements.recordButton.setAttribute("aria-label", "開始錄音");
}

async function finishRecording() {
  const rawBlob = new Blob(state.recordingChunks, { type: state.mediaRecorder?.mimeType || "audio/webm" });
  state.recordingChunks = [];
  state.mediaRecorder = null;
  elements.recordButton.disabled = true;
  elements.processingRow.hidden = false;
  elements.recordLabel.textContent = "錄音完成";
  elements.recordHelp.textContent = "正在準備匿名化預覽";

  try {
    const transformedBlob = await transformRecording(rawBlob, STUDY_CONFIG.transformProfile);
    state.processedAudio.set(currentTask().task_id, transformedBlob);
    showProcessedPreview(transformedBlob);
  } catch (error) {
    showAlert(`${error.message} 原始錄音未上傳。`);
    elements.recordLabel.textContent = "處理失敗，請重新錄製";
    elements.recordHelp.textContent = "沒有任何原始音檔被送出";
  } finally {
    elements.processingRow.hidden = true;
    elements.recordButton.disabled = false;
  }
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
}

async function saveCurrentTask() {
  const task = currentTask();
  const audio = state.processedAudio.get(task.task_id);
  if (!audio) return;
  clearAlert();
  elements.taskNext.disabled = true;
  elements.taskNext.textContent = "正在安全上傳…";

  try {
    await uploadTransformedAudio(state.submissionId, task, audio, STUDY_CONFIG.transformProfile);
    if (state.taskIndex < STUDY_CONFIG.tasks.length - 1) {
      state.taskIndex += 1;
      renderTask();
    } else {
      const result = await finalizeSubmission(state.submissionId);
      elements.receiptId.textContent = result.receipt_id || state.submissionId;
      setStep(3);
    }
  } catch (error) {
    showAlert(`${error.message} 已轉換的錄音仍保留在此頁，可直接重試。`);
    elements.taskNext.disabled = false;
    elements.taskNext.textContent = state.taskIndex === STUDY_CONFIG.tasks.length - 1 ? "重新送出研究資料 →" : "重新上傳並下一題 →";
  }
}

elements.consent.addEventListener("change", () => {
  elements.consentNext.disabled = !elements.consent.checked;
});

elements.consentNext.addEventListener("click", () => setStep(1));
document.querySelectorAll("[data-back]").forEach((button) => button.addEventListener("click", () => setStep(Number(button.dataset.back))));

elements.profileNext.addEventListener("click", async () => {
  if (!elements.profileForm.reportValidity()) return;
  const values = Object.fromEntries(new FormData(elements.profileForm));
  values.language_learning_years = Number(values.language_learning_years);
  elements.profileNext.disabled = true;
  elements.profileNext.textContent = "正在建立匿名工作階段…";
  try {
    const result = await createSubmission(values, STUDY_CONFIG);
    state.profile = values;
    state.submissionId = result.submission_id;
    setStep(2);
    renderTask();
  } catch (error) {
    showAlert(error.message);
  } finally {
    elements.profileNext.disabled = false;
    elements.profileNext.textContent = "開始語音任務 →";
  }
});

elements.playStimulus.addEventListener("click", playStimulus);
elements.stimulusAudio.addEventListener("play", () => {
  elements.playStimulus.textContent = "Ⅱ";
  elements.playStimulus.classList.add("is-playing");
});
elements.stimulusAudio.addEventListener("pause", () => {
  elements.playStimulus.textContent = "▶";
  elements.playStimulus.classList.remove("is-playing");
});
elements.stimulusAudio.addEventListener("timeupdate", () => {
  elements.stimulusTime.textContent = formatTime(elements.stimulusAudio.currentTime);
});

elements.recordButton.addEventListener("click", async () => {
  if (state.mediaRecorder?.state === "recording") {
    stopRecording();
    return;
  }
  try {
    await startRecording();
  } catch (error) {
    stopMediaTracks();
    showAlert(error.name === "NotAllowedError" ? "無法使用麥克風。請在瀏覽器網址列允許麥克風權限後重試。" : error.message);
  }
});

elements.rerecordButton.addEventListener("click", () => {
  state.processedAudio.delete(currentTask().task_id);
  resetPreview();
  elements.recordLabel.textContent = "點一下開始重新錄音";
});

elements.taskBack.addEventListener("click", () => {
  if (state.taskIndex > 0) {
    state.taskIndex -= 1;
    renderTask();
  } else {
    setStep(1);
  }
});
elements.taskNext.addEventListener("click", saveCurrentTask);

window.addEventListener("beforeunload", () => {
  stopMediaTracks();
  if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
});

elements.taskProgressLabel.textContent = `${STUDY_CONFIG.tasks.length} 題`;

