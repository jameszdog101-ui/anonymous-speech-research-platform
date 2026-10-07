import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { STUDY_CONFIG } from "../public/study-config.js";
import {
  REQUIRED_SECOND_LANGUAGE,
  TASK_IDS,
  TRANSFORM_PROFILES,
  TRANSFORM_PARAMETER_SETS,
  hasWavHeader,
  transformProfileForSex,
  validateAudioRequest,
  validateSubmissionPayload
} from "../worker/src/validation.js";

const validProfile = {
  age_group: "18_24",
  biological_sex: "male",
  nationality: "日本",
  language_background: "bilingual",
  first_language: "日文",
  second_languages: ["中文（普通話）"],
  mandarin_learning_years: 8
};

function audioRequest(headers = {}) {
  const normalized = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  return { headers: { get: (name) => normalized.get(name.toLowerCase()) ?? null } };
}

test("accepts only the confirmed profile fields", () => {
  assert.equal(validateSubmissionPayload({ consent: true, study_id: "pilot", study_version: "1", profile: validProfile }), null);
  assert.match(validateSubmissionPayload({
    consent: true,
    study_id: "pilot",
    study_version: "1",
    profile: { ...validProfile, email: "not-allowed@example.com" }
  }), /未允許/);
});

test("requires explicit consent", () => {
  assert.match(validateSubmissionPayload({ consent: false, study_id: "pilot", study_version: "1", profile: validProfile }), /同意/);
});

test("rejects raw or ambiguously labeled audio", () => {
  const request = audioRequest({ "Content-Type": "audio/webm", "X-Audio-State": "raw" });
  assert.match(validateAudioRequest(request, "task_001"), /WAV|轉換/);
  assert.match(validateAudioRequest(request, "eligibility_001"), /WAV|轉換/);
});

test("accepts only the versioned transformed WAV contract", () => {
  const request = audioRequest({
    "Content-Type": "audio/wav",
    "X-Audio-State": "transformed",
    "X-Transform-Profile": "PROFILE_A_M",
    "X-Transform-Version": TRANSFORM_PROFILES.PROFILE_A_M,
    "Content-Length": "1024"
  });
  assert.equal(validateAudioRequest(request, "task_001"), null);
  assert.equal(validateAudioRequest(request, "eligibility_001"), null);
  assert.match(validateAudioRequest(request, "unknown_task"), /未知/);
});

test("study playback policies cannot contradict each other", () => {
  for (const task of STUDY_CONFIG.tasks) {
    assert.notEqual(task.play_once, task.replay_allowed, task.task_id);
    assert.equal(task.max_playbacks, 2, task.task_id);
    assert.equal(task.max_recordings, 2, task.task_id);
  }
});

test("biological sex maps to one fixed v2 transform profile", () => {
  assert.equal(transformProfileForSex("male"), "PROFILE_A_M");
  assert.equal(transformProfileForSex("female"), "PROFILE_A_F");
  assert.equal(transformProfileForSex("unknown"), null);
  assert.equal(TRANSFORM_PARAMETER_SETS.PROFILE_A_M.pitchSemitones, 3);
  assert.equal(TRANSFORM_PARAMETER_SETS.PROFILE_A_F.pitchSemitones, -3);
  assert.equal(TRANSFORM_PARAMETER_SETS.PROFILE_A_M.modulationDepthMs, 0);
  assert.equal(TRANSFORM_PARAMETER_SETS.PROFILE_A_F.modulationDepthMs, 0);
});

test("requires Mandarin as L2 and derives bilingual or multilingual consistently", () => {
  assert.equal(REQUIRED_SECOND_LANGUAGE, "中文（普通話）");
  assert.equal(validateSubmissionPayload({ consent: true, study_id: "pilot", study_version: "1", profile: validProfile }), null);
  assert.match(validateSubmissionPayload({
    consent: true, study_id: "pilot", study_version: "1",
    profile: { ...validProfile, language_background: "monolingual" }
  }), /語言背景/);
  assert.match(validateSubmissionPayload({
    consent: true, study_id: "pilot", study_version: "1",
    profile: { ...validProfile, second_languages: ["英語"] }
  }), /中文/);
  assert.equal(validateSubmissionPayload({
    consent: true, study_id: "pilot", study_version: "1",
    profile: { ...validProfile, language_background: "multilingual", second_languages: ["中文（普通話）", "英語"] }
  }), null);
  assert.match(validateSubmissionPayload({
    consent: true, study_id: "pilot", study_version: "1",
    profile: { ...validProfile, second_languages: ["中文（普通話）", "英語"] }
  }), /數量不一致/);
});

test("recognizes a WAV container signature", () => {
  assert.equal(hasWavHeader(Buffer.from("RIFF0000WAVE", "ascii")), true);
  assert.equal(hasWavHeader(Buffer.from("not audio", "ascii")), false);
});

test("completion UI and proof do not expose the submission UUID", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  assert.doesNotMatch(html, /receipt-id|匿名提交編號/);
  assert.match(html, /download-proof/);
  assert.match(app, /Contains no submission ID/);
  assert.doesNotMatch(app, /receipt_id/);
  assert.doesNotMatch(html, /取得匿名編號|資料已以匿名編號儲存/);
  assert.doesNotMatch(html, /Zero-Cost Automated Speech Research Platform|PROFILE_A v2\.0\.1|測試版/);
});

test("eligibility recording is transformed locally and only the transformed WAV is uploaded", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(html, /你的聲音會先去識別化/);
  assert.match(html, /本研究不會將任何錄音用於訓練 AI/);
  assert.match(html, /確認你是否以填寫的第一語言自然表達/);
  assert.match(html, /你的母語，也就是你從小最自然、最常使用的語言/);
  assert.match(html, /不要使用正在學習的中文/);
  assert.match(html, /第一語言使用情況與錄音品質/);
  assert.match(html, /正式作答只會上傳並儲存去識別化後的版本/);
  assert.match(app, /transformRecording\(rawBlob, activeTransformProfile\(\)\)/);
  assert.match(app, /uploadTransformedAudio\(state\.submissionId, runtimeConfig\.eligibilityTask, state\.deviceProcessedAudio/);
  assert.doesNotMatch(app, /createObjectURL\(rawBlob\)/);
  assert.equal(TASK_IDS.has("eligibility_001"), true);
});

test("device audio uses a four-second melody and an explicit audibility confirmation", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const wav = await readFile(new URL("../public/assets/device-test-music.wav", import.meta.url));
  const sampleRate = wav.readUInt32LE(24);
  const dataBytes = wav.readUInt32LE(40);
  const durationSeconds = dataBytes / 2 / sampleRate;

  assert.ok(durationSeconds >= 3 && durationSeconds <= 5, `unexpected duration: ${durationSeconds}`);
  assert.match(html, /id="device-heard-confirm"/);
  assert.match(html, /我能清楚聽到測試音樂/);
  assert.match(html, /今天早上、中午和晚上的天氣/);
});

test("optional other-language guidance remains readable after translation", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /placeholder="例如：英語"/);
  assert.match(html, /other-language-note/);
  assert.doesNotMatch(html, /placeholder="[^"]*可留白/);
});

test("background form fixes Mandarin as L2 and derives language background", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.doesNotMatch(html, /name="language_background"/);
  assert.match(html, /<strong>中文（普通話）<\/strong>/);
  assert.match(html, /華語／漢語／中文／普通話學習時間（年）/);
  assert.match(html, /name="other_languages"/);
  assert.match(app, /language_background: otherLanguages\.length > 0 \? "multilingual" : "bilingual"/);
  assert.match(app, /second_languages: \["中文（普通話）", \.\.\.otherLanguages\]/);
});

test("language recovery controls remain readable in every translation", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(html, /id="change-language"[^>]*notranslate[^>]*>🌐 語言 Language</);
  assert.match(html, /id="platform-language"[^>]*notranslate[^>]*translate="no"/);
  assert.match(html, /繁體中文 \/ Traditional Chinese/);
  assert.match(html, /한국어 \/ Korean/);
  assert.match(app, /language === "zh-TW"[\s\S]*window\.location\.reload\(\)/);
});

test("brand mark is graphical and cannot be translated", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");
  const logo = await readFile(new URL("../public/assets/research-mark.svg", import.meta.url), "utf8");
  const server = await readFile(new URL("../scripts/dev-server.mjs", import.meta.url), "utf8");

  assert.equal((html.match(/research-mark\.svg/g) || []).length, 2);
  assert.doesNotMatch(html, /class="brand-mark[^>]*>聲</);
  assert.doesNotMatch(app, /fillText\("聲"/);
  assert.match(logo, /<svg/);
  assert.doesNotMatch(logo, /<text/);
  assert.match(server, /"\.svg": "image\/svg\+xml/);
});

test("GitHub Pages demo uses relative assets and blocks research uploads", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const config = await readFile(new URL("../public/study-config.js", import.meta.url), "utf8");
  const api = await readFile(new URL("../public/api-client.js", import.meta.url), "utf8");

  assert.doesNotMatch(html, /(?:src|href)="\//);
  assert.doesNotMatch(config, /audio_stimulus:\s*"\//);
  assert.match(api, /hostname\.endsWith\("github\.io"\)/);
  assert.match(api, /不會建立或上傳研究資料/);
  assert.match(api, /hostname\.endsWith\("\.pages\.dev"\)/);
  assert.match(api, /anonymous-speech-platform-api\.jameszdog101\.workers\.dev/);
  assert.match(api, /fetch\(apiUrl\(/);
});

test("researcher portal requires Access identity and audits sensitive actions", async () => {
  const worker = await readFile(new URL("../worker/src/index.js", import.meta.url), "utf8");
  const schema = await readFile(new URL("../worker/schema.sql", import.meta.url), "utf8");
  const admin = await readFile(new URL("../public/admin/index.html", import.meta.url), "utf8");

  assert.match(worker, /Cf-Access-Authenticated-User-Email/);
  assert.match(worker, /Cf-Access-Jwt-Assertion/);
  assert.match(worker, /env\.ADMIN_API_ENABLED !== "true"/);
  assert.match(worker, /download_audio/);
  assert.match(worker, /review_eligibility/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS submission_reviews/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS researcher_audit_log/);
  assert.match(admin, /符合/);
  assert.match(admin, /不符合/);
  assert.match(admin, /無法判定/);
  assert.match(admin, /研究者管理/);
  assert.match(admin, /題目與音檔/);
  assert.match(admin, /撤銷所有其他研究者/);
  assert.match(worker, /PROJECT_OWNER_EMAIL/);
  assert.match(worker, /publish_study_tasks/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS researchers/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS study_tasks/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS study_publications/);
});

test("study collection has a server-enforced cap and manual control", async () => {
  const schema = await readFile(new URL("../worker/schema.sql", import.meta.url), "utf8");
  const worker = await readFile(new URL("../worker/src/index.js", import.meta.url), "utf8");
  const admin = await readFile(new URL("../public/admin/admin.js", import.meta.url), "utf8");
  const client = await readFile(new URL("../public/api-client.js", import.meta.url), "utf8");
  assert.match(schema, /CREATE TABLE IF NOT EXISTS study_control/);
  assert.match(schema, /max_submissions INTEGER NOT NULL DEFAULT 100/);
  assert.match(worker, /availability\.accepted_submissions \+ 1 >= availability\.max_submissions/);
  assert.match(worker, /本研究目前已停止收件/);
  assert.match(admin, /admin\/api\/study-control/);
  assert.match(client, /api\/study-status/);
});

test("researcher UI is deployed with the Worker while admin APIs run through authentication", async () => {
  const config = await readFile(new URL("../wrangler.toml", import.meta.url), "utf8");
  assert.match(config, /\[assets\][\s\S]*directory = "\.\/public"/);
  assert.match(config, /run_worker_first = \["\/api\/\*", "\/admin\/api\/\*"\]/);
  assert.doesNotMatch(config, /PROJECT_OWNER_EMAIL|jameszdog101@gmail\.com/);
});

