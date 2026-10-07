import { encodeWavMono, transformSamples } from "./audio-dsp.js";

self.addEventListener("message", (event) => {
  try {
    const { samplesBuffer, sampleRate, profile } = event.data;
    const samples = new Float32Array(samplesBuffer);
    const transformed = transformSamples(samples, sampleRate, profile);
    const wavBuffer = encodeWavMono(transformed, sampleRate);
    self.postMessage({ ok: true, wavBuffer }, [wavBuffer]);
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : "Unknown transformation failure." });
  }
});

