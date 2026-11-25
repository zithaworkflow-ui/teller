import sharp from "sharp";

const FLUX_IMAGE_GENERATION_MODEL = "@cf/black-forest-labs/flux-2-klein-4b";

function normalizePrompt(prompt: string) {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  const normalized = trimmed.replace(
    /^(?:please\s+)?(?:make|create|generate|draw|design)\s+(?:me\s+)?(?:a\s+)?(?:pic|pict(?:ure)?|image|photo|snap)\s+(?:of|showing|with)\s+/i,
    "",
  );

  return normalized === trimmed ? trimmed : `Create an image of ${normalized}`;
}

function getImageDimensions(resolution: string) {
  if (!resolution) return { width: 1024, height: 1024 };

  const match = resolution.match(/^(\d+)x(\d+)/);
  if (!match) {
    throw new Error("Choose a supported image size.");
  }

  return { width: Number(match[1]), height: Number(match[2]) };
}

function getProviderError(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const response = value as Record<string, unknown>;
  if (Array.isArray(response.errors)) {
    for (const error of response.errors) {
      if (typeof error === "object" && error !== null && !Array.isArray(error)) {
        const message = (error as Record<string, unknown>).message;
        if (typeof message === "string" && message.trim()) return message;
      }
    }
  }
  if (typeof response.error === "string" && response.error.trim()) return response.error;
  if (typeof response.error === "object" && response.error !== null && !Array.isArray(response.error)) {
    const message = (response.error as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message;
  }

  return null;
}

function getImageBase64(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;

  const response = value as Record<string, unknown>;
  if (typeof response.image === "string") return response.image;
  if (
    typeof response.result === "object" &&
    response.result !== null &&
    !Array.isArray(response.result)
  ) {
    const image = (response.result as Record<string, unknown>).image;
    if (typeof image === "string") return image;
  }

  return null;
}

function getImageMediaType(bytes: Buffer, contentType: string) {
  const mediaType = contentType.split(";")[0].trim().toLowerCase();
  if (/^image\/[a-zA-Z0-9.+-]+$/.test(mediaType)) return mediaType;

  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

export function isCloudflareImageGenerationConfigured() {
  return Boolean(
    process.env.CLOUDFLARE_ACCOUNT_ID?.trim() &&
    process.env.CLOUDFLARE_API_TOKEN?.trim(),
  );
}

export async function prepareImageForAnalysis(imageBytes: Buffer) {
  const resizedImage = await sharp(imageBytes)
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return `data:image/jpeg;base64,${resizedImage.toString("base64")}`;
}

export async function generateImageWithCloudflare(
  prompt: string,
  resolution: string,
  referenceImage?: { bytes: Buffer; mediaType: string },
) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !apiToken) {
    throw new Error("Image generation is not configured on the server.");
  }

  const { width, height } = getImageDimensions(resolution);
  const normalizedPrompt = normalizePrompt(prompt);
  const formData = new FormData();
  formData.set("prompt", normalizedPrompt);
  formData.set("width", String(width));
  formData.set("height", String(height));

  if (referenceImage) {
    const resizedImage = await sharp(referenceImage.bytes)
      .rotate()
      .resize({ width: 511, height: 511, fit: "inside", withoutEnlargement: true })
      .toBuffer();
    formData.set(
      "input_image_0",
      new Blob([new Uint8Array(resizedImage)], { type: referenceImage.mediaType }),
      "reference-image",
    );
  }

  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${FLUX_IMAGE_GENERATION_MODEL}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiToken}` },
      body: formData,
      signal: AbortSignal.timeout(120_000),
    },
  );

  const contentType = response.headers.get("content-type") || "";
  const responseBytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    let responseBody: unknown;
    try {
      responseBody = JSON.parse(responseBytes.toString("utf8"));
    } catch {
      responseBody = null;
    }
    throw new Error(
      getProviderError(responseBody) || `Cloudflare image request failed (${response.status}).`,
    );
  }

  const mediaType = getImageMediaType(responseBytes, contentType);
  if (mediaType) {
    return {
      imageUrl: `data:${mediaType};base64,${responseBytes.toString("base64")}`,
      prompt: normalizedPrompt,
    };
  }

  let responseBody: unknown;
  try {
    responseBody = JSON.parse(responseBytes.toString("utf8"));
  } catch {
    throw new Error("Cloudflare returned an invalid image response.");
  }

  const base64Image = getImageBase64(responseBody);
  if (!base64Image || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64Image)) {
    throw new Error(
      getProviderError(responseBody) || "Cloudflare returned no image data.",
    );
  }
  const imageBytes = Buffer.from(base64Image, "base64");
  if (!imageBytes.length || imageBytes.toString("base64") !== base64Image) {
    throw new Error("Cloudflare returned invalid image data.");
  }

  const base64MediaType = getImageMediaType(imageBytes, "");
  if (!base64MediaType) {
    throw new Error("Cloudflare returned an unsupported image format.");
  }

  return {
    imageUrl: `data:${base64MediaType};base64,${imageBytes.toString("base64")}`,
    prompt: normalizedPrompt,
  };
}
