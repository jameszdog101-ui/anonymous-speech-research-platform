const JSON_HEADERS = { "Content-Type": "application/json" };

async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `伺服器回應錯誤 (${response.status})`);
  }
  return payload;
}

export async function createSubmission(profile, studyConfig) {
  const response = await fetch("/api/submissions", {
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
  if (!(transformedBlob instanceof Blob) || transformedBlob.type !== "audio/wav") {
    throw new Error("安全檢查失敗：上傳模組只接受已轉換的 WAV 音檔。");
  }

  const response = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}/tasks/${encodeURIComponent(task.task_id)}/audio`, {
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
  const response = await fetch(`/api/submissions/${encodeURIComponent(submissionId)}/finalize`, {
    method: "POST",
    headers: JSON_HEADERS,
    body: "{}"
  });
  return parseResponse(response);
}

