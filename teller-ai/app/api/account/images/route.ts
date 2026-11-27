import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth0-auth";
import { getUserGeneratedImages } from "@/lib/postgres";

export const runtime = "nodejs";

const PAGE_SIZE = 8;

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const requestedOffset = Number(new URL(request.url).searchParams.get("offset") || 0);
  if (!Number.isSafeInteger(requestedOffset) || requestedOffset < 0) {
    return NextResponse.json({ error: "Invalid image history page." }, { status: 400 });
  }

  try {
    const images = await getUserGeneratedImages(userId, PAGE_SIZE + 1, requestedOffset);
    return NextResponse.json({
      images: images.slice(0, PAGE_SIZE),
      hasMore: images.length > PAGE_SIZE,
    });
  } catch (error) {
    console.error("Generated image history API error:", error);
    return NextResponse.json({ error: "Could not load generated image history." }, { status: 500 });
  }
}
