const TWO_PI = Math.PI * 2;

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function rms(samples) {
  if (samples.length === 0) return 0;
  let energy = 0;
  for (let index = 0; index < samples.length; index += 1) energy += samples[index] * samples[index];
  return Math.sqrt(energy / samples.length);
}

export function resampleLinear(samples, ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) throw new Error("Invalid pitch ratio.");
  const outputLength = Math.max(1, Math.round(samples.length / ratio));
  const output = new Float32Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const sourcePosition = index * ratio;
    const left = Math.min(samples.length - 1, Math.floor(sourcePosition));
    const right = Math.min(samples.length - 1, left + 1);
    const fraction = sourcePosition - left;
    output[index] = samples[left] * (1 - fraction) + samples[right] * fraction;
  }
  return output;
}

export function timeStretchOla(samples, stretchRatio, targetLength, frameSize = 1024, analysisHop = 256) {
  const synthesisHop = Math.max(1, Math.round(analysisHop * stretchRatio));
  const output = new Float32Array(targetLength + frameSize);
  const weights = new Float32Array(output.length);
  const window = new Float32Array(frameSize);
  for (let index = 0; index < frameSize; index += 1) {
    window[index] = 0.5 - 0.5 * Math.cos(TWO_PI * index / (frameSize - 1));
  }

  let inputPosition = 0;
  let outputPosition = 0;
  while (inputPosition < samples.length && outputPosition < targetLength) {
    for (let frame = 0; frame < frameSize; frame += 1) {
      const inputIndex = inputPosition + frame;
      const outputIndex = outputPosition + frame;
      if (outputIndex >= output.length) break;
      const weight = window[frame];
      output[outputIndex] += (samples[inputIndex] || 0) * weight;
      weights[outputIndex] += weight;
    }
    inputPosition += analysisHop;
    outputPosition += synthesisHop;
  }

  const normalized = new Float32Array(targetLength);
  for (let index = 0; index < targetLength; index += 1) {
    normalized[index] = weights[index] > 1e-5 ? output[index] / weights[index] : 0;
  }
  return normalized;
}

function biquadCoefficients(type, sampleRate, frequency, q = 0.707, gainDb = 0) {
  const safeFrequency = clamp(frequency, 20, sampleRate * 0.45);
  const omega = TWO_PI * safeFrequency / sampleRate;
  const cosine = Math.cos(omega);
  const sine = Math.sin(omega);
  const alpha = sine / (2 * q);
  const amplitude = 10 ** (gainDb / 40);
  let b0;
  let b1;
  let b2;
  let a0;
  let a1;
  let a2;

  if (type === "highpass") {
    b0 = (1 + cosine) / 2;
    b1 = -(1 + cosine);
    b2 = (1 + cosine) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cosine;
    a2 = 1 - alpha;
  } else if (type === "lowpass") {
    b0 = (1 - cosine) / 2;
    b1 = 1 - cosine;
    b2 = (1 - cosine) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cosine;
    a2 = 1 - alpha;
  } else {
    b0 = 1 + alpha * amplitude;
    b1 = -2 * cosine;
    b2 = 1 - alpha * amplitude;
    a0 = 1 + alpha / amplitude;
    a1 = -2 * cosine;
    a2 = 1 - alpha / amplitude;
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

export function applyBiquad(samples, sampleRate, type, frequency, q, gainDb = 0) {
  const { b0, b1, b2, a1, a2 } = biquadCoefficients(type, sampleRate, frequency, q, gainDb);
  const output = new Float32Array(samples.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const x0 = samples[index];
    const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    output[index] = y0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
  }
  return output;
}

export function applyModulatedDelay(samples, sampleRate, depthMs, rateHz) {
  const output = new Float32Array(samples.length);
  const baseDelay = Math.max(2, depthMs * sampleRate / 1000);
  for (let index = 0; index < samples.length; index += 1) {
    const modulation = (0.5 + 0.5 * Math.sin(TWO_PI * rateHz * index / sampleRate)) * baseDelay;
    const readPosition = index - baseDelay - modulation;
    if (readPosition <= 0) continue;
    const left = Math.floor(readPosition);
    const right = Math.min(samples.length - 1, left + 1);
    const fraction = readPosition - left;
    output[index] = samples[left] * (1 - fraction) + samples[right] * fraction;
  }
  return output;
}

function normalizeAndLimit(samples, targetRms) {
  const inputRms = rms(samples);
  if (inputRms < 0.0005) throw new Error("Recording is silent or too quiet.");
  const gain = clamp(targetRms / inputRms, 0.35, 8);
  const output = new Float32Array(samples.length);
  const drive = 1.35;
  const divisor = Math.tanh(drive);
  for (let index = 0; index < samples.length; index += 1) {
    output[index] = Math.tanh(samples[index] * gain * drive) / divisor * 0.9;
  }
  return output;
}

export function transformSamples(samples, sampleRate, profile) {
  if (!(samples instanceof Float32Array) || samples.length < sampleRate * 0.2) throw new Error("Recording is too short.");
  const pitchRatio = 2 ** (profile.pitchSemitones / 12);
  const resampled = resampleLinear(samples, pitchRatio);
  let output = timeStretchOla(resampled, pitchRatio, samples.length, profile.frameSize, profile.analysisHop);

  for (const center of profile.formantCentersHz) {
    output = applyBiquad(output, sampleRate, "peaking", center, 1.2, -4.5);
    output = applyBiquad(output, sampleRate, "peaking", center * profile.formantScale, 1.0, 5.5);
  }
  output = applyModulatedDelay(output, sampleRate, profile.modulationDepthMs, profile.modulationRateHz);
  output = applyBiquad(output, sampleRate, "highpass", profile.highpassHz, 0.707);
  output = applyBiquad(output, sampleRate, "lowpass", profile.lowpassHz, 0.707);
  output = normalizeAndLimit(output, profile.targetRms);

  let differenceEnergy = 0;
  let inputEnergy = 0;
  for (let index = 0; index < output.length; index += 1) {
    if (!Number.isFinite(output[index])) throw new Error("Transformation produced invalid audio.");
    const difference = output[index] - samples[index];
    differenceEnergy += difference * difference;
    inputEnergy += samples[index] * samples[index];
  }
  const relativeDifference = Math.sqrt(differenceEnergy / Math.max(inputEnergy, 1e-9));
  if (relativeDifference < 0.12) throw new Error("Transformation strength check failed.");
  return output;
}

export function encodeWavMono(samples, sampleRate) {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeAscii = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = clamp(samples[index], -1, 1);
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return buffer;
}

