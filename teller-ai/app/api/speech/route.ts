import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth0-auth";
import { getNvidiaAIConfig } from "@/lib/nvidia-ai";
import { synthesizeWithFishAudio } from "@/lib/fish-audio";
import {
  getSharedFishReferenceId,
  getSharedVoicePrompt,
  seedSharedVoicePromptIfMissing,
} from "@/lib/postgres";
import { formatTextForSpeech, splitTextForSpeech } from "@/lib/voice-format";
import { parseWav, validateReferenceWav } from "@/lib/voice-prompt";

export const runtime = "nodejs";

const NVIDIA_TTS_DEFAULT_URL =
  "https://api.nvcf.nvidia.com/v2/nvcf/pexec/functions/55cf67bf-600f-4b04-8eac-12ed39537a08";
const MAX_SPEECH_TEXT_LENGTH = 2500;
const MAX_REFERENCE_AUDIO_BYTES = 10 * 1024 * 1024;
const SPEECH_TIMEOUT_MS = 60_000;

function combineWavAudio(wavFiles: Buffer[]) {
  const parsedFiles = wavFiles.map(parseWav);
  const first = parsedFiles[0];
  if (!first || first.format !== 1 || first.channels !== 1 || first.bitsPerSample !== 16) {
    throw new Error("NVIDIA returned an unsupported audio format.");
  }

  const audioChunks = parsedFiles.flatMap((wav) => {
    if (!wav || wav.format !== first.format || wav.channels !== first.channels ||
      wav.sampleRate !== first.sampleRate || wav.bitsPerSample !== first.bitsPerSample) {
      throw new Error("NVIDIA returned inconsistent audio formats.");
    }
    return wav.audioChunks;
  });
  const audioData = Buffer.concat(audioChunks);
  const formatHeader = Buffer.alloc(8);
  formatHeader.write("fmt ", 0, "ascii");
  formatHeader.writeUInt32LE(first.formatChunk.length, 4);
  const dataHeader = Buffer.alloc(8);
  dataHeader.write("data", 0, "ascii");
  dataHeader.writeUInt32LE(audioData.length, 4);
  const padding = first.formatChunk.length % 2 ? Buffer.from([0]) : Buffer.alloc(0);
  const riffBody = Buffer.concat([
    Buffer.from("WAVE", "ascii"),
    formatHeader,
    first.formatChunk,
    padding,
    dataHeader,
    audioData,
    audioData.length % 2 ? Buffer.from([0]) : Buffer.alloc(0),
  ]);
  const header = Buffer.alloc(8);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(riffBody.length, 4);
  return Buffer.concat([header, riffBody]);
}

async function loadSharedVoicePrompt(configuredPromptPath?: string) {
  const storedPrompt = await getSharedVoicePrompt();
  if (storedPrompt && storedPrompt.mediaData.length > 0) {
    return storedPrompt.mediaData;
  }

  if (!configuredPromptPath) return null;

  const promptAudio = await readFile(configuredPromptPath);
  if (!promptAudio.length) return null;

  await seedSharedVoicePromptIfMissing("voice-prompt.wav", "audio/wav", promptAudio);
  const savedPrompt = await getSharedVoicePrompt();
  return savedPrompt?.mediaData ?? promptAudio;
}

async function synthesizeSpeech(
  text: string,
  promptAudio: Buffer,
  promptSampleRate: number,
  apiKey: string,
  endpoint: string,
) {
  const formData = new FormData();
  formData.append("config", JSON.stringify({
    language_code: "en-US",
    encoding: "LINEAR_PCM",
    sample_rate_hz: 22_050,
    text,
    zero_shot_data: {
      quality: 20,
      sample_rate_hz: promptSampleRate,
      encoding: "LINEAR_PCM",
    },
  }));
  formData.append(
    "audio",
    new Blob([Uint8Array.from(promptAudio)], { type: "audio/wav" }),
    "voice-prompt.wav",
  );

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "audio/wav",
    },
    body: formData,
    signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
  });

  if (!response.ok) {
    console.error("NVIDIA speech generation failed:", response.status);
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `NVIDIA denied the speech request (HTTP ${response.status}). Verify NVIDIA_API_KEY and confirm it has access to the Magpie TTS Zero-Shot model.`,
      );
    }
    if (response.status === 404) {
      throw new Error(
        "NVIDIA could not find the TTS endpoint (HTTP 404). Verify NVIDIA_TTS_API_URL.",
      );
    }
    if (response.status === 429) {
      throw new Error("NVIDIA TTS rate limit reached. Try again later.");
    }
    if (response.status >= 500) {
      throw new Error(
        `NVIDIA TTS is temporarily unavailable (HTTP ${response.status}). Try again later.`,
      );
    }
    throw new Error(
      `NVIDIA rejected the speech request (HTTP ${response.status}). Check the TTS endpoint and voice sample format.`,
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    const body = await response.text();
    const chunks: Buffer[] = [];
    for (const line of body.split(/\r?\n/)) {
      if (!line.startsWith("data:")) continue;
      const eventData = line.slice(5).trim();
      if (!eventData || eventData === "[DONE]") continue;
      try {
        const event = JSON.parse(eventData);
        if (typeof event.audio === "string") chunks.push(Buffer.from(event.audio, "base64"));
      } catch {
        continue;
      }
    }
    if (!chunks.length) throw new Error("NVIDIA returned no audio data.");
    return Buffer.concat(chunks);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Sign in to generate voice replies." }, { status: 401 });
    }

    const nvidiaApiKey = process.env.NVIDIA_API_KEY || process.env.AI_API_KEY;
    const fishApiKey = process.env.FISH_API_KEY?.trim();
    if (!nvidiaApiKey && !fishApiKey) {
      return NextResponse.json(
        { error: "Configure NVIDIA_API_KEY or FISH_API_KEY to enable voice generation." },
        { status: 503 },
      );
    }

    const promptPath = process.env.NVIDIA_TTS_VOICE_PROMPT_PATH?.trim();

    let body: { text?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Provide text to speak." }, { status: 400 });
    }
    if (typeof body.text !== "string") {
      return NextResponse.json({ error: "Provide text to speak." }, { status: 400 });
    }

    const text = formatTextForSpeech(body.text);
    if (!text) {
      return NextResponse.json({ error: "There is no readable text in this reply." }, { status: 400 });
    }
    if (text.length > MAX_SPEECH_TEXT_LENGTH) {
      return NextResponse.json({ error: "This reply is too long to read aloud." }, { status: 413 });
    }

    let nvidiaFailureMessage = "NVIDIA voice generation is not configured.";
    let nvidiaFailureStatus = 503;
    if (nvidiaApiKey) {
      try {
        const promptAudio = await loadSharedVoicePrompt(promptPath);
        if (!promptAudio) {
          throw new Error(
            "The shared voice sample has not been configured. Ask the voice-sample manager to upload one in Account Settings or set NVIDIA_TTS_VOICE_PROMPT_PATH.",
          );
        }
        if (promptAudio.length > MAX_REFERENCE_AUDIO_BYTES) {
          throw new Error("The configured NVIDIA voice sample must be under 10 MB.");
        }
        const promptWav = validateReferenceWav(promptAudio);
        if (!promptWav) {
          throw new Error(
            "The NVIDIA voice sample must be 3–10 seconds, mono, 16-bit PCM WAV at 22.05 kHz or higher.",
          );
        }

        const config = getNvidiaAIConfig();
        const endpoint = process.env.NVIDIA_TTS_API_URL?.trim() || NVIDIA_TTS_DEFAULT_URL;
        const audioParts: Buffer[] = [];
        nvidiaFailureStatus = 502;
        for (const chunk of splitTextForSpeech(text)) {
          audioParts.push(await synthesizeSpeech(
            chunk,
            promptAudio,
            promptWav.sampleRate,
            config.apiKey,
            endpoint,
          ));
        }

        const audio = combineWavAudio(audioParts);
        return new Response(new Blob([Uint8Array.from(audio)], { type: "audio/wav" }), {
          headers: {
            "Content-Type": "audio/wav",
            "Cache-Control": "no-store",
          },
        });
      } catch (error) {
        nvidiaFailureMessage = error instanceof Error
          ? error.message
          : "NVIDIA voice generation failed.";
        console.error("NVIDIA speech generation failed; trying Fish Audio fallback:", error);
      }
    }

    if (!fishApiKey) {
      return NextResponse.json(
        { error: nvidiaFailureMessage },
        { status: nvidiaFailureStatus },
      );
    }

    try {
      const referenceId = await getSharedFishReferenceId();
      const audio = await synthesizeWithFishAudio(text, fishApiKey, referenceId);
      return new Response(new Blob([Uint8Array.from(audio)], { type: "audio/mpeg" }), {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "no-store",
        },
      });
    } catch (error) {
      console.error("Fish Audio fallback failed:", error);
      const fishFailureMessage = error instanceof Error
        ? error.message
        : "Fish Audio voice generation failed.";
      return NextResponse.json(
        { error: `${nvidiaFailureMessage} Fish Audio fallback failed: ${fishFailureMessage}` },
        { status: 502 },
      );
    }
  } catch (error) {
    console.error("Speech generation request failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Voice generation failed. Please try again." },
      { status: 502 },
    );
  }
}