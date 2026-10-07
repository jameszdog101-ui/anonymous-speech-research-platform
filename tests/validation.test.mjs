import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { STUDY_CONFIG } from "../public/study-config.js";
import {
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
  second_languages: ["英語", "日語"],
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

test("monolingual profiles may omit L2 but bilingual profiles may not", () => {
  assert.equal(validateSubmissionPayload({
    consent: true, study_id: "pilot", study_version: "1",
    profile: { ...validProfile, language_background: "monolingual", second_languages: [] }
  }), null);
  assert.match(validateSubmissionPayload({
    consent: true, study_id: "pilot", study_version: "1",
    profile: { ...validProfile, second_languages: [] }
  }), /至少/);
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
});

test("device test previews transformed audio and privacy promises are explicit", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/app.js", import.meta.url), "utf8");

  assert.match(html, /你的聲音會先去識別化/);
  assert.match(html, /本研究不會將任何錄音用於訓練 AI/);
  assert.match(html, /正式作答只會上傳並儲存去識別化後的版本/);
  assert.match(app, /transformRecording\(rawBlob, activeTransformProfile\(\)\)/);
  assert.doesNotMatch(app, /createObjectURL\(rawBlob\)/);
});

test("second-language guidance remains readable after translation", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /placeholder="例如：英語"/);
  assert.match(html, /second-language-note/);
  assert.doesNotMatch(html, /placeholder="[^"]*單語者可留白/);
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

