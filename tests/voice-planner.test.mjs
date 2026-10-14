import test from "node:test";
import assert from "node:assert/strict";
import { candidates, defaultPlan, planIssues, planManifest } from "../public/admin/voice-planner.js";

test("content-only audio studies can use the integrated PROFILE_A engine", () => {
  const plan = defaultPlan();
  const profile = candidates(plan).find(model => model.id === "profile_a");
  assert.equal(profile.compatible, true);
  assert.deepEqual(planIssues(plan), []);
});

test("formant studies exclude PROFILE_A and recommend formant-safe planning candidates", () => {
  const plan = { schema: 1, goals: ["content", "formants"], output: "audio", model: null };
  const rows = candidates(plan);
  assert.equal(rows.find(model => model.id === "profile_a").compatible, false);
  assert.equal(rows.find(model => model.id === "world_pitch").compatible, true);
});

test("voice-quality research supports local measurement rather than transformed audio", () => {
  const audioPlan = { schema: 1, goals: ["quality"], output: "audio", model: null };
  const featurePlan = { ...audioPlan, output: "features" };
  assert.equal(candidates(audioPlan).some(model => model.compatible), false);
  assert.equal(candidates(featurePlan).find(model => model.id === "local_features").compatible, true);
});

test("a planning candidate cannot be published before its engine is integrated", () => {
  const plan = { schema: 1, goals: ["content", "formants"], output: "audio", model: "world_pitch" };
  assert.match(planIssues(plan)[0], /尚未接入/);
  assert.equal(planManifest(plan).runtimeIntegrated, false);
});
