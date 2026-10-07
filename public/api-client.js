const JSON_HEADERS = { "Content-Type": "application/json" };
const STAGING_API_ORIGIN = "https://anonymous-speech-platform-api.jameszdog101.workers.dev";

function apiUrl(path) {
  const origin = window.location.hostname.endsWith(".pages.dev") ? STAGING_API_ORIGIN : "";
  return `${origin}${path}`;
}

function assertLiveApi() {
  if (window.location.hostname.endsWith("github.io")) {
    throw new Error("這是 GitHub Pages 展示版，不會建立或上傳研究資料。請使用正式研究網址提交。");
  }
}

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `伺服器回應錯誤 (${response.status})`);
  }
  return payload;
}

export async function createSubmission(profile, studyConfig) {
  assertLiveApi();
  const response = await fetch(apiUrl("/api/submissions"), {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({
      consent: true,
      study_id: studyConfig.studyId,
      study_version: studyConfig.version,
      profile
    })
  });
  return parseResponse(response);
}

export async function uploadTransformedAudio(submissionId, task, transformedBlob, transformProfile) {
  assertLiveApi();
  if (!(transformedBlob instanceof Blob) || transformedBlob.type !== "audio/wav") {
    throw new Error("安全檢查失敗：上傳模組只接受已轉換的 WAV 音檔。");
  }

  const response = await fetch(apiUrl(`/api/submissions/${encodeURIComponent(submissionId)}/tasks/${encodeURIComponent(task.task_id)}/audio`), {
    method: "PUT",
    headers: {
      "Content-Type": "audio/wav",
      "X-Audio-State": "transformed",
      "X-Transform-Profile": transformProfile.id,
      "X-Transform-Version": transformProfile.version
    },
    body: transformedBlob
  });
  return parseResponse(response);
}

export async function finalizeSubmission(submissionId) {
  assertLiveApi();
  const response = await fetch(apiUrl(`/api/submissions/${encodeURIComponent(submissionId)}/finalize`), {
    method: "POST",
    headers: JSON_HEADERS,
    body: "{}"
  });
  return parseResponse(response);
}

export async function getPublishedStudyConfig() {
  assertLiveApi();
  const response = await fetch(apiUrl("/api/study-config"));
  const payload = await parseResponse(response);
  return { ...payload, tasks: payload.tasks.map((task) => ({ ...task, audio_stimulus: apiUrl(task.audio_stimulus) })) };
}

export async function getStudyStatus() {
  assertLiveApi();
  const response = await fetch(apiUrl("/api/study-status"));
  return parseResponse(response);
}

