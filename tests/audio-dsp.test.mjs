import test from "node:test";
import assert from "node:assert/strict";
import { rms, transformSamples } from "../public/audio-dsp.js";
import { STUDY_CONFIG } from "../public/study-config.js";

function voiceLikeSignal(sampleRate, seconds) {
  const samples = new Float32Array(sampleRate * seconds);
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const envelope = Math.min(1, time * 8, (seconds - time) * 8);
    samples[index] = envelope * (
      0.32 * Math.sin(2 * Math.PI * 140 * time) +
      0.16 * Math.sin(2 * Math.PI * 280 * time) +
      0.09 * Math.sin(2 * Math.PI * 700 * time) +
      0.06 * Math.sin(2 * Math.PI * 1540 * time)
    );
  }
  return samples;
}

function relativeDifference(left, right) {
  let difference = 0;
  let reference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference += (left[index] - right[index]) ** 2;
    reference += left[index] ** 2;
  }
  return Math.sqrt(difference / reference);
}

test("v2 profiles preserve duration while materially changing the signal", () => {
  const sampleRate = 16000;
  const input = voiceLikeSignal(sampleRate, 1.5);
  const male = transformSamples(input, sampleRate, STUDY_CONFIG.transformProfiles.male);
  const female = transformSamples(input, sampleRate, STUDY_CONFIG.transformProfiles.female);

  assert.equal(male.length, input.length);
  assert.equal(female.length, input.length);
  assert.ok(rms(male) > 0.03);
  assert.ok(rms(female) > 0.03);
  assert.ok(relativeDifference(input, male) > 0.5);
  assert.ok(relativeDifference(input, female) > 0.5);
  assert.ok(relativeDifference(male, female) > 0.5);
});

test("v2 processing fails closed for silence", () => {
  const silent = new Float32Array(16000);
  assert.throws(() => transformSamples(silent, 16000, STUDY_CONFIG.transformProfiles.male), /silent|quiet/i);
});
