import { NextResponse } from "next/server";
import { callTellerAI } from "@/lib/ai";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Messages are required." }, { status: 400 });
    }

    const recentMessages = (messages as unknown[])
      .filter((message): message is { role: "user" | "assistant"; content: string } => (
        typeof message === "object" &&
        message !== null &&
        ("role" in message) &&
        (message.role === "user" || message.role === "assistant") &&
        ("content" in message) &&
        typeof message.content === "string"
      ))
      .map((message) => ({
        role: message.role,
        content: message.content.slice(0, 4000),
      }))
      .slice(-12);

    if (!recentMessages.length) {
      return NextResponse.json({ error: "Messages are required." }, { status: 400 });
    }

    const titlePrompt =
      "Create the best short title for this conversation. " +
      "Identify the user's primary task or topic, prioritizing the latest exchange while preserving the main theme of the conversation. " +
      "Use 2 to 6 words. Prefer a natural noun phrase or action phrase that is specific and descriptive. " +
      "Use title case. Do not add a period or other ending punctuation, labels, brackets, numbering, quotation marks, explanations, or generic text such as \"New chat\" or \"Conversation\". " +
      "Return only the title.";

    const titleResult = await callTellerAI(
      [...recentMessages, { role: "user", content: titlePrompt }],
      {
        maxTokens: 256,
        compactPrompt: true,
        systemPrompt:
          "You are a precise conversation-title generator. Use the full exchange to infer the user's central intent, topic, and desired outcome. " +
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

    const firstUserMessage = recentMessages.find((message) => message.role === "user")?.content || "";
    const fallback = firstUserMessage
      .replace(/\s+/g, " ")
      .split(" ")
      .slice(0, 6)
      .join(" ")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .slice(0, 60);

    return NextResponse.json({
      title: title && !/^sorry\b/i.test(title) ? title : fallback || "Conversation",
    });
  } catch (error) {
    console.error("Title API error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
