const FISH_TTS_URL = "https://api.fish.audio/v1/tts";
const FISH_TTS_MODEL = "s2.1-pro-free";
const FISH_TTS_TIMEOUT_MS = 60_000;

export async function synthesizeWithFishAudio(text: string, apiKey: string) {
  const response = await fetch(FISH_TTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      model: FISH_TTS_MODEL,
    },
    body: JSON.stringify({ text, format: "mp3" }),
    signal: AbortSignal.timeout(FISH_TTS_TIMEOUT_MS),
  });

  if (!response.ok) {
    console.error("Fish Audio speech generation failed:", response.status);
    if (response.status === 401) {
      throw new Error("Fish Audio rejected the API key. Verify FISH_API_KEY.");
    }
    if (response.status === 402) {
      throw new Error("Fish Audio requires API credit for the configured model.");
    }
    if (response.status === 429) {
      throw new Error("Fish Audio rate limit reached. Try again later.");
    }
    if (response.status >= 500) {
      throw new Error(`Fish Audio is temporarily unavailable (HTTP ${response.status}).`);
    }
    throw new Error(`Fish Audio rejected the speech request (HTTP ${response.status}).`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length) throw new Error("Fish Audio returned no audio data.");
  return audio;
}