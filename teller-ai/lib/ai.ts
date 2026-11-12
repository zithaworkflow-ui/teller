import { callRoutedChatCompletion } from "@/lib/ai-router";

export const TELLER_AI_SYSTEM_PROMPT = `
You are Teller AI, a powerful conversational AI assistant.

You help users with questions, research, writing, business tasks, coding, summaries, planning, productivity, and creative ideas.
Users can also ask to generate or edit images. Image generation runs as a separate image workflow in the app; when users refer to a generated image, the app provides its visual context for questions or edits. Answer image-related follow-up questions using the available conversation and image context, and do not claim an image was generated or edited unless the app confirms that result.
Treat visual details of an image included in prior messages as internal context. Do not repeat the caption or its label unless the user asks for it. If the user is only thanking you, respond briefly and naturally; do not add unsolicited image-edit suggestions.

Your personality is smart, clear, friendly, and useful. You give practical answers that are easy to understand. You can be professional for business topics and casual when the user is casual.

You should:
- Answer clearly and directly
- Help with writing, research, business, coding, and summaries
- Ask follow-up questions if the user request is unclear
- Be honest when you do not know something
- Avoid making up facts
- Keep responses organized
- Never claim to be human
- Do not provide unsafe, illegal, or harmful instructions

Format replies for readability:
- Use short paragraphs and blank lines between distinct ideas
- Use Markdown headings (##) for longer answers with clear sections
- Use bullet lists for options, features, or grouped points
- Use numbered lists for steps, procedures, or rankings
- Use **bold** for important terms and *italics* sparingly for emphasis
- Use inline code for commands, filenames, variables, and short technical values
- Use LaTeX math formatting for equations, formulas, and scientific notation when relevant, such as $E = mc^2$, $\alpha = \frac{\Delta v}{\Delta t}$, or $1.5 \times 10^6$
- Use display math in $$...$$ or \[ ... \] blocks for multi-line equations, integrals, sums, and scientific derivations
- For matrices and piecewise functions, use LaTeX environments like \begin{pmatrix} ... \end{pmatrix}, \begin{bmatrix} ... \end{bmatrix}, and \begin{cases} ... \end{cases}
- Use \frac, \sqrt, \sum, \prod, \int, and other standard LaTeX commands for scientific writing
- Put code in fenced Markdown blocks with a language name when applicable
- Do not use Markdown tables, HTML, or decorative symbols unless the user asks
- Match the amount of structure to the question; keep simple answers concise
`;

const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 12_000;
const MAX_TOTAL_MESSAGE_CHARS = 90_000;
const MAX_ALLOWED_OUTPUT_TOKENS = 2_048;

export type TellerToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type TellerAIMessage = {
  content?: string | null;
  tool_calls?: TellerToolCall[];
};

function getMaxTokens(requestedTokens?: number) {
  const configuredTokens = Number.parseInt(process.env.AI_MAX_TOKENS || "2048", 10);
  const defaultTokens = Number.isFinite(configuredTokens) ? configuredTokens : 2048;
  const tokens = requestedTokens ?? defaultTokens;
  return Math.min(MAX_ALLOWED_OUTPUT_TOKENS, Math.max(16, tokens));
}

export function getAffordableOutputTokens(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (!/"code"\s*:\s*402/.test(message)) return null;
  const match = message.match(/can only afford\s+(\d+)/i);
  const affordableTokens = match ? Number(match[1]) : 0;
  return Number.isInteger(affordableTokens) && affordableTokens > 0
    ? affordableTokens
    : null;
}

export function isPromptTokenLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /prompt tokens limit exceeded:\s*\d+\s*>\s*\d+/i.test(message);
}

function prepareMessages(
  messages: Array<{ role: string; content?: string | null; [key: string]: unknown }>,
  compact = false,
) {
  const recentMessages = messages
    .filter((message) => message && (
      typeof message.content === "string" ||
      (message.role === "assistant" && Array.isArray(message.tool_calls))
    ))
    .slice(-MAX_MESSAGES)
    .map((message) => ({
      ...message,
      role: message.role === "assistant" || message.role === "tool" ? message.role : "user",
      content: typeof message.content === "string"
        ? message.content.slice(0, MAX_MESSAGE_CHARS)
        : null,
    }));

  if (compact) {
    const latestUserMessage = recentMessages.findLast((message) => message.role === "user");
    return latestUserMessage ? [latestUserMessage] : recentMessages.slice(-1);
  }

  let totalChars = 0;
  const boundedMessages = [];
  for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
    const message = recentMessages[index];
    const messageLength = message.content?.length || 0;
    if (totalChars + messageLength > MAX_TOTAL_MESSAGE_CHARS) break;
    boundedMessages.unshift(message);
    totalChars += messageLength;
  }
  return boundedMessages;
}

async function callTellerAICompletion(
  messages: Array<{ role: string; content?: string | null; [key: string]: unknown }>,
  options?: {
    maxTokens?: number;
    country?: string;
    compactPrompt?: boolean;
    systemPrompt?: string;
    tools?: unknown[];
  },
): Promise<TellerAIMessage> {
  const compactPrompt = options?.compactPrompt ?? false;
  const preparedMessages = prepareMessages(messages, compactPrompt);
  const data = await callRoutedChatCompletion<{
    choices?: { message?: TellerAIMessage }[];
  }>({
      max_tokens: getMaxTokens(options?.maxTokens),
      messages: [
        {
          role: "system",
          content: [
            compactPrompt
              ? "You are Teller AI, a helpful conversational assistant. Answer the latest user request clearly and concisely. Be honest, practical, and safe. Reply briefly and naturally to simple thanks; do not add unsolicited suggestions."
              : TELLER_AI_SYSTEM_PROMPT,
            options?.country
              ? compactPrompt
                ? `The user's country is ${options.country}; use it when relevant.`
                : `The authenticated user's country is ${options.country}. When a question depends on location, use this country's laws, services, currency, spelling, units, and local context. Do not force localization when it is irrelevant, and follow a different location if the user explicitly asks about one.`
              : "",
            options?.systemPrompt || "",
          ].filter(Boolean).join("\n\n"),
        },
        ...preparedMessages,
      ],
      ...(options?.tools ? { tools: options.tools, tool_choice: "auto" } : {}),
      temperature: 0.7,
  });

  const message = data.choices?.[0]?.message;
  if (!message) throw new Error("The AI service returned an empty response.");
  return message;
}

export async function callTellerAIWithTools(
  messages: Array<{ role: string; content?: string | null; [key: string]: unknown }>,
  tools: unknown[],
  options?: {
    maxTokens?: number;
    country?: string;
    compactPrompt?: boolean;
    systemPrompt?: string;
  },
) {
  return callTellerAICompletion(messages, { ...options, tools });
}

export async function callTellerAI(
  messages: Array<{ role: string; content: string }>,
  options?: {
    maxTokens?: number;
    country?: string;
    compactPrompt?: boolean;
    systemPrompt?: string;
  },
) {
  const message = await callTellerAICompletion(messages, options);
  return message.content || "Sorry, I could not generate a response.";
}
