const VOICE_SAMPLE_RATE = 22_050;
const MAX_VOICE_SAMPLE_SECONDS = 10;
const MIN_VOICE_SAMPLE_SECONDS = 3;

export async function prepareVoicePrompt(file: File): Promise<Blob> {
  const decodingContext = new AudioContext();
  try {
    const sourceBytes = await file.arrayBuffer();
    const decodedAudio = await decodingContext.decodeAudioData(sourceBytes);
    if (decodedAudio.duration < MIN_VOICE_SAMPLE_SECONDS) {
      throw new Error("Choose a recording that is at least 3 seconds long.");
    }

    const duration = Math.min(decodedAudio.duration, MAX_VOICE_SAMPLE_SECONDS);
    const frameCount = Math.floor(duration * VOICE_SAMPLE_RATE);
    const renderContext = new OfflineAudioContext(1, frameCount, VOICE_SAMPLE_RATE);
    const source = renderContext.createBufferSource();
    source.buffer = decodedAudio;
    source.connect(renderContext.destination);
    source.start(0, 0, duration);

    const monoAudio = await renderContext.startRendering();
    const samples = monoAudio.getChannelData(0);
    const wav = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(wav);
    const writeText = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };

    writeText(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    writeText(8, "WAVE");
    writeText(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, VOICE_SAMPLE_RATE, true);
    view.setUint32(28, VOICE_SAMPLE_RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeText(36, "data");
    view.setUint32(40, samples.length * 2, true);

    for (let index = 0; index < samples.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, samples[index]));
      view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }

    return new Blob([wav], { type: "audio/wav" });
  } finally {
    await decodingContext.close();
  }
}