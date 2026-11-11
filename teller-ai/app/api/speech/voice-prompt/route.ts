import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth0-auth";
import { LOCAL_TEST_USER_ID } from "@/lib/local-test-auth";
import { saveUserVoicePrompt } from "@/lib/postgres";
import { validateReferenceWav } from "@/lib/voice-prompt";

export const runtime = "nodejs";

const MAX_REFERENCE_AUDIO_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Voice sample upload is available only in local development." }, { status: 404 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REFERENCE_AUDIO_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "The WAV sample must be no larger than 10 MB." }, { status: 413 });
  }

  const userId = await getAuthenticatedUserId(request);
  if (userId !== LOCAL_TEST_USER_ID) {
    return NextResponse.json({ error: "Only the local test account can upload a voice sample." }, { status: 403 });
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
    console.error("Could not read uploaded local test voice sample:", error);
    return NextResponse.json({ error: "Could not read the uploaded WAV sample." }, { status: 400 });
  }
  if (!validateReferenceWav(audio)) {
    return NextResponse.json(
      { error: "Use a 3–10 second, mono, 16-bit PCM WAV file at 22.05 kHz or higher." },
      { status: 400 },
    );
  }

  try {
    await saveUserVoicePrompt(userId, "voice-prompt.wav", "audio/wav", audio);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Could not save local test voice sample:", error);
    return NextResponse.json({ error: "Could not save the voice sample to PostgreSQL." }, { status: 500 });
  }
}
