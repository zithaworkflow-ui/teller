import { NextResponse } from "next/server";
import {
  generateImageWithCloudflare,
  isCloudflareImageGenerationConfigured,
} from "@/lib/cloudflare-image";
import { MAX_IMAGE_BYTES, parseImageDataUrl } from "@/lib/image-input";
import { getAuthenticatedUserId } from "@/lib/auth0-auth";
import {
  getCurrentUsageDate,
  getUserGeneratedImage,
  releaseUserDailyImageGeneration,
  reserveUserDailyImageGeneration,
  saveUserChatMedia,
  getUserAccountData,
} from "@/lib/postgres";
import { getPlanKey, plans } from "@/lib/plans";

export const runtime = "nodejs";

function getNextDailyReset() {
  const nextReset = new Date();
  nextReset.setUTCHours(24, 0, 0, 0);
  return nextReset.toISOString();
}

const resolutions = new Set([
  "1024x1024 ( 1:1 )",
  "1152x896 ( 9:7 )",
  "896x1152 ( 7:9 )",
  "1152x864 ( 4:3 )",
  "864x1152 ( 3:4 )",
  "1248x832 ( 3:2 )",
  "832x1248 ( 2:3 )",
  "1280x720 ( 16:9 )",
  "720x1280 ( 9:16 )",
]);

export async function POST(request: Request) {
  let imageReservation: { userId: string; usageDate: string } | null = null;
  try {
    const userId = await getAuthenticatedUserId(request);
    if (!userId) {
      return NextResponse.json({ error: "Log in to generate and save images." }, { status: 401 });
    }

    const body = await request.json();
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const resolution = typeof body.resolution === "string" ? body.resolution : "";
    const referenceImage = body.referenceImage;
    const referenceImageStoragePath = body.referenceImageStoragePath;

    if (!prompt || prompt.length > 1500) {
      return NextResponse.json(
        { error: "Enter a prompt up to 1,500 characters long." },
        { status: 400 },
      );
    }
    if (resolution && !resolutions.has(resolution)) {
      return NextResponse.json({ error: "Choose a supported image size." }, { status: 400 });
    }
    if (referenceImage !== undefined && typeof referenceImage !== "string") {
      return NextResponse.json({ error: "The reference image is invalid." }, { status: 400 });
    }
    if (referenceImageStoragePath !== undefined && typeof referenceImageStoragePath !== "string") {
      return NextResponse.json({ error: "The reference image is invalid." }, { status: 400 });
    }
    if (referenceImage && referenceImageStoragePath) {
      return NextResponse.json({ error: "Choose one reference image." }, { status: 400 });
    }
    const parsedReference = referenceImage ? parseImageDataUrl(referenceImage) : null;
    if (referenceImage && !parsedReference) {
      const encodedImage = referenceImage.match(/^data:image\/[^;,]+;base64,([\s\S]*)$/i);
      if (encodedImage && encodedImage[1].length > (MAX_IMAGE_BYTES * 4) / 3) {
        return NextResponse.json(
          { error: "Keep reference images under 3 MB." },
          { status: 413 },
        );
      }
      return NextResponse.json(
        { error: "Upload a JPEG, PNG, or WebP image under 3 MB." },
        { status: 400 },
      );
    }
    let storedReference: { bytes: Buffer; mediaType: string } | undefined;
    if (referenceImageStoragePath) {
      const mediaId = referenceImageStoragePath.match(/^postgres:([0-9a-f-]{36})$/i)?.[1];
      if (!mediaId) {
        return NextResponse.json({ error: "The reference image is invalid." }, { status: 400 });
      }
      const media = await getUserGeneratedImage(userId, mediaId);
      if (!media) {
        return NextResponse.json({ error: "The generated reference image could not be found." }, { status: 404 });
      }
      if (!/^image\/(?:jpeg|png|webp)$/i.test(media.contentType)) {
        return NextResponse.json({ error: "The generated reference image format is not supported." }, { status: 400 });
      }
      storedReference = { bytes: media.mediaData, mediaType: media.contentType };
    }
    if (!isCloudflareImageGenerationConfigured()) {
      return NextResponse.json(
        { error: "Image generation is not configured on the server." },
        { status: 503 },
      );
    }

    const account = await getUserAccountData(userId);
    const planKey = getPlanKey(account.planKey) || "free";
    const plan = plans[planKey];
    const usageDate = getCurrentUsageDate();
    const imageGenerationCount = await reserveUserDailyImageGeneration(
      userId,
      plan.imageGenerationLimit,
      usageDate,
    );
    if (imageGenerationCount === null) {
      const upgradeText = planKey === "free"
        ? " Upgrade to Pro for 25 images per day."
        : planKey === "pro-monthly" || planKey === "pro-yearly"
          ? " Business includes 30 images per day."
          : "";
      return NextResponse.json(
        {
          error: `You’ve reached your ${plan.name} plan limit of ${plan.imageGenerationLimit} images for today. Please try again tomorrow.${upgradeText}`,
          code: "DAILY_IMAGE_LIMIT_REACHED",
          plan: plan.name,
          imageGenerationLimit: plan.imageGenerationLimit,
          imageGenerationCount: plan.imageGenerationLimit,
          resetsAt: getNextDailyReset(),
        },
        { status: 429 },
      );
    }
    imageReservation = { userId, usageDate };

    const image = await generateImageWithCloudflare(
      prompt,
      resolution,
      parsedReference
        ? { bytes: parsedReference.bytes, mediaType: parsedReference.mediaType }
        : storedReference,
    );
    const dataUrl = image.imageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
    if (!dataUrl) {
      throw new Error("The image provider returned an image format that cannot be stored.");
    }

    const imageBytes = Buffer.from(dataUrl[2], "base64");
    const mediaId = await saveUserChatMedia(
      userId,
      typeof body.historyId === "string" ? body.historyId.slice(0, 100) : "generated",
      "generated-image",
      dataUrl[1],
      imageBytes,
    );
    imageReservation = null;
    return NextResponse.json({
      imageUrl: `data:${dataUrl[1]};base64,${imageBytes.toString("base64")}`,
      imageStoragePath: `postgres:${mediaId}`,
      prompt: image.prompt,
      imageDescription: image.prompt.slice(0, 600),
      imageGenerationCount,
      imageGenerationLimit: plan.imageGenerationLimit,
    });
  } catch (error) {
    console.error("Image generation API error:", error);
    if (imageReservation) {
      try {
        await releaseUserDailyImageGeneration(imageReservation.userId, imageReservation.usageDate);
      } catch (releaseError) {
        console.error("Could not release failed image generation reservation:", releaseError);
      }
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image generation failed." },
      { status: 502 },
    );
  }
}