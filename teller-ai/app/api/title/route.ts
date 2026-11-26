import { NextResponse } from "next/server";
import { callTellerAI } from "@/lib/ai";
import { NVIDIA_KIMI_K3_1_PRO_MODEL } from "@/lib/nvidia-ai";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Messages are required." }, { status: 400 });
    }

    const firstPrompts = (messages as unknown[])
      .filter((message): message is { role: "user" | "assistant"; content: string } => (
        typeof message === "object" &&
        message !== null &&
        ("role" in message) &&
        message.role === "user" &&
        ("content" in message) &&
        typeof message.content === "string"
      ))
      .map((message) => ({
        role: message.role,
        content: message.content.slice(0, 4000),
      }))
      .slice(0, 2);

    if (!firstPrompts.length) {
      return NextResponse.json({ error: "Messages are required." }, { status: 400 });
    }

    const titlePrompt =
      "Create a short title based only on the user's first two prompts below. " +
      "Identify their primary task or topic, combining the prompts when they relate and prioritizing the first prompt if they do not. " +
      "Use 2 to 6 words. Prefer a natural noun phrase or action phrase that is specific and descriptive. " +
      "Use title case. Do not add a period or other ending punctuation, labels, brackets, numbering, quotation marks, explanations, or generic text such as \"New chat\" or \"Conversation\". " +
      "Do not repeat any part of this instruction or discuss title generation. " +
      "Return only the title.";

    const titleResult = await callTellerAI(
      [...firstPrompts, { role: "user", content: titlePrompt }],
      {
        maxTokens: 256,
        compactPrompt: true,
        model: process.env.NVIDIA_TITLE_MODEL?.trim() || NVIDIA_KIMI_K3_1_PRO_MODEL,
        systemPrompt:
          "You are a precise conversation-title generator. Base the title only on the user's first two prompts. " +
          "Prefer specific entities and outcomes over vague summaries. " +
          "Never reproduce the user's wording verbatim unless it already is a clear, concise title. " +
          "Return exactly one title with no extra text.",
      },
    );

    const title = titleResult
      .split(/\r?\n/)[0]
      .replace(/^[\s"*'`–-]+|[\s"*'`.–-]+$/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 100)
      .trim();

    const fallback = firstPrompts
      .map((message) => message.content)
      .join(" ")
      .replace(/\s+/g, " ")
      .split(" ")
      .slice(0, 6)
      .join(" ")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .slice(0, 60);

    const metaTitlePattern =
      /^(?:title(?:\s+generation)?|conversation(?:\s+title)?|chat(?:\s+title)?|here(?:['’]s|\s+is)\s+(?:a\s+)?(?:title|conversation)|i(?:['’]d)?\s+(?:title|suggest)|generated?\s+title)\b/i;
    const safeTitle = title &&
      !/^sorry\b/i.test(title) &&
      !metaTitlePattern.test(title) &&
      !/\b(?:title generation instruction|title generation prompt)\b/i.test(title)
        ? title
        : "";

    return NextResponse.json({
      title: safeTitle || fallback || "Conversation",
    });
  } catch (error) {
    console.error("Title API error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
