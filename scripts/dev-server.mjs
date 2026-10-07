import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_AUDIO_BYTES,
  TASK_IDS,
  TRANSFORM_PARAMETER_SETS,
  hasWavHeader,
  isUuid,
  transformProfileForSex,
  validateAudioRequest,
  validateSubmissionPayload
} from "../worker/src/validation.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicDirectory = join(root, "public");
const dataDirectory = join(root, "local-data");
const audioDirectory = join(dataDirectory, "transformed-audio");
const metadataPath = join(dataDirectory, "submissions.json");
const port = Number(process.env.PORT || 8788);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon"
};

async function ensureDataStore() {
  await mkdir(audioDirectory, { recursive: true });
  try {
    await readFile(metadataPath);
  } catch {
    await writeFile(metadataPath, JSON.stringify({ submissions: {} }, null, 2));
  }
}

async function readStore() {
  await ensureDataStore();
  const store = JSON.parse(await readFile(metadataPath, "utf8"));
  store.submissions ||= {};
  store.reviews ||= {};
  store.audit_log ||= [];
  return store;
}

async function saveStore(store) {
  await writeFile(metadataPath, JSON.stringify(store, null, 2));
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(payload));
}

async function readBody(request, maximumBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumBytes) throw new Error("PAYLOAD_TOO_LARGE");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function requestAdapter(request) {
  return { headers: { get: (name) => request.headers[name.toLowerCase()] ?? null } };
}

async function handleApi(request, response, pathname) {
  if (pathname === "/admin/api/summary" && request.method === "GET") {
    const store = await readStore();
    const submissions = Object.values(store.submissions);
    sendJson(response, 200, {
      total: submissions.length,
      completed: submissions.filter((item) => item.status === "completed").length,
      in_progress: submissions.filter((item) => item.status === "in_progress").length,
      pending_review: submissions.filter((item) => item.status === "completed" && !store.reviews[item.id]).length
    });
    return true;
  }

  if (pathname === "/admin/api/submissions" && request.method === "GET") {
    const store = await readStore();
    const requestedStatus = new URL(request.url, `http://${request.headers.host}`).searchParams.get("status");
    const submissions = Object.values(store.submissions)
      .filter((item) => !requestedStatus || item.status === requestedStatus)
      .map((item) => ({ ...item.profile, id: item.id, study_id: item.study_id, study_version: item.study_version, status: item.status, created_at: item.created_at, completed_at: item.completed_at, eligibility_status: store.reviews[item.id]?.eligibility_status || null }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    sendJson(response, 200, { submissions });
    return true;
  }

  if (pathname === "/admin/api/exports.csv" && request.method === "GET") {
    const store = await readStore();
    const columns = ["id", "study_id", "study_version", "status", "age_group", "biological_sex", "nationality", "language_background", "first_language", "second_languages", "mandarin_learning_years", "created_at", "completed_at", "eligibility_status", "review_notes"];
    const cell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const lines = Object.values(store.submissions).map((item) => {
      const review = store.reviews[item.id] || {};
      const row = { ...item.profile, ...item, second_languages: JSON.stringify(item.profile.second_languages), eligibility_status: review.eligibility_status, review_notes: review.notes };
      return columns.map((column) => cell(row[column])).join(",");
    });
    response.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": "attachment; filename=anonymous-speech-export.csv", "Cache-Control": "no-store" });
    response.end(`\uFEFF${columns.join(",")}\r\n${lines.join("\r\n")}`);
    return true;
  }

  const adminAudioMatch = pathname.match(/^\/admin\/api\/submissions\/([^/]+)\/tasks\/([^/]+)\/audio$/);
  if (adminAudioMatch && request.method === "GET") {
    const [, submissionId, taskId] = adminAudioMatch;
    const store = await readStore();
    const recording = store.submissions[submissionId]?.recordings?.[taskId];
    if (!recording) return sendJson(response, 404, { error: "找不到錄音。" }), true;
    try {
      const audio = await readFile(join(audioDirectory, recording.file));
      const download = new URL(request.url, `http://${request.headers.host}`).searchParams.get("download") === "1";
      response.writeHead(200, { "Content-Type": "audio/wav", "Cache-Control": "no-store", ...(download ? { "Content-Disposition": `attachment; filename="${submissionId}-${taskId}.wav"` } : {}) });
      response.end(audio);
    } catch { sendJson(response, 404, { error: "找不到音檔。" }); }
    return true;
  }

  const adminReviewMatch = pathname.match(/^\/admin\/api\/submissions\/([^/]+)\/review$/);
  if (adminReviewMatch && request.method === "PUT") {
    const store = await readStore();
    const submissionId = adminReviewMatch[1];
    if (!store.submissions[submissionId]) return sendJson(response, 404, { error: "找不到匿名提交。" }), true;
    try {
      const payload = JSON.parse((await readBody(request, 8 * 1024)).toString("utf8"));
      if (!["eligible", "ineligible", "undetermined"].includes(payload.eligibility_status)) return sendJson(response, 400, { error: "審核結果不正確。" }), true;
      store.reviews[submissionId] = { eligibility_status: payload.eligibility_status, notes: String(payload.notes || "").trim().slice(0, 1000), reviewed_by: "local-researcher", reviewed_at: new Date().toISOString() };
      await saveStore(store); sendJson(response, 200, { ok: true, reviewed_at: store.reviews[submissionId].reviewed_at });
    } catch { sendJson(response, 400, { error: "審核內容格式不正確。" }); }
    return true;
  }

  const adminSubmissionMatch = pathname.match(/^\/admin\/api\/submissions\/([^/]+)$/);
  if (adminSubmissionMatch && request.method === "GET") {
    const store = await readStore();
    const item = store.submissions[adminSubmissionMatch[1]];
    if (!item) return sendJson(response, 404, { error: "找不到匿名提交。" }), true;
    const review = store.reviews[item.id] || {};
    const submission = { ...item.profile, id: item.id, study_id: item.study_id, study_version: item.study_version, status: item.status, created_at: item.created_at, completed_at: item.completed_at, eligibility_status: review.eligibility_status, review_notes: review.notes };
    const recordings = Object.entries(item.recordings).map(([task_id, recording]) => ({ task_id, ...recording }));
    sendJson(response, 200, { submission, recordings });
    return true;
  }

  if (pathname === "/api/health" && request.method === "GET") {
    sendJson(response, 200, { ok: true, mode: "local" });
    return true;
  }

  if (pathname === "/api/submissions" && request.method === "POST") {
    try {
      const payload = JSON.parse((await readBody(request, 32 * 1024)).toString("utf8"));
      const error = validateSubmissionPayload(payload);
      if (error) return sendJson(response, 400, { error }), true;
      const id = crypto.randomUUID();
      const store = await readStore();
      store.submissions[id] = {
        id,
        study_id: payload.study_id,
        study_version: payload.study_version,
        status: "in_progress",
        profile: payload.profile,
        recordings: {},
        created_at: new Date().toISOString()
      };
      await saveStore(store);
      sendJson(response, 201, { submission_id: id });
    } catch {
      sendJson(response, 400, { error: "請求內容格式不正確。" });
    }
    return true;
  }

  const audioMatch = pathname.match(/^\/api\/submissions\/([^/]+)\/tasks\/([^/]+)\/audio$/);
  if (audioMatch && request.method === "PUT") {
    const [, submissionId, taskId] = audioMatch;
    if (!isUuid(submissionId)) return sendJson(response, 400, { error: "匿名提交編號格式不正確。" }), true;
    const error = validateAudioRequest(requestAdapter(request), taskId);
    if (error) return sendJson(response, 400, { error }), true;
    const store = await readStore();
    const submission = store.submissions[submissionId];
    if (!submission) return sendJson(response, 404, { error: "找不到匿名提交。" }), true;
    if (submission.status !== "in_progress") return sendJson(response, 409, { error: "此提交已完成。" }), true;
    const transformProfile = request.headers["x-transform-profile"];
    const transformVersion = request.headers["x-transform-version"];
    if (transformProfile !== transformProfileForSex(submission.profile.biological_sex)) {
      return sendJson(response, 400, { error: "聲音轉換設定與背景資料不一致。" }), true;
    }
    try {
      const audio = await readBody(request, MAX_AUDIO_BYTES);
      if (audio.length === 0) return sendJson(response, 400, { error: "音檔不可為空。" }), true;
      if (!hasWavHeader(audio)) return sendJson(response, 400, { error: "音檔不是有效的 WAV 格式。" }), true;
      const filename = `${submissionId}-${taskId}.wav`;
      await writeFile(join(audioDirectory, filename), audio);
      submission.recordings[taskId] = {
        file: filename,
        audio_bytes: audio.length,
        transform_profile: transformProfile,
        transform_version: transformVersion,
        transform_parameters: TRANSFORM_PARAMETER_SETS[transformProfile],
        uploaded_at: new Date().toISOString()
      };
      await saveStore(store);
      sendJson(response, 200, { ok: true, task_id: taskId });
    } catch (bodyError) {
      sendJson(response, bodyError.message === "PAYLOAD_TOO_LARGE" ? 413 : 400, { error: "音檔超過大小限制或無法讀取。" });
    }
    return true;
  }

  const finalizeMatch = pathname.match(/^\/api\/submissions\/([^/]+)\/finalize$/);
  if (finalizeMatch && request.method === "POST") {
    const submissionId = finalizeMatch[1];
    if (!isUuid(submissionId)) return sendJson(response, 400, { error: "匿名提交編號格式不正確。" }), true;
    const store = await readStore();
    const submission = store.submissions[submissionId];
    if (!submission) return sendJson(response, 404, { error: "找不到匿名提交。" }), true;
    if (Object.keys(submission.recordings).length !== TASK_IDS.size) {
      return sendJson(response, 409, { error: "仍有語音題目尚未上傳。" }), true;
    }
    submission.status = "completed";
    submission.completed_at = new Date().toISOString();
    await saveStore(store);
    sendJson(response, 200, { receipt_id: submissionId });
    return true;
  }

  if (pathname.startsWith("/api/")) {
    sendJson(response, 404, { error: "找不到 API 路徑。" });
    return true;
  }
  return false;
}

async function serveStatic(response, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname.endsWith("/") ? `${pathname}index.html` : pathname;
  const relativePath = normalize(decodeURIComponent(requested)).replace(/^([/\\])+/, "");
  const fullPath = join(publicDirectory, relativePath);
  if (!fullPath.startsWith(publicDirectory)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const content = await readFile(fullPath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(fullPath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": extname(fullPath) === ".html" ? "no-cache" : "public, max-age=60",
      "X-Content-Type-Options": "nosniff",
      "Permissions-Policy": "camera=(), microphone=(self)"
    });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (await handleApi(request, response, url.pathname)) return;
    await serveStatic(response, url.pathname);
  } catch {
    sendJson(response, 500, { error: "本機伺服器處理失敗。" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Anonymous Speech Platform running at http://127.0.0.1:${port}`);
  console.log("Local transformed audio is stored under local-data/ and is ignored by Git.");
});


