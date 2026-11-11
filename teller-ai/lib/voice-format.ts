export function getVoicePromptSampleRate(bytes: Buffer) {
  if (bytes.length < 44 || bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WAVE") {
    return null;
  }

  let audioFormat = 0;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let dataLength = 0;

  for (let offset = 12; offset + 8 <= bytes.length;) {
    const chunkName = bytes.toString("ascii", offset, offset + 4);
    const chunkSize = bytes.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkSize;
    if (chunkEnd > bytes.length) return null;

    if (chunkName === "fmt " && chunkSize >= 16) {
      audioFormat = bytes.readUInt16LE(chunkStart);
      channels = bytes.readUInt16LE(chunkStart + 2);
      sampleRate = bytes.readUInt32LE(chunkStart + 4);
      bitsPerSample = bytes.readUInt16LE(chunkStart + 14);
    } else if (chunkName === "data") {
      dataLength += chunkSize;
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  const durationSeconds = dataLength / (sampleRate * channels * bitsPerSample / 8);
  if (audioFormat !== 1 || channels !== 1 || bitsPerSample !== 16 ||
    sampleRate < 22_050 || durationSeconds < 3 || durationSeconds > 10) {
    return null;
  }
  return sampleRate;
}

export function formatTextForSpeech(content: string) {
  return content
    .replace(/```[\w+-]*\n?([\s\S]*?)```/g, " Code: $1 ")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s*/gm, "")
    .replace(/^\s*>+\s?/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, "")
    .replace(/\|/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]{1,3}/g, "")
    .replace(/(?:\$\$|\\\[|\\\]|\$)/g, "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([.!?])(?=\S)/g, "$1 ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function splitTextForSpeech(text: string, maxLength = 240) {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/);
    for (const word of words) {
      if (!word) continue;
      if (current && `${current} ${word}`.length > maxLength) {
        chunks.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current && /[.!?]$/.test(sentence.trim())) {
      chunks.push(current);
      current = "";
    }
  }

  if (current) chunks.push(current);
  return chunks;
}
