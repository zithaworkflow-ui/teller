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
      "Understand the user's main intent and create a clear, specific conversation title. " +
      "Use no more than 6 words. Do not include punctuation at the end, labels, quotes, or generic text such as \"New chat\". " +
      "Return only the title.";

    const titleResult = await callTellerAI(
      [...recentMessages, { role: "user", content: titlePrompt }],
      {
        maxTokens: 256,
        compactPrompt: true,
        systemPrompt:
          "You generate concise titles for conversations. Infer the topic and goal from the exchange, not merely the first few words.",
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
