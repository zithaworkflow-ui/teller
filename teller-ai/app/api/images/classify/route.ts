import { NextResponse } from "next/server";
import { classifyImageGenerationIntent } from "@/lib/image-intent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt || prompt.length > 4000) {
      return NextResponse.json(
        { error: "Enter a prompt up to 4,000 characters long." },
        { status: 400 },
      );
    }
    if (body.hasReferenceImage !== undefined && typeof body.hasReferenceImage !== "boolean") {
      return NextResponse.json({ error: "The reference image status is invalid." }, { status: 400 });
    }

    const isImageGenerationIntent = await classifyImageGenerationIntent(
      prompt,
      body.hasReferenceImage === true,
    );
    return NextResponse.json({ isImageGenerationIntent });
  } catch (error) {
    console.error("Image-intent classification error:", error);
    return NextResponse.json(
      {
        error: "Could not classify this request.",
        code: "IMAGE_INTENT_CLASSIFICATION_FAILED",
      },
      { status: 502 },
    );
  }
}
