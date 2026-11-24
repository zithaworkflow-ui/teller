import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth0-auth";
import { getNvidiaAIConfig } from "@/lib/nvidia-ai";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const TRANSCRIPTION_MAX_TOKENS = Number.parseInt(process.env.TRANSCRIPTION_MAX_TOKENS || "1024", 10);

function detectAudioFormat(audio: File, bytes: Buffer) {
  const mimeType = audio.type.split(";")[0].trim().toLowerCase();
  const filename = audio.name.toLowerCase();

  if (
    (bytes.length >= 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WAVE") ||
    ["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave", "audio/x-pn-wav"].includes(mimeType) ||
    filename.endsWith(".wav")
  ) {
    return "wav";
  }

  if (
    (bytes.length >= 3 && bytes.toString("ascii", 0, 3) === "ID3") ||
    (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) ||
    ["audio/mpeg", "audio/mp3", "audio/x-mpeg", "audio/x-mp3"].includes(mimeType) ||
    filename.endsWith(".mp3")
  ) {
    return "mp3";
  }

  return null;
}

export async function POST(request: Request) {
  if (!(await getAuthenticatedUserId(request))) {
    return NextResponse.json({ error: "Sign in to use voice input." }, { status: 401 });
  }

  if (!process.env.NVIDIA_API_KEY) {
    return NextResponse.json({ error: "Voice transcription is not configured." }, { status: 503 });
  }
  const nvidiaConfig = getNvidiaAIConfig();

  let audio: FormDataEntryValue | null;
  try {
    audio = (await request.formData()).get("audio");
  } catch {
    return NextResponse.json({ error: "The audio recording could not be read." }, { status: 400 });
  }

  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "Record a message before sending." }, { status: 400 });
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "The recording is too large. Keep it under 20 MB." }, { status: 413 });
  }

  let audioBytes: Buffer;
  try {
    audioBytes = Buffer.from(await audio.arrayBuffer());
  } catch (error) {
    console.error("Could not read transcription audio:", error);
    return NextResponse.json({ error: "The audio recording could not be read." }, { status: 400 });
  }

  const audioFormat = detectAudioFormat(audio, audioBytes);
  if (!audioFormat) {
    return NextResponse.json({ error: "NVIDIA transcription supports WAV and MP3 audio." }, { status: 415 });
  }

  try {
    const audioBase64 = audioBytes.toString("base64");
    const response = await fetch(nvidiaConfig.apiBaseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${nvidiaConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: nvidiaConfig.model,
        max_tokens: Number.isInteger(TRANSCRIPTION_MAX_TOKENS) && TRANSCRIPTION_MAX_TOKENS > 0
          ? TRANSCRIPTION_MAX_TOKENS
          : 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "audio_url",
                audio_url: { url: `data:audio/${audioFormat};base64,${audioBase64}` },
              },
              {
                type: "text",
                text: "Transcribe this speech into clean, readable text. Add punctuation, remove filler words and false starts, and return only the transcription.",
              },
            ],
          },
        ],
        temperature: 0.2,
        top_k: 1,
        chat_template_kwargs: { enable_thinking: false },
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      const providerError = typeof result.error?.message === "string" ? result.error.message : "";
      console.error("NVIDIA transcription error:", providerError || response.status);
      if (/more credits|can only afford/i.test(providerError)) {
        return NextResponse.json(
          { error: "NVIDIA could not process this recording. Try a shorter recording and try again." },
          { status: 402 },
        );
      }
      return NextResponse.json({ error: "Transcription failed. Please try again." }, { status: 502 });
    }

    const transcription = result.choices?.[0]?.message?.content;
    if (typeof transcription !== "string" || !transcription.trim()) {
      return NextResponse.json({ error: "No speech was detected. Try speaking again." }, { status: 422 });
    }
    if (/\bplease provide\b/i.test(transcription) && /\b(audio|recording|speech)\b/i.test(transcription)) {
      return NextResponse.json(
        { error: "The model did not detect the recording. Tap the microphone, speak, and stop the recording to try again." },
        { status: 422 },
      );
    }

    return NextResponse.json({ transcription: transcription.trim() });
  } catch (error) {
    console.error("Audio transcription request failed:", error);
    return NextResponse.json({ error: "Transcription failed. Please try again." }, { status: 502 });
  }
}