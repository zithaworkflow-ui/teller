const FISH_AUDIO_API_BASE_URL = "https://api.fish.audio";
const FISH_AUDIO_TTS_MODEL = "s2.1-pro-free";
const FISH_AUDIO_TIMEOUT_MS = 60_000;

export function getFishAudioApiKey() {
  return process.env.FISH_API_KEY?.trim() || null;
}

export async function createFishVoiceModel(apiKey: string, audio: Buffer) {
  const formData = new FormData();
  formData.append("type", "tts");
  formData.append("title", "Teller Shared Voice");
  formData.append("train_mode", "fast");
  formData.append("visibility", "private");
  formData.append(
    "voices",
    new Blob([Uint8Array.from(audio)], { type: "audio/wav" }),
    "voice-sample.wav",
  );

  const response = await fetch(`${FISH_AUDIO_API_BASE_URL}/model`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
    signal: AbortSignal.timeout(FISH_AUDIO_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Fish Audio voice model creation failed (HTTP ${response.status}).`);
  }

  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new Error("Fish Audio returned an invalid voice model response.");
  }
  if (
    typeof result !== "object" ||
    result === null ||
    !("_id" in result) ||
    typeof result._id !== "string" ||
    !result._id
  ) {
    throw new Error("Fish Audio returned a voice model without an ID.");
  }

  return result._id;
}

export async function synthesizeFishSpeech(
  apiKey: string,
  referenceId: string,
  text: string,
) {
  const response = await fetch(`${FISH_AUDIO_API_BASE_URL}/v1/tts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      model: FISH_AUDIO_TTS_MODEL,
    },
    body: JSON.stringify({
      text,
      reference_id: referenceId,
      format: "wav",
    }),
    signal: AbortSignal.timeout(FISH_AUDIO_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Fish Audio speech generation failed (HTTP ${response.status}).`);
  }

  return Buffer.from(await response.arrayBuffer());
}
