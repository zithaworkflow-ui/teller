import { NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/auth0-auth";
import {
  getUserChatData,
  getUserChatMedia,
  saveUserChatHistory,
  saveUserChatMedia,
} from "@/lib/postgres";

export const runtime = "nodejs";

type StoredFile = {
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
  storagePath?: string;
};

function sanitizeHistory(value: unknown[]) {
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .slice(0, 20)
    .map((item) => ({
      id: typeof item.id === "string" ? item.id.slice(0, 100) : crypto.randomUUID(),
      title: typeof item.title === "string" ? item.title.slice(0, 120) : "New chat",
      agent: item.agent === "cyber" || item.agent === "maps" ? item.agent : "teller",
      ...(typeof item.mapQuery === "string"
        ? { mapQuery: item.mapQuery.slice(0, 500) }
        : {}),
      updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : Date.now(),
      messages: Array.isArray(item.messages)
        ? item.messages
            .filter(
              (message): message is Record<string, unknown> =>
                Boolean(message) && typeof message === "object"
            )
            .slice(-30)
            .map((message) => {
              const file = message.file;
              const sanitizedFile =
                file && typeof file === "object"
                  ? (() => {
                      const fileRecord = file as Record<string, unknown>;
                      return {
                        name: typeof fileRecord.name === "string" ? fileRecord.name.slice(0, 200) : "attachment",
                        type: typeof fileRecord.type === "string" ? fileRecord.type.slice(0, 120) : "application/octet-stream",
                        size: typeof fileRecord.size === "number" ? fileRecord.size : 0,
                        ...(typeof fileRecord.dataUrl === "string" ? { dataUrl: fileRecord.dataUrl } : {}),
                        ...(typeof fileRecord.storagePath === "string" ? { storagePath: fileRecord.storagePath } : {}),
                      };
                    })()
                  : undefined;
              return {
                role: message.role === "user" ? "user" : "assistant",
                content: typeof message.content === "string" ? message.content.slice(0, 4000) : "",
                ...(Array.isArray(message.suggestions)
                  ? {
                      suggestions: message.suggestions
                        .filter((suggestion): suggestion is string => typeof suggestion === "string")
                        .slice(0, 3)
                        .map((suggestion) => suggestion.slice(0, 180)),
                    }
                  : {}),
                ...(typeof message.imageDescription === "string"
                  ? { imageDescription: message.imageDescription.slice(0, 600) }
                  : {}),
                ...(sanitizedFile ? { file: sanitizedFile } : {}),
                ...(typeof message.imageStoragePath === "string" && message.imageStoragePath.startsWith("postgres:")
                  ? { imageStoragePath: message.imageStoragePath.slice(0, 100) }
                  : typeof message.imageUrl === "string"
                    ? { imageUrl: message.imageUrl.slice(0, 2000) }
                    : {}),
              };
            })
        : [],
    }));
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?;base64,([\s\S]+)$/);
  if (!match) return null;
  return { contentType: match[1] || "application/octet-stream", buffer: Buffer.from(match[2], "base64") };
}

async function storeMedia(history: ReturnType<typeof sanitizeHistory>, userId: string) {
  return Promise.all(
    history.map(async (item) => ({
      ...item,
      messages: await Promise.all(
        item.messages.map(async (message) => {
          const file = message.file as StoredFile | undefined;
          if (!file) return message;
          if (file.storagePath?.startsWith("postgres:")) {
            return {
              ...message,
              file: {
                name: file.name,
                type: file.type,
                size: file.size,
                storagePath: file.storagePath,
              },
            };
          }
          if (!file.dataUrl) return message;
          const parsed = parseDataUrl(file.dataUrl);
          if (!parsed) return message;
          const contentType = file.type || parsed.contentType;
          const mediaId = await saveUserChatMedia(userId, item.id, file.name, contentType, parsed.buffer);
          return {
            ...message,
            file: {
              name: file.name,
              type: contentType,
              size: parsed.buffer.length,
              storagePath: `postgres:${mediaId}`,
            },
          };
        }),
      ),
    })),
  );
}

async function toClientHistory(history: ReturnType<typeof sanitizeHistory>, userId: string) {
  return Promise.all(
    history.map(async (item) => ({
      ...item,
      messages: await Promise.all(
        item.messages.map(async (message) => {
          const file = message.file as StoredFile | undefined;
          const imageStoragePath = "imageStoragePath" in message && typeof message.imageStoragePath === "string"
            ? message.imageStoragePath.slice("postgres:".length)
            : "";
          if (/^[0-9a-f-]{36}$/i.test(imageStoragePath)) {
            const media = await getUserChatMedia(userId, imageStoragePath);
            if (media) {
              message = {
                ...message,
                imageUrl: `data:${media.contentType};base64,${media.mediaData.toString("base64")}`,
              };
            }
          }
          const mediaId = file?.storagePath?.startsWith("postgres:")
            ? file.storagePath.slice("postgres:".length)
            : "";
          if (!file || !/^[0-9a-f-]{36}$/i.test(mediaId)) return message;
          const media = await getUserChatMedia(userId, mediaId);
          if (!media) return message;
          return {
            ...message,
            file: {
              name: media.fileName,
              type: media.contentType,
              size: media.fileSize,
              storagePath: file.storagePath,
              dataUrl: `data:${media.contentType};base64,${media.mediaData.toString("base64")}`,
            },
          };
        }),
      ),
    })),
  );
}

export async function GET(request: Request) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const chatData = await getUserChatData(userId);
    const history = chatData
      ? await toClientHistory(sanitizeHistory(chatData.history), userId)
      : [];
    return NextResponse.json({ history });
  } catch (error) {
    console.error("Account history API error:", error);
    return NextResponse.json({ error: "Could not load chat history." }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const userId = await getAuthenticatedUserId(request);
  if (!userId) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const body = await request.json();
    if (!Array.isArray(body.history)) {
      return NextResponse.json({ error: "Invalid chat history." }, { status: 400 });
    }

    const history = await storeMedia(sanitizeHistory(body.history), userId);
    await saveUserChatHistory(userId, history);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Account history API error:", error);
    return NextResponse.json({ error: "Could not save chat history." }, { status: 500 });
  }
}