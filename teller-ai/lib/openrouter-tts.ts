const OPENROUTER_TTS_URL = "https://openrouter.ai/api/v1/audio/speech";
const OPENROUTER_TTS_MODEL = "heygen/heygen-voice-1-turbo:free";
const OPENROUTER_TTS_TIMEOUT_MS = 60_000;
const PCM_SAMPLE_RATE = 44_100;

function pcmToWav(pcm: Buffer) {
  if (!pcm.length || pcm.length % 2 !== 0) {
    throw new Error("OpenRouter returned invalid PCM audio data.");
  }

  const wav = Buffer.alloc(44 + pcm.length);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(PCM_SAMPLE_RATE, 24);
  wav.writeUInt32LE(PCM_SAMPLE_RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, 44);
  return wav;
}

export async function synthesizeWithOpenRouter(
  text: string,
  apiKey: string,
  voiceReference: Buffer,
) {
  const response = await fetch(OPENROUTER_TTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "audio/pcm",
    },
    body: JSON.stringify({
      model: OPENROUTER_TTS_MODEL,
      input: text,
      input_references: [{
        type: "input_audio",
        input_audio: {
          data: `data:audio/wav;base64,${voiceReference.toString("base64")}`,
        },
      }],
      response_format: "pcm",
    }),
    signal: AbortSignal.timeout(OPENROUTER_TTS_TIMEOUT_MS),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    console.error("OpenRouter speech generation failed:", response.status, detail);
    if (response.status === 401 || response.status === 403) {
      throw new Error("OpenRouter denied the speech request. Verify OPENROUTER_API_KEY.");
    }
    if (response.status === 402) {
      throw new Error("OpenRouter requires available account credits for speech generation.");
    }
    if (response.status === 429) {
      throw new Error("OpenRouter speech rate limit reached. Try again later.");
    }
    if (response.status >= 500) {
      throw new Error(`OpenRouter speech generation is temporarily unavailable (HTTP ${response.status}).`);
    }
    throw new Error(
      `OpenRouter rejected the speech request (HTTP ${response.status})${detail ? `: ${detail}` : "."}`,
    );
  }

  const pcm = Buffer.from(await response.arrayBuffer());
  if (!pcm.length) throw new Error("OpenRouter returned no audio data.");
  return pcmToWav(pcm);
}
