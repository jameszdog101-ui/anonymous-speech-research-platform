function connectChain(source, nodes, destination) {
  let current = source;
  for (const node of nodes) {
    current.connect(node);
    current = node;
  }
  current.connect(destination);
}

function writeAscii(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

export function encodeWav(audioBuffer) {
  const channels = audioBuffer.numberOfChannels;
  const frames = audioBuffer.length;
  const bytesPerSample = 2;
  const dataSize = frames * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, audioBuffer.sampleRate, true);
  view.setUint32(28, audioBuffer.sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  const channelData = Array.from({ length: channels }, (_, channel) => audioBuffer.getChannelData(channel));
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([buffer], { type: "audio/wav" });
}

export async function transformRecording(rawBlob, profile) {
  if (!(rawBlob instanceof Blob) || rawBlob.size === 0) {
    throw new Error("錄音內容為空白，請重新錄製。");
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const OfflineContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!AudioContextClass || !OfflineContextClass) {
    throw new Error("此瀏覽器不支援裝置內音訊處理。");
  }

  const decodeContext = new AudioContextClass();
  let decoded;
  try {
    decoded = await decodeContext.decodeAudioData(await rawBlob.arrayBuffer());
  } finally {
    await decodeContext.close();
  }

  const outputLength = Math.ceil(decoded.length / profile.playbackRate);
  const offline = new OfflineContextClass(decoded.numberOfChannels, outputLength, decoded.sampleRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.playbackRate.value = profile.playbackRate;

  const highpass = offline.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = profile.highpassHz;

  const formantDip = offline.createBiquadFilter();
  formantDip.type = "peaking";
  formantDip.frequency.value = profile.formantDipHz;
  formantDip.Q.value = 1.1;
  formantDip.gain.value = profile.formantDipDb;

  const presence = offline.createBiquadFilter();
  presence.type = "peaking";
  presence.frequency.value = profile.presenceHz;
  presence.Q.value = 0.9;
  presence.gain.value = profile.presenceDb;

  const lowpass = offline.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = Math.min(profile.lowpassHz, decoded.sampleRate * 0.45);

  const compressor = offline.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 16;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.01;
  compressor.release.value = 0.2;

  connectChain(source, [highpass, formantDip, presence, lowpass, compressor], offline.destination);
  source.start(0);
  const transformed = await offline.startRendering();
  return encodeWav(transformed);
}

