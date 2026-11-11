export type ParsedWav = {
  formatChunk: Buffer;
  audioChunks: Buffer[];
  format: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
};

export function parseWav(bytes: Buffer): ParsedWav | null {
  if (
    bytes.length < 12 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WAVE"
  ) {
    return null;
  }

  let formatChunk: Buffer | null = null;
  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  const audioChunks: Buffer[] = [];

  for (let offset = 12; offset + 8 <= bytes.length;) {
    const chunkName = bytes.toString("ascii", offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;
    if (chunkEnd > bytes.length) return null;

    if (chunkName === "fmt " && chunkSize >= 16) {
      formatChunk = bytes.subarray(chunkStart, chunkEnd);
      format = bytes.readUInt16LE(chunkStart);
      channels = bytes.readUInt16LE(chunkStart + 2);
      sampleRate = bytes.readUInt32LE(chunkStart + 4);
      bitsPerSample = bytes.readUInt16LE(chunkStart + 14);
    } else if (chunkName === "data") {
      audioChunks.push(bytes.subarray(chunkStart, chunkEnd));
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (!formatChunk || !audioChunks.length) return null;
  return { formatChunk, audioChunks, format, channels, sampleRate, bitsPerSample };
}

export function validateReferenceWav(bytes: Buffer) {
  const wav = parseWav(bytes);
  if (
    !wav ||
    wav.format !== 1 ||
    wav.channels !== 1 ||
    wav.bitsPerSample !== 16 ||
    wav.sampleRate < 22_050
  ) {
    return null;
  }

  const dataLength = wav.audioChunks.reduce((length, chunk) => length + chunk.length, 0);
  const durationSeconds = dataLength / (wav.sampleRate * wav.channels * wav.bitsPerSample / 8);
  if (durationSeconds < 3 || durationSeconds > 10) return null;
  return wav;
}
