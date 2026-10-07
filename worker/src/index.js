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
  const adminAudio = pathname.match(/^\/admin\/api\/submissions\/([^/]+)\/tasks\/([^/]+)\/audio$/);
  if (adminAudio) return { name: "admin-audio", submissionId: adminAudio[1], taskId: adminAudio[2] };
  const adminReview = pathname.match(/^\/admin\/api\/submissions\/([^/]+)\/review$/);
  if (adminReview) return { name: "admin-review", submissionId: adminReview[1] };
  const adminSubmission = pathname.match(/^\/admin\/api\/submissions\/([^/]+)$/);
  if (adminSubmission) return { name: "admin-submission", submissionId: adminSubmission[1] };
  if (pathname === "/admin/api/summary") return { name: "admin-summary" };
  if (pathname === "/admin/api/submissions") return { name: "admin-submissions" };
  if (pathname === "/admin/api/exports.csv") return { name: "admin-export" };
  const audio = pathname.match(/^\/api\/submissions\/([^/]+)\/tasks\/([^/]+)\/audio$/);
  if (audio) return { name: "audio", submissionId: audio[1], taskId: audio[2] };
  const finalize = pathname.match(/^\/api\/submissions\/([^/]+)\/finalize$/);
  if (finalize) return { name: "finalize", submissionId: finalize[1] };
  if (pathname === "/api/submissions") return { name: "submissions" };
  if (pathname === "/api/health") return { name: "health" };
  return { name: "not-found" };
}

function researcherIdentity(request, env) {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email")?.trim().toLowerCase();
  const assertion = request.headers.get("Cf-Access-Jwt-Assertion");
  const allowed = new Set(String(env.RESEARCHER_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  if (!email || !assertion || !allowed.has(email)) return null;
  return email;
}

async function audit(env, email, action, submissionId = null, taskId = null) {
  await env.DB.prepare(`
    INSERT INTO researcher_audit_log (researcher_email, action, submission_id, task_id, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(email, action, submissionId, taskId, new Date().toISOString()).run();
}

async function adminSummary(env, email) {
  const totals = await env.DB.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress
    FROM submissions
  `).first();
  const pending = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM submissions s
    LEFT JOIN submission_reviews r ON r.submission_id = s.id
    WHERE s.status = 'completed' AND r.submission_id IS NULL
  `).first();
  await audit(env, email, "view_summary");
  return json({ total: Number(totals?.total || 0), completed: Number(totals?.completed || 0), in_progress: Number(totals?.in_progress || 0), pending_review: Number(pending?.count || 0) });
}

async function adminSubmissions(request, env, email) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const condition = status === "completed" || status === "in_progress" ? "WHERE s.status = ?" : "";
  const statement = env.DB.prepare(`
    SELECT s.id, s.study_id, s.study_version, s.status, s.age_group, s.biological_sex,
      s.nationality, s.language_background, s.first_language, s.second_languages_json,
      s.mandarin_learning_years, s.created_at, s.completed_at,
      r.eligibility_status, r.reviewed_at
    FROM submissions s LEFT JOIN submission_reviews r ON r.submission_id = s.id
    ${condition} ORDER BY s.created_at DESC LIMIT 200
  `);
  const result = condition ? await statement.bind(status).all() : await statement.all();
  await audit(env, email, "list_submissions");
  return json({ submissions: result.results || [] });
}

async function adminSubmission(env, email, submissionId) {
  if (!isUuid(submissionId)) return json({ error: "匿名提交編號格式不正確。" }, 400);
  const submission = await env.DB.prepare(`
    SELECT s.*, r.eligibility_status, r.notes AS review_notes, r.reviewed_by, r.reviewed_at
    FROM submissions s LEFT JOIN submission_reviews r ON r.submission_id = s.id WHERE s.id = ?
  `).bind(submissionId).first();
  if (!submission) return json({ error: "找不到匿名提交。" }, 404);
  const recordings = await env.DB.prepare(`
    SELECT task_id, audio_bytes, transform_profile, transform_version, uploaded_at
    FROM task_recordings WHERE submission_id = ? ORDER BY task_id
  `).bind(submissionId).all();
  await audit(env, email, "view_submission", submissionId);
  return json({ submission, recordings: recordings.results || [] });
}

async function adminAudio(request, env, email, submissionId, taskId) {
  if (!isUuid(submissionId) || !TASK_IDS.has(taskId)) return json({ error: "錄音識別資料不正確。" }, 400);
  const row = await env.DB.prepare("SELECT object_key FROM task_recordings WHERE submission_id = ? AND task_id = ?").bind(submissionId, taskId).first();
  if (!row) return json({ error: "找不到錄音。" }, 404);
  const object = await env.AUDIO.get(row.object_key);
  if (!object) return json({ error: "找不到音檔物件。" }, 404);
  const download = new URL(request.url).searchParams.get("download") === "1";
  await audit(env, email, download ? "download_audio" : "play_audio", submissionId, taskId);
  const headers = new Headers({ "Content-Type": "audio/wav", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  if (download) headers.set("Content-Disposition", `attachment; filename="${submissionId}-${taskId}.wav"`);
  return new Response(object.body, { headers });
}

async function adminReview(request, env, email, submissionId) {
  if (!isUuid(submissionId)) return json({ error: "匿名提交編號格式不正確。" }, 400);
  let payload;
  try { payload = await request.json(); } catch { return json({ error: "審核內容格式不正確。" }, 400); }
  if (!["eligible", "ineligible", "undetermined"].includes(payload.eligibility_status)) return json({ error: "審核結果不正確。" }, 400);
  const notes = typeof payload.notes === "string" ? payload.notes.trim().slice(0, 1000) : "";
  const exists = await env.DB.prepare("SELECT id FROM submissions WHERE id = ?").bind(submissionId).first();
  if (!exists) return json({ error: "找不到匿名提交。" }, 404);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO submission_reviews (submission_id, eligibility_status, notes, reviewed_by, reviewed_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(submission_id) DO UPDATE SET eligibility_status = excluded.eligibility_status,
      notes = excluded.notes, reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at
  `).bind(submissionId, payload.eligibility_status, notes, email, now).run();
  await audit(env, email, "review_eligibility", submissionId, "eligibility_001");
  return json({ ok: true, reviewed_at: now });
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

async function adminExport(env, email) {
  const result = await env.DB.prepare(`
    SELECT s.id, s.study_id, s.study_version, s.status, s.age_group, s.biological_sex,
      s.nationality, s.language_background, s.first_language, s.second_languages_json,
      s.mandarin_learning_years, s.created_at, s.completed_at, r.eligibility_status, r.notes AS review_notes
    FROM submissions s LEFT JOIN submission_reviews r ON r.submission_id = s.id ORDER BY s.created_at
  `).all();
  const columns = ["id", "study_id", "study_version", "status", "age_group", "biological_sex", "nationality", "language_background", "first_language", "second_languages_json", "mandarin_learning_years", "created_at", "completed_at", "eligibility_status", "review_notes"];
  const csv = `\uFEFF${columns.join(",")}\r\n${(result.results || []).map((row) => columns.map((column) => csvCell(row[column])).join(",")).join("\r\n")}`;
  await audit(env, email, "export_metadata");
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=anonymous-speech-export.csv", "Cache-Control": "private, no-store" } });
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
      if (currentRoute.name.startsWith("admin-")) {
        const email = researcherIdentity(request, env);
        if (!email) response = json({ error: "未授權的研究人員帳號。" }, 401);
        else if (currentRoute.name === "admin-summary" && request.method === "GET") response = await adminSummary(env, email);
        else if (currentRoute.name === "admin-submissions" && request.method === "GET") response = await adminSubmissions(request, env, email);
        else if (currentRoute.name === "admin-submission" && request.method === "GET") response = await adminSubmission(env, email, currentRoute.submissionId);
        else if (currentRoute.name === "admin-audio" && request.method === "GET") response = await adminAudio(request, env, email, currentRoute.submissionId, currentRoute.taskId);
        else if (currentRoute.name === "admin-review" && request.method === "PUT") response = await adminReview(request, env, email, currentRoute.submissionId);
        else if (currentRoute.name === "admin-export" && request.method === "GET") response = await adminExport(env, email);
        else response = json({ error: "找不到管理 API 路徑。" }, 404);
      }
      else if (currentRoute.name === "health" && request.method === "GET") response = json({ ok: true });
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

