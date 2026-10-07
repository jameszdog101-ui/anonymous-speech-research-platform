import {
  MAX_AUDIO_BYTES,
  TASK_IDS,
  TRANSFORM_PARAMETER_SETS,
  hasWavHeader,
  isUuid,
  transformProfileForSex,
  validateAudioRequest,
  validateSubmissionPayload
} from "./validation.js";

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function json(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { ...JSON_HEADERS, ...extraHeaders } });
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin || !env.FRONTEND_ORIGIN || origin !== env.FRONTEND_ORIGIN) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Audio-State, X-Transform-Profile, X-Transform-Version",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function route(pathname) {
  const audio = pathname.match(/^\/api\/submissions\/([^/]+)\/tasks\/([^/]+)\/audio$/);
  if (audio) return { name: "audio", submissionId: audio[1], taskId: audio[2] };
  const finalize = pathname.match(/^\/api\/submissions\/([^/]+)\/finalize$/);
  if (finalize) return { name: "finalize", submissionId: finalize[1] };
  if (pathname === "/api/submissions") return { name: "submissions" };
  if (pathname === "/api/health") return { name: "health" };
  return { name: "not-found" };
}

async function createSubmission(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "請求內容不是有效的 JSON。" }, 400);
  }
  const error = validateSubmissionPayload(payload);
  if (error) return json({ error }, 400);

  const id = crypto.randomUUID();
  const profile = payload.profile;
  await env.DB.prepare(`
    INSERT INTO submissions (
      id, study_id, study_version, status, age_group, biological_sex, nationality, language_background,
      first_language, second_languages_json, mandarin_learning_years, created_at
    ) VALUES (?, ?, ?, 'in_progress', ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    payload.study_id,
    payload.study_version,
    profile.age_group,
    profile.biological_sex,
    profile.nationality.trim(),
    profile.language_background,
    profile.first_language.trim(),
    JSON.stringify(profile.second_languages.map((language) => language.trim())),
    profile.mandarin_learning_years,
    new Date().toISOString()
  ).run();
  return json({ submission_id: id }, 201);
}

async function uploadAudio(request, env, submissionId, taskId) {
  if (!isUuid(submissionId)) return json({ error: "匿名提交編號格式不正確。" }, 400);
  const validationError = validateAudioRequest(request, taskId);
  if (validationError) return json({ error: validationError }, 400);
  const submission = await env.DB.prepare("SELECT status, biological_sex FROM submissions WHERE id = ?").bind(submissionId).first();
  if (!submission) return json({ error: "找不到匿名提交。" }, 404);
  if (submission.status !== "in_progress") return json({ error: "此提交已完成，不能再寫入音訊。" }, 409);
  const transformProfile = request.headers.get("X-Transform-Profile");
  const transformVersion = request.headers.get("X-Transform-Version");
  if (transformProfile !== transformProfileForSex(submission.biological_sex)) {
    return json({ error: "聲音轉換設定與背景資料不一致。" }, 400);
  }

  const audio = await request.arrayBuffer();
  if (audio.byteLength === 0 || audio.byteLength > MAX_AUDIO_BYTES) return json({ error: "音檔為空或超過大小限制。" }, 400);
  if (!hasWavHeader(audio)) return json({ error: "音檔不是有效的 WAV 格式。" }, 400);
  const objectKey = `submissions/${submissionId}/${taskId}.wav`;
  await env.AUDIO.put(objectKey, audio, {
    httpMetadata: { contentType: "audio/wav" },
    customMetadata: { taskId, transformProfile, transformVersion }
  });
  await env.DB.prepare(`
    INSERT INTO task_recordings (submission_id, task_id, object_key, audio_bytes, transform_profile, transform_version, transform_parameters_json, uploaded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(submission_id, task_id) DO UPDATE SET
      object_key = excluded.object_key,
      audio_bytes = excluded.audio_bytes,
      transform_profile = excluded.transform_profile,
      transform_version = excluded.transform_version,
      transform_parameters_json = excluded.transform_parameters_json,
      uploaded_at = excluded.uploaded_at
  `).bind(
    submissionId,
    taskId,
    objectKey,
    audio.byteLength,
    transformProfile,
    transformVersion,
    JSON.stringify(TRANSFORM_PARAMETER_SETS[transformProfile]),
    new Date().toISOString()
  ).run();
  return json({ ok: true, task_id: taskId });
}

async function finalizeSubmission(env, submissionId) {
  if (!isUuid(submissionId)) return json({ error: "匿名提交編號格式不正確。" }, 400);
  const row = await env.DB.prepare(`
    SELECT s.status, COUNT(r.task_id) AS recording_count
    FROM submissions s LEFT JOIN task_recordings r ON r.submission_id = s.id
    WHERE s.id = ? GROUP BY s.id
  `).bind(submissionId).first();
  if (!row) return json({ error: "找不到匿名提交。" }, 404);
  if (Number(row.recording_count) !== TASK_IDS.size) return json({ error: "仍有語音題目尚未上傳。" }, 409);
  if (row.status === "completed") return json({ receipt_id: submissionId });
  await env.DB.prepare("UPDATE submissions SET status = 'completed', completed_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), submissionId).run();
  return json({ receipt_id: submissionId });
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    const currentRoute = route(new URL(request.url).pathname);
    let response;
    try {
      if (currentRoute.name === "health" && request.method === "GET") response = json({ ok: true });
      else if (currentRoute.name === "submissions" && request.method === "POST") response = await createSubmission(request, env);
      else if (currentRoute.name === "audio" && request.method === "PUT") response = await uploadAudio(request, env, currentRoute.submissionId, currentRoute.taskId);
      else if (currentRoute.name === "finalize" && request.method === "POST") response = await finalizeSubmission(env, currentRoute.submissionId);
      else response = json({ error: "找不到 API 路徑。" }, 404);
    } catch {
      response = json({ error: "伺服器處理失敗，請稍後再試。" }, 500);
    }
    const headers = new Headers(response.headers);
    Object.entries(cors).forEach(([key, value]) => headers.set(key, value));
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: response.status, headers });
  }
};

