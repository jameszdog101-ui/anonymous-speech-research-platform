import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const baseUrl = process.env.APP_URL || "http://127.0.0.1:8788";
const wavPath = fileURLToPath(new URL("../public/assets/stimulus-01.wav", import.meta.url));
const wav = await readFile(wavPath);

async function json(response) {
  const payload = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

const health = await json(await fetch(`${baseUrl}/api/health`));
if (!health.ok) throw new Error("Health endpoint failed.");

const created = await json(await fetch(`${baseUrl}/api/submissions`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    consent: true,
    study_id: "speech-pilot-001",
    study_version: "0.4.0",
    profile: {
      age_group: "18_24",
      biological_sex: "male",
      nationality: "Japan",
      language_background: "bilingual",
      first_language: "Japanese",
      second_languages: ["中文（普通話）"],
      mandarin_learning_years: 8
    }
  })
}));

const rawAttempt = await fetch(`${baseUrl}/api/submissions/${created.submission_id}/tasks/task_001/audio`, {
  method: "PUT",
  headers: { "Content-Type": "audio/webm", "X-Audio-State": "raw" },
  body: Buffer.from("raw-audio-must-not-be-accepted")
});
if (rawAttempt.status !== 400) throw new Error(`Raw audio was not rejected: ${rawAttempt.status}`);

const mismatchedProfileAttempt = await fetch(`${baseUrl}/api/submissions/${created.submission_id}/tasks/task_001/audio`, {
  method: "PUT",
  headers: {
    "Content-Type": "audio/wav",
    "X-Audio-State": "transformed",
    "X-Transform-Profile": "PROFILE_A_F",
    "X-Transform-Version": "2.0.1"
  },
  body: wav
});
if (mismatchedProfileAttempt.status !== 400) {
  throw new Error(`Sex/profile mismatch was not rejected: ${mismatchedProfileAttempt.status}`);
}

for (const taskId of ["eligibility_001", "task_001", "task_002"]) {
  await json(await fetch(`${baseUrl}/api/submissions/${created.submission_id}/tasks/${taskId}/audio`, {
    method: "PUT",
    headers: {
      "Content-Type": "audio/wav",
      "X-Audio-State": "transformed",
      "X-Transform-Profile": "PROFILE_A_M",
      "X-Transform-Version": "2.0.1"
    },
    body: wav
  }));
}

const completed = await json(await fetch(`${baseUrl}/api/submissions/${created.submission_id}/finalize`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{}"
}));

console.log(`Smoke test passed. Receipt: ${completed.receipt_id}`);

