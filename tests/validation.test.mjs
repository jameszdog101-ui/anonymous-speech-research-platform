import test from "node:test";
import assert from "node:assert/strict";
import { STUDY_CONFIG } from "../public/study-config.js";
import {
  TRANSFORM_PROFILE,
  TRANSFORM_VERSION,
  hasWavHeader,
  validateAudioRequest,
  validateSubmissionPayload
} from "../worker/src/validation.js";

const validProfile = {
  age_group: "18_24",
  language_background: "bilingual",
  first_language: "華語",
  second_language: "英語",
  language_learning_years: 8
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
    "X-Transform-Profile": TRANSFORM_PROFILE,
    "X-Transform-Version": TRANSFORM_VERSION,
    "Content-Length": "1024"
  });
  assert.equal(validateAudioRequest(request, "task_001"), null);
  assert.match(validateAudioRequest(request, "unknown_task"), /未知/);
});

test("study playback policies cannot contradict each other", () => {
  for (const task of STUDY_CONFIG.tasks) {
    assert.notEqual(task.play_once, task.replay_allowed, task.task_id);
  }
});

test("recognizes a WAV container signature", () => {
  assert.equal(hasWavHeader(Buffer.from("RIFF0000WAVE", "ascii")), true);
  assert.equal(hasWavHeader(Buffer.from("not audio", "ascii")), false);
});

