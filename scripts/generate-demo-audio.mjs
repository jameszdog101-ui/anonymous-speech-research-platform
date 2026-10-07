import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const outputDirectory = fileURLToPath(new URL("../public/assets/", import.meta.url));
const sampleRate = 22050;

function createCueWav(frequencies) {
  const toneSeconds = 0.32;
  const gapSeconds = 0.12;
  const totalSeconds = frequencies.length * toneSeconds + (frequencies.length - 1) * gapSeconds;
  const frameCount = Math.ceil(totalSeconds * sampleRate);
  const dataSize = frameCount * 2;
  const output = Buffer.alloc(44 + dataSize);
  output.write("RIFF", 0);
  output.writeUInt32LE(36 + dataSize, 4);
  output.write("WAVEfmt ", 8);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write("data", 36);
  output.writeUInt32LE(dataSize, 40);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = frame / sampleRate;
    const segment = toneSeconds + gapSeconds;
    const toneIndex = Math.floor(time / segment);
    const timeInSegment = time - toneIndex * segment;
    let sample = 0;
    if (toneIndex < frequencies.length && timeInSegment < toneSeconds) {
      const edge = Math.min(timeInSegment / 0.02, (toneSeconds - timeInSegment) / 0.02, 1);
      sample = Math.sin(2 * Math.PI * frequencies[toneIndex] * timeInSegment) * 0.28 * Math.max(0, edge);
    }
    output.writeInt16LE(Math.round(sample * 32767), 44 + frame * 2);
  }
  return output;
}

await mkdir(outputDirectory, { recursive: true });
await writeFile(`${outputDirectory}/stimulus-01.wav`, createCueWav([523.25, 659.25]));
await writeFile(`${outputDirectory}/stimulus-02.wav`, createCueWav([659.25, 523.25, 440]));
console.log("Generated two demo cue WAV files in public/assets.");

