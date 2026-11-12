import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth0-auth";
import { createFishVoiceModel, getFishAudioApiKey } from "@/lib/fish-audio";
import { saveSharedVoicePrompt } from "@/lib/postgres";
import { isVoicePromptManager } from "@/lib/voice-prompt-access";
import { validateReferenceWav } from "@/lib/voice-prompt";

export const runtime = "nodejs";

const MAX_REFERENCE_AUDIO_BYTES = 10 * 1024 * 1024;
const SIGN_IN_ERROR = "Sign in with the voice-sample manager account to upload a sample.";

export async function POST(request: Request) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sign in to upload a voice sample." }, { status: 401 });
  }
  if (!isVoicePromptManager(user.email, user.email_verified)) {
    return NextResponse.json({ error: SIGN_IN_ERROR }, { status: 403 });
  }
  const apiKey = getFishAudioApiKey();
  if (!apiKey) {
    return NextResponse.json({ error: "Fish Audio voice generation is not configured." }, { status: 503 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REFERENCE_AUDIO_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "The WAV sample must be no larger than 10 MB." }, { status: 413 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Choose a WAV voice sample to upload." }, { status: 400 });
  }

  const file = formData.get("voiceSample");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a WAV voice sample to upload." }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_REFERENCE_AUDIO_BYTES) {
    return NextResponse.json({ error: "The WAV sample must be greater than 0 bytes and no larger than 10 MB." }, { status: 413 });
  }

  let audio: Buffer;
  try {
    audio = Buffer.from(await file.arrayBuffer());
  } catch (error) {
    console.error("Could not read uploaded voice sample:", error);
    return NextResponse.json({ error: "Could not read the uploaded WAV sample." }, { status: 400 });
  }
  if (!validateReferenceWav(audio)) {
    return NextResponse.json(
      { error: "Use a 3–10 second, mono, 16-bit PCM WAV file at 22.05 kHz or higher." },
      { status: 400 },
    );
  }

  let modelId: string;
  try {
    modelId = await createFishVoiceModel(apiKey, audio);
  } catch (error) {
    console.error("Could not create Fish Audio voice model:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create the Fish Audio voice model." },
      { status: 502 },
    );
  }

  try {
    await saveSharedVoicePrompt("voice-prompt.wav", "audio/wav", audio, modelId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Could not save Fish Audio voice sample:", error);
    return NextResponse.json(
      { error: "Fish Audio created the voice model, but the voice sample could not be saved to PostgreSQL." },
      { status: 500 },
    );
  }
}
