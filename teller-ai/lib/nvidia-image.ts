import { getNvidiaAIConfig } from "@/lib/nvidia-ai";
import { formatUserMemoryPrompt } from "@/lib/user-memory";
import { THINK_MODE_SYSTEM_PROMPT } from "@/lib/ai";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

type NvidiaImageContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type NvidiaImageMessage = {
  role: "system" | "user";
  content: string | NvidiaImageContentPart[];
};

function parseChatCompletionResponse(value: unknown): ChatCompletionResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const response = value as Record<string, unknown>;
  const choices: NonNullable<ChatCompletionResponse["choices"]> = [];
  if (Array.isArray(response.choices)) {
    for (const choice of response.choices) {
      if (typeof choice !== "object" || choice === null || Array.isArray(choice)) continue;
      const message = (choice as Record<string, unknown>).message;
      if (typeof message !== "object" || message === null || Array.isArray(message)) continue;

      const content = (message as Record<string, unknown>).content;
      if (typeof content === "string") {
        choices.push({ message: { content } });
      } else if (Array.isArray(content)) {
        const textParts: Array<{ text?: string }> = [];
        for (const part of content) {
          if (typeof part !== "object" || part === null || Array.isArray(part)) continue;
          const text = (part as Record<string, unknown>).text;
          if (typeof text === "string") textParts.push({ text });
        }
        choices.push({ message: { content: textParts } });
      }
    }
  }

  let error: ChatCompletionResponse["error"];
  if (typeof response.error === "object" && response.error !== null && !Array.isArray(response.error)) {
    const providerError = response.error as Record<string, unknown>;
    error = typeof providerError.message === "string" ? { message: providerError.message } : undefined;
  }

  return { choices: Array.isArray(response.choices) ? choices : undefined, error };
}

async function requestNvidiaImageAnalysis(
  messages: NvidiaImageMessage[],
  maxTokens: number,
  signal?: AbortSignal,
) {
  const { apiKey, apiBaseUrl, model } = getNvidiaAIConfig();
  const response = await fetch(apiBaseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(120_000)])
      : AbortSignal.timeout(120_000),
  });

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    throw new Error("NVIDIA returned an invalid image-analysis response.");
  }
  const result = parseChatCompletionResponse(responseBody);

  if (!response.ok) {
    throw new Error(result.error?.message || `NVIDIA image analysis failed (${response.status}).`);
  }

  const content = result.choices?.[0]?.message?.content;
  const answer = typeof content === "string"
    ? content.trim()
    : Array.isArray(content)
      ? content.map((part) => part.text || "").join("").trim()
      : "";
  if (!answer) {
    throw new Error("NVIDIA returned no image-analysis answer.");
  }

  return answer;
}

export async function analyzeImageWithNvidia(
  prompt: string,
  imageDataUrl: string,
  country?: string,
  userMemory: string[] = [],
  thinkMode = false,
  signal?: AbortSignal,
  thinkOutputTokenLimit = thinkMode ? 4096 : 2048,
) {
  const userMemoryPrompt = formatUserMemoryPrompt(userMemory);

  return requestNvidiaImageAnalysis([
    {
      role: "system",
      content: [
        "You are Teller AI. Answer the user's request about the attached image accurately. Describe visible details and distinguish observations from inferences.",
        thinkMode ? THINK_MODE_SYSTEM_PROMPT : "",
        country
          ? `The authenticated user's country is ${country}. Use this context when relevant.`
          : "",
        userMemoryPrompt,
      ].filter(Boolean).join("\n\n"),
    },
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ],
    },
  ], thinkMode ? thinkOutputTokenLimit : 2048, signal);
}
