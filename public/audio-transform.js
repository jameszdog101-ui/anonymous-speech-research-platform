function downmixToMono(audioBuffer) {
  const mono = new Float32Array(audioBuffer.length);
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    const data = audioBuffer.getChannelData(channel);
    for (let index = 0; index < data.length; index += 1) mono[index] += data[index] / audioBuffer.numberOfChannels;
  }
  return mono;
}

function runTransformWorker(samples, sampleRate, profile) {
  return new Promise((resolve, reject) => {
    if (!window.Worker) {
      reject(new Error("此瀏覽器不支援背景音訊處理。"));
      return;
    }
    const worker = new Worker(new URL("./audio-transform-worker.js", import.meta.url), { type: "module" });
    const timeout = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("聲音轉換逾時，請縮短錄音後重試。"));
    }, 45000);

    worker.addEventListener("message", (event) => {
      window.clearTimeout(timeout);
      worker.terminate();
      if (!event.data?.ok) {
        reject(new Error(event.data?.error || "聲音轉換失敗。"));
        return;
      }
      resolve(new Blob([event.data.wavBuffer], { type: "audio/wav" }));
    }, { once: true });
    worker.addEventListener("error", () => {
      window.clearTimeout(timeout);
      worker.terminate();
      reject(new Error("聲音轉換程序無法啟動。"));
    }, { once: true });
    worker.postMessage({ samplesBuffer: samples.buffer, sampleRate, profile }, [samples.buffer]);
  });
}

export async function transformRecording(rawBlob, profile) {
  if (!(rawBlob instanceof Blob) || rawBlob.size === 0) throw new Error("錄音內容為空白，請重新錄製。");
  if (!profile || profile.version !== "2.0.0") throw new Error("聲音轉換設定版本不正確。");

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("此瀏覽器不支援裝置內音訊解碼。");
  const decodeContext = new AudioContextClass();
  let decoded;
  try {
    decoded = await decodeContext.decodeAudioData(await rawBlob.arrayBuffer());
  } catch {
    throw new Error("無法解碼錄音，請重新錄製。");
  } finally {
    await decodeContext.close();
  }

  const mono = downmixToMono(decoded);
  return runTransformWorker(mono, decoded.sampleRate, profile);
}
