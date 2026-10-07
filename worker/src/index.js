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
  if (pathname === "/admin/api/study-control") return { name: "admin-study-control" };
  if (pathname === "/admin/api/researchers/revoke-all") return { name: "admin-researchers-revoke-all" };
  if (pathname === "/admin/api/researchers") return { name: "admin-researchers" };
  const adminResearcher = pathname.match(/^\/admin\/api\/researchers\/([^/]+)$/);
  if (adminResearcher) return { name: "admin-researcher", email: decodeURIComponent(adminResearcher[1]) };
  if (pathname === "/admin/api/tasks/publish") return { name: "admin-tasks-publish" };
  if (pathname === "/admin/api/tasks") return { name: "admin-tasks" };
  const adminTaskAudio = pathname.match(/^\/admin\/api\/tasks\/([^/]+)\/audio$/);
  if (adminTaskAudio) return { name: "admin-task-audio", taskId: adminTaskAudio[1] };
  const adminTask = pathname.match(/^\/admin\/api\/tasks\/([^/]+)$/);
  if (adminTask) return { name: "admin-task", taskId: adminTask[1] };
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
  if (pathname === "/api/study-status") return { name: "study-status" };
  if (pathname === "/api/study-config") return { name: "study-config" };
  const studyAsset = pathname.match(/^\/api\/study-assets\/([^/]+)$/);
  if (studyAsset) return { name: "study-asset", taskId: studyAsset[1] };
  return { name: "not-found" };
}

async function studyStatus(env) {
  const control = await env.DB.prepare("SELECT is_open, max_submissions, closed_reason, updated_at FROM study_control WHERE id = 1").first();
  const totals = await env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed FROM submissions").first();
  const accepted = Number(totals?.total || 0);
  const maximum = Number(control?.max_submissions || 100);
  const isOpen = Boolean(control?.is_open ?? 1) && accepted < maximum;
  return {
    open: isOpen,
    max_submissions: maximum,
    accepted_submissions: accepted,
    completed_submissions: Number(totals?.completed || 0),
    remaining: Math.max(0, maximum - accepted),
    closed_reason: isOpen ? null : control?.closed_reason || (accepted >= maximum ? "limit_reached" : "manual"),
    updated_at: control?.updated_at || null
  };
}

async function adminStudyControl(request, env, email) {
  if (!isOwner(env, email)) return json({ error: "只有最高權限擁有者可以變更研究收件設定。" }, 403);
  if (request.method === "GET") {
    await audit(env, email, "view_study_control");
    return json(await studyStatus(env));
  }
  const payload = await request.json().catch(() => null);
  const maximum = Number(payload?.max_submissions);
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 100000) return json({ error: "最高收錄數量必須是 1 至 100000 的整數。" }, 400);
  if (typeof payload?.open !== "boolean") return json({ error: "收件狀態格式不正確。" }, 400);
  const current = await studyStatus(env);
  const requestedOpen = payload.open && current.accepted_submissions < maximum;
  const reason = requestedOpen ? null : current.accepted_submissions >= maximum ? "limit_reached" : "manual";
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE study_control SET is_open = ?, max_submissions = ?, closed_reason = ?, updated_by = ?, updated_at = ? WHERE id = 1")
    .bind(requestedOpen ? 1 : 0, maximum, reason, email, now).run();
  await audit(env, email, requestedOpen ? "open_study_collection" : "close_study_collection");
  return json(await studyStatus(env));
}

async function researcherIdentity(request, env) {
  const email = request.headers.get("Cf-Access-Authenticated-User-Email")?.trim().toLowerCase();
  const assertion = request.headers.get("Cf-Access-Jwt-Assertion");
  const allowed = new Set(String(env.RESEARCHER_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
  if (!email || !assertion) return null;
  if (email === ownerEmail(env) || allowed.has(email)) return email;
  const researcher = await env.DB.prepare("SELECT status FROM researchers WHERE email = ?").bind(email).first();
  return researcher?.status === "active" ? email : null;
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
  if (!isUuid(submissionId) || (taskId !== "eligibility_001" && !/^task_[a-zA-Z0-9_-]+$/.test(taskId))) return json({ error: "錄音識別資料不正確。" }, 400);
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

function ownerEmail(env) { return String(env.PROJECT_OWNER_EMAIL || "").trim().toLowerCase(); }
function isOwner(env, email) { return email === ownerEmail(env); }

async function adminResearchers(env, email) {
  if (!isOwner(env, email)) return json({ error: "只有最高權限擁有者可以管理研究者。" }, 403);
  const result = await env.DB.prepare("SELECT email, role, status, created_at, updated_at FROM researchers ORDER BY email").all();
  const owner = ownerEmail(env);
  const researchers = (result.results || []).filter((row) => row.email !== owner).map((row) => ({ ...row, is_owner: false }));
  if (owner) researchers.unshift({ email: owner, role: "owner", status: "active", is_owner: true });
  await audit(env, email, "list_researchers");
  return json({ researchers });
}

async function addResearcher(request, env, email) {
  if (!isOwner(env, email)) return json({ error: "只有最高權限擁有者可以新增研究者。" }, 403);
  const payload = await request.json().catch(() => null);
  const target = String(payload?.email || "").trim().toLowerCase();
  const role = payload?.role === "manager" ? "manager" : "researcher";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target)) return json({ error: "研究者 email 格式不正確。" }, 400);
  if (target === ownerEmail(env)) return json({ error: "最高權限擁有者不需要新增，也不能被變更。" }, 409);
  const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO researchers (email, role, status, created_by, created_at, updated_at) VALUES (?, ?, 'active', ?, ?, ?) ON CONFLICT(email) DO UPDATE SET role=excluded.role, status='active', updated_at=excluded.updated_at").bind(target, role, email, now, now).run();
  await audit(env, email, "add_researcher", target);
  return json({ ok: true }, 201);
}

async function changeResearcher(request, env, email, target) {
  if (!isOwner(env, email)) return json({ error: "只有最高權限擁有者可以變更研究者。" }, 403);
  target = target.trim().toLowerCase();
  if (target === ownerEmail(env)) return json({ error: "最高權限擁有者不可停用、移除或降權。" }, 403);
  if (request.method === "DELETE") await env.DB.prepare("DELETE FROM researchers WHERE email = ?").bind(target).run();
  else { const payload = await request.json().catch(() => null); if (!['active','disabled'].includes(payload?.status)) return json({ error: "狀態不正確。" }, 400); await env.DB.prepare("UPDATE researchers SET status = ?, updated_at = ? WHERE email = ?").bind(payload.status, new Date().toISOString(), target).run(); }
  await audit(env, email, request.method === "DELETE" ? "remove_researcher" : "change_researcher_status", target);
  return json({ ok: true });
}

async function revokeAllResearchers(env, email) {
  if (!isOwner(env, email)) return json({ error: "只有最高權限擁有者可以撤銷所有研究者。" }, 403);
  await env.DB.prepare("UPDATE researchers SET status = 'disabled', updated_at = ?").bind(new Date().toISOString()).run();
  await audit(env, email, "revoke_all_other_researchers");
  return json({ ok: true });
}

async function adminTasks(env, email) {
  const result = await env.DB.prepare("SELECT * FROM study_tasks ORDER BY sort_order, task_id").all();
  const publication = await env.DB.prepare("SELECT published_at FROM study_publications ORDER BY version DESC LIMIT 1").first();
  await audit(env, email, "list_study_tasks");
  return json({ tasks: (result.results || []).map((task) => ({ ...task, audio_url: task.audio_object_key ? `/admin/api/tasks/${task.task_id}/audio` : null })), published_at: publication?.published_at || null });
}

async function saveTask(request, env, email, taskId) {
  if (!/^task_[a-zA-Z0-9_-]+$/.test(taskId)) return json({ error: "task_id 格式不正確。" }, 400);
  const payload = await request.json().catch(() => null);
  if (!payload?.title?.trim() || !payload?.prompt_text?.trim() || !payload?.research_instructions?.trim()) return json({ error: "題目欄位不可留白。" }, 400);
  if (![1,2].includes(payload.max_playbacks) || ![1,2].includes(payload.max_recordings)) return json({ error: "播放及錄音次數只能設定為 1 或 2。" }, 400);
  const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM study_tasks").first(); const now = new Date().toISOString();
  await env.DB.prepare("INSERT INTO study_tasks (task_id,title,prompt_text,research_instructions,max_playbacks,max_recordings,sort_order,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(task_id) DO UPDATE SET title=excluded.title,prompt_text=excluded.prompt_text,research_instructions=excluded.research_instructions,max_playbacks=excluded.max_playbacks,max_recordings=excluded.max_recordings,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(taskId,payload.title.trim(),payload.prompt_text.trim(),payload.research_instructions.trim(),payload.max_playbacks,payload.max_recordings,Number(count?.count || 0)+1,email,now).run();
  await audit(env,email,"save_study_task",null,taskId); return json({ok:true});
}

async function saveTaskAudio(request, env, email, taskId) {
  const type = request.headers.get("Content-Type")?.split(";")[0]; if (!['audio/wav','audio/mpeg'].includes(type)) return json({error:"問題音檔只接受 MP3 或 WAV。"},400);
  const audio=await request.arrayBuffer(); if (!audio.byteLength || audio.byteLength > 15_000_000) return json({error:"問題音檔為空或超過 15 MB。"},400);
  const key=`study/drafts/${taskId}/${crypto.randomUUID()}.${type==='audio/wav'?'wav':'mp3'}`; await env.AUDIO.put(key,audio,{httpMetadata:{contentType:type}});
  await env.DB.prepare("UPDATE study_tasks SET audio_object_key=?, audio_content_type=?, updated_by=?, updated_at=? WHERE task_id=?").bind(key,type,email,new Date().toISOString(),taskId).run(); await audit(env,email,"upload_task_audio",null,taskId); return json({ok:true});
}

async function taskAudio(env, taskId) { const row=await env.DB.prepare("SELECT audio_object_key,audio_content_type FROM study_tasks WHERE task_id=?").bind(taskId).first(); if(!row?.audio_object_key)return json({error:"找不到問題音檔。"},404); const object=await env.AUDIO.get(row.audio_object_key); return object?new Response(object.body,{headers:{"Content-Type":row.audio_content_type,"Cache-Control":"private, no-store"}}):json({error:"找不到問題音檔。"},404); }

async function publishTasks(env,email){const result=await env.DB.prepare("SELECT task_id,title,prompt_text,research_instructions,max_playbacks,max_recordings,audio_object_key,audio_content_type FROM study_tasks ORDER BY sort_order,task_id").all();const tasks=result.results||[];if(!tasks.length||tasks.some((task)=>!task.audio_object_key))return json({error:"每一題都必須先上傳問題音檔。"},409);const latest=await env.DB.prepare("SELECT MAX(version) AS version FROM study_publications").first();const version=Number(latest?.version||0)+1;const published_at=new Date().toISOString();const snapshot=tasks.map((task)=>({...task,audio_stimulus:`/api/study-assets/${task.task_id}`}));await env.DB.prepare("INSERT INTO study_publications (version,tasks_json,published_by,published_at) VALUES (?,?,?,?)").bind(version,JSON.stringify(snapshot),email,published_at).run();await audit(env,email,"publish_study_tasks");return json({ok:true,version,published_at});}

async function publishedStudyConfig(env){const row=await env.DB.prepare("SELECT version,tasks_json,published_at FROM study_publications ORDER BY version DESC LIMIT 1").first();if(!row)return json({error:"尚未發布研究題目。"},404);return json({version:row.version,published_at:row.published_at,tasks:JSON.parse(row.tasks_json)});}

async function publishedStudyAsset(env, taskId){const row=await env.DB.prepare("SELECT tasks_json FROM study_publications ORDER BY version DESC LIMIT 1").first();if(!row)return json({error:"尚未發布研究題目。"},404);const task=JSON.parse(row.tasks_json).find((item)=>item.task_id===taskId);if(!task?.audio_object_key)return json({error:"找不到問題音檔。"},404);const object=await env.AUDIO.get(task.audio_object_key);return object?new Response(object.body,{headers:{"Content-Type":task.audio_content_type,"Cache-Control":"public, max-age=300","X-Content-Type-Options":"nosniff"}}):json({error:"找不到問題音檔。"},404);}

async function createSubmission(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "請求內容不是有效的 JSON。" }, 400);
  }
  const error = validateSubmissionPayload(payload);
  if (error) return json({ error }, 400);

  const availability = await studyStatus(env);
  if (!availability.open) return json({ error: "本研究目前已停止收件。", study_closed: true }, 409);

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
  if (availability.accepted_submissions + 1 >= availability.max_submissions) {
    await env.DB.prepare("UPDATE study_control SET is_open = 0, closed_reason = 'limit_reached', updated_by = 'system', updated_at = ? WHERE id = 1")
      .bind(new Date().toISOString()).run();
  }
  return json({ submission_id: id }, 201);
}

async function uploadAudio(request, env, submissionId, taskId) {
  if (!isUuid(submissionId)) return json({ error: "匿名提交編號格式不正確。" }, 400);
  const validationError = validateAudioRequest(request, taskId);
  if (validationError) return json({ error: validationError }, 400);
  if (taskId !== "eligibility_001") {
    const publication = await env.DB.prepare("SELECT tasks_json FROM study_publications ORDER BY version DESC LIMIT 1").first();
    const published = publication && JSON.parse(publication.tasks_json).some((task) => task.task_id === taskId);
    if (!published) return json({ error: "此題目不在目前發布版本中。" }, 400);
  }
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
  const publication = await env.DB.prepare("SELECT tasks_json FROM study_publications ORDER BY version DESC LIMIT 1").first();
  const expectedRecordings = publication ? JSON.parse(publication.tasks_json).length + 1 : TASK_IDS.size;
  if (Number(row.recording_count) !== expectedRecordings) return json({ error: "仍有語音題目尚未上傳。" }, 409);
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
        if (env.ADMIN_API_ENABLED !== "true") {
          response = json({ error: "找不到 API 路徑。" }, 404);
        }
        else {
        const email = await researcherIdentity(request, env);
        if (!email) response = json({ error: "未授權的研究人員帳號。" }, 401);
        else if (currentRoute.name === "admin-summary" && request.method === "GET") response = await adminSummary(env, email);
        else if (currentRoute.name === "admin-submissions" && request.method === "GET") response = await adminSubmissions(request, env, email);
        else if (currentRoute.name === "admin-submission" && request.method === "GET") response = await adminSubmission(env, email, currentRoute.submissionId);
        else if (currentRoute.name === "admin-audio" && request.method === "GET") response = await adminAudio(request, env, email, currentRoute.submissionId, currentRoute.taskId);
        else if (currentRoute.name === "admin-review" && request.method === "PUT") response = await adminReview(request, env, email, currentRoute.submissionId);
        else if (currentRoute.name === "admin-export" && request.method === "GET") response = await adminExport(env, email);
        else if (currentRoute.name === "admin-study-control" && ["GET", "PUT"].includes(request.method)) response = await adminStudyControl(request, env, email);
        else if (currentRoute.name === "admin-researchers" && request.method === "GET") response = await adminResearchers(env, email);
        else if (currentRoute.name === "admin-researchers" && request.method === "POST") response = await addResearcher(request, env, email);
        else if (currentRoute.name === "admin-researcher" && ["PATCH", "DELETE"].includes(request.method)) response = await changeResearcher(request, env, email, currentRoute.email);
        else if (currentRoute.name === "admin-researchers-revoke-all" && request.method === "POST") response = await revokeAllResearchers(env, email);
        else if (currentRoute.name === "admin-tasks" && request.method === "GET") response = await adminTasks(env, email);
        else if (currentRoute.name === "admin-task" && request.method === "PUT") response = await saveTask(request, env, email, currentRoute.taskId);
        else if (currentRoute.name === "admin-task" && request.method === "DELETE") { await env.DB.prepare("DELETE FROM study_tasks WHERE task_id=?").bind(currentRoute.taskId).run(); await audit(env,email,"delete_study_task",null,currentRoute.taskId); response=json({ok:true}); }
        else if (currentRoute.name === "admin-task-audio" && request.method === "PUT") response = await saveTaskAudio(request, env, email, currentRoute.taskId);
        else if (currentRoute.name === "admin-task-audio" && request.method === "GET") response = await taskAudio(env, currentRoute.taskId);
        else if (currentRoute.name === "admin-tasks-publish" && request.method === "POST") response = await publishTasks(env, email);
        else response = json({ error: "找不到管理 API 路徑。" }, 404);
        }
      }
      else if (currentRoute.name === "health" && request.method === "GET") response = json({ ok: true });
      else if (currentRoute.name === "study-status" && request.method === "GET") response = json(await studyStatus(env));
      else if (currentRoute.name === "study-config" && request.method === "GET") response = await publishedStudyConfig(env);
      else if (currentRoute.name === "study-asset" && request.method === "GET") response = await publishedStudyAsset(env, currentRoute.taskId);
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

