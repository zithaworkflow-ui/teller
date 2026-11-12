import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth0-auth";
import {
  createFishVoiceModel,
  getFishAudioApiKey,
  synthesizeFishSpeech,
} from "@/lib/fish-audio";
import { getSharedVoicePrompt, saveSharedVoicePrompt } from "@/lib/postgres";
import { formatTextForSpeech } from "@/lib/voice-format";

export const runtime = "nodejs";

const MAX_SPEECH_TEXT_LENGTH = 2500;

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Sign in to generate voice replies." }, { status: 401 });
    }

    const apiKey = getFishAudioApiKey();
    if (!apiKey) {
      return NextResponse.json({ error: "Fish Audio voice generation is not configured." }, { status: 503 });
    }

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

    const sharedVoice = await getSharedVoicePrompt();
    if (!sharedVoice?.mediaData.length) {
      return NextResponse.json(
        { error: "The shared voice sample has not been configured. Ask the voice-sample manager to upload one in Account Settings." },
        { status: 503 },
      );
    }

    let referenceId = sharedVoice.modelId;
    if (!referenceId) {
      referenceId = await createFishVoiceModel(apiKey, sharedVoice.mediaData);
      await saveSharedVoicePrompt(
        sharedVoice.fileName,
        sharedVoice.contentType,
        sharedVoice.mediaData,
        referenceId,
      );
    }

    const audio = await synthesizeFishSpeech(apiKey, referenceId, text);
    return new Response(new Blob([Uint8Array.from(audio)], { type: "audio/wav" }), {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Speech generation request failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Voice generation failed. Please try again." },
      { status: 502 },
    );
  }
}