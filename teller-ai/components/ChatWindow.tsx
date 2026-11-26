"use client";

import { useAppAuth } from "@/components/Auth0Provider";
import PayPalUpgradeButton from "@/components/PayPalUpgradeButton";
import Image from "next/image";
import {
  ArrowUp,
  ArrowLeft,
  Camera,
  CalendarDays,
  Check,
  Download,
  Images,
  LoaderCircle,
  MapPinned,
  Mail,
  Mic,
  Pencil,
  Paperclip,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Sparkles,
  Sun,
  Moon,
  Monitor,
  Volume2,
  X,
} from "lucide-react";
import katex from "katex";
import "katex/dist/katex.min.css";
import metallicTEmblem from "../Futuristic Metallic T Emblem.png";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { encodeAudioChunksToWav } from "@/lib/recording-audio";
import { getExplicitMemoryRequest } from "@/lib/user-memory";
import { formatTextForSpeech, splitTextForSpeech } from "@/lib/voice-format";

type Message = {
  role: "user" | "assistant";
  content: string;
  choices?: string[];
  pendingAction?: CyberPendingAction;
  imageUrl?: string;
  imageStoragePath?: string;
  imageDescription?: string;
  imageSearchResults?: SearchedImageResult[];
  file?: {
    name: string;
    type: string;
    size: number;
    dataUrl: string;
    storagePath?: string;
  } | null;
};

type ChatResponsePayload = {
  reply?: string;
  usageCount?: number | null;
  choices?: unknown;
  imageSearchResults?: unknown;
  error?: string;
  memoryAction?: boolean;
};

type SearchedImageResult = {
  title: string;
  imageUrl: string;
  sourcePageUrl: string;
  width?: number;
  height?: number;
};

type AgentMode = "teller" | "cyber" | "maps";
type CyberPendingAction = {
  id: string;
  type: "gmail.create_draft" | "calendar.create_event";
  arguments: Record<string, unknown>;
};

type HistoryItem = {
  id: string;
  title: string;
  agent?: AgentMode;
  mapQuery?: string;
  messages: Message[];
  updatedAt: number;
};

type GoogleConnectionStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
};

const GOOGLE_MAPS_EMBED_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY || "";

type MapRequest = {
  origin: string | null;
  destination: string;
  mode: "driving" | "walking" | "bicycling" | "transit";
};

function parseMapRequest(query: string): MapRequest {
  const cleanedQuery = query.trim().slice(0, 500);
  const routeMatch = cleanedQuery.match(
    /\bfrom\s+(.+?)\s+to\s+(.+?)(?=\s+(?:via|using)\b|[?.!,;]|$)/i,
  ) || cleanedQuery.match(
    /\bdirections?\s+between\s+(.+?)\s+and\s+(.+?)(?=[?.!,;]|$)/i,
  );
  const modeMatch = cleanedQuery.match(/\b(driving|walking|bicycling|cycling|transit)\b/i);
  const mode = modeMatch?.[1].toLowerCase();
  const travelMode = mode === "walking"
    ? "walking"
    : mode === "bicycling" || mode === "cycling"
      ? "bicycling"
      : mode === "transit"
        ? "transit"
        : "driving";

  if (routeMatch) {
    return {
      origin: routeMatch[1].trim().slice(0, 200),
      destination: routeMatch[2].trim().slice(0, 200),
      mode: travelMode,
    };
  }

  const destinationMatch = cleanedQuery.match(/\b(?:map|show|find|search|locate|where(?:\s+is)?)\s+(.+?)(?=[?.!,;]|$)/i);
  return {
    origin: null,
    destination: (destinationMatch?.[1] || cleanedQuery).trim().slice(0, 200),
    mode: travelMode,
  };
}

function getMapEmbedUrl(query: string, apiKey: string) {
  const mapRequest = parseMapRequest(query);
  const mapUrl = new URL(
    `https://www.google.com/maps/embed/v1/${mapRequest.origin ? "directions" : "search"}`,
  );
  mapUrl.searchParams.set("key", apiKey);
  if (mapRequest.origin) {
    mapUrl.searchParams.set("origin", mapRequest.origin);
    mapUrl.searchParams.set("destination", mapRequest.destination);
    mapUrl.searchParams.set("mode", mapRequest.mode);
  } else {
    mapUrl.searchParams.set("q", mapRequest.destination);
  }
  return mapUrl.toString();
}

function getGoogleMapsLink(query: string) {
  const mapRequest = parseMapRequest(query);
  const mapUrl = new URL("https://www.google.com/maps/dir/");
  if (mapRequest.origin) {
    mapUrl.searchParams.set("api", "1");
    mapUrl.searchParams.set("origin", mapRequest.origin);
    mapUrl.searchParams.set("destination", mapRequest.destination);
    mapUrl.searchParams.set("travelmode", mapRequest.mode);
  } else {
    mapUrl.pathname = "/maps/search/";
    mapUrl.searchParams.set("api", "1");
    mapUrl.searchParams.set("query", mapRequest.destination);
  }
  return mapUrl.toString();
}

type GeneratedImage = {
  id: string;
  historyId: string;
  createdAt: string;
  imageUrl: string;
};

type Theme = "auto" | "dark" | "light";
type VoiceReplySegment = { text: string; duration: number };
function getTellerGreeting() {
  return "Hello! What can I do for you today?";
}

type SpeechRecognitionResultLike = { 0: { transcript: string } };
type SpeechRecognitionEventLike = { results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "The request failed.";
}

function getVoiceReplySegments(content: string, durations: number[]): VoiceReplySegment[] {
  const chunks = splitTextForSpeech(formatTextForSpeech(content));
  if (!chunks.length) return [];

  const chunkDurations = durations.length === chunks.length
    ? durations
    : (() => {
        const totalDuration = durations.reduce((total, duration) => total + duration, 0) || chunks.length;
        const totalLength = chunks.reduce((total, chunk) => total + chunk.length, 0);
        return chunks.map((chunk) => totalDuration * chunk.length / totalLength);
      })();

  return chunks.map((text, index) => ({ text, duration: chunkDurations[index] }));
}

function getCurrentVoiceReplySegment(audio: HTMLAudioElement, segments: VoiceReplySegment[]) {
  let elapsed = 0;
  for (const segment of segments) {
    elapsed += segment.duration;
    if (audio.currentTime < elapsed) return segment.text;
  }
  return segments[segments.length - 1]?.text || "";
}

function getVoiceContent(message: Message) {
  return message.imageUrl && message.imageDescription
    ? message.imageDescription
    : message.content;
}

function getModeGreeting(agent: AgentMode) {
  if (agent === "cyber") {
    return "Hi, I’m CyberMail. Connect your Google account to search and summarize Gmail, review your calendar, create email drafts, and propose calendar events. I’ll ask before creating drafts or events.";
  }
  if (agent === "maps") {
    return "Hi, I’m CyberMaps. Ask me to find a place or get directions, for example “directions from Cape Town Station to Table Mountain by transit.” The live map will update alongside our chat.";
  }
  return getTellerGreeting();
}

const IMAGE_ARTIFACT_PATTERN = /\b(?:pic|picture|image|photo|photograph|artwork|illustration|drawing|painting|logo|icon|avatar|poster|banner|wallpaper|diagram|graphic|thumbnail|cover art)\b/i;

function isImageGenerationPrompt(prompt: string) {
  const generationIntent = /\b(?:make|create|generate|draw|design|show|produce|render|paint|illustrate|want|need)\b/i;
  const asksToDrawSubject = /\b(?:draw|paint|illustrate)\s+(?:me\s+)?(?:a|an)\s+\w+/i.test(prompt);
  return (IMAGE_ARTIFACT_PATTERN.test(prompt) || asksToDrawSubject) && generationIntent.test(prompt);
}

function isExplicitImageGenerationRequest(prompt: string) {
  const asksForPrompt = /\b(?:write|draft|compose|improve|refine|suggest)\b[\s\S]{0,60}\bprompt\b/i.test(prompt) ||
    /\b(?:create|generate|design|make)\s+(?:me\s+)?(?:an?\s+)?(?:image\s+)?prompt\b/i.test(prompt);
  const asksHowTo = /\b(?:how to|how do i|how can i)\b/i.test(prompt);
  const generationAction = /\b(?:create|generate|draw|design|make|produce|render|paint|illustrate)\b/i;
  const asksToDrawSubject = /\b(?:draw|paint|illustrate)\s+(?:me\s+)?(?:a|an)\s+\w+/i.test(prompt);
  const requestsVisual = /\b(?:i want|i need|i would like|i'd like)\b[\s\S]{0,50}\b(?:image|picture|photo|photograph|artwork|illustration|drawing|painting|logo|icon|avatar|poster|banner|wallpaper|diagram|graphic|thumbnail|cover art)\b/i.test(prompt) ||
    /\b(?:show|give)\s+me\b[\s\S]{0,35}\b(?:image|picture|photo|photograph|artwork|illustration|drawing|painting)\b[\s\S]{0,30}\bof\b/i.test(prompt);
  return !asksForPrompt &&
    !asksHowTo &&
    ((generationAction.test(prompt) && IMAGE_ARTIFACT_PATTERN.test(prompt)) ||
      asksToDrawSubject ||
      requestsVisual);
}

function extractVisualDetails(content: string) {
  const marker = /\bvisual details of (?:the )?image\s*:\s*/i;
  const match = marker.exec(content);
  if (!match) return null;

  const context = content.slice(0, match.index).trim();
  const visualDetails = content.slice(match.index + match[0].length).trim();
  if (!visualDetails) return null;

  return context
    ? `Context: ${context}\nVisual direction: ${visualDetails}`
    : visualDetails;
}

function isImageModificationPrompt(prompt: string) {
  return /^\s*(?:(?:please|can you|could you|would you)\s+)*(?:edit|modify|change|alter|transform|turn|convert|restyle|redesign|enhance|retouch|recolor|colorize|crop|add|remove|replace|erase|blur)\b/i.test(prompt) ||
    /^\s*(?:(?:please|can you|could you|would you)\s+)*(?:make|create|generate|draw|design)\s+(?:it|this|the image|the photo|the picture|an? (?:new )?(?:image|photo|picture))\b/i.test(prompt) ||
    /\b(?:make|create|generate)\s+(?:it|this|the image|the photo|the picture|an? (?:new )?(?:image|photo|picture))\b/i.test(prompt) ||
    /^\s*(?:(?:please|can you|could you|would you)\s+)*(?:make|keep)\s+(?:it|this|that)\s+\w+/i.test(prompt) ||
    /^\s*(?:(?:please|can you|could you|would you)\s+)*(?:make|change|turn)\s+(?:the|its|their)\s+(?:background|sky|lighting|colors?|colours?|clothing|outfit|subject|character|object|item|thing|element|style|composition)\b/i.test(prompt) ||
    /^\s*(?:(?:please|can you|could you|would you)\s+)*(?:make|create|generate)\s+(?:another|a different|a new version|a variation)\b/i.test(prompt);
}

function isImageVariationPrompt(prompt: string) {
  return /^\s*(?:(?:please|can you|could you|would you)\s+)*(?:(?:make|create|generate|draw|design|show|give me)\s+)?(?:(?:me|us)\s+)?(?:another|a different|a new|one more)\s+(?:image|picture|photo|artwork|illustration|one|version|variation)\b/i.test(prompt) ||
    /^\s*(?:(?:please|can you|could you|would you)\s+)*(?:try again|try another|do another one)\b/i.test(prompt);
}

function isImageReferencePrompt(prompt: string) {
  return /\b(?:it|this|that|there|describe|analyze|analyse|explain|image|picture|photo|artwork|illustration|scene|subject|character|background|foreground|color|colour|object|person|people|animal|sky|clothing|hat)\b/i.test(prompt);
}

function normalizeMathExpression(expression: string) {
  let normalized = expression.trim();

  const greekMap: Record<string, string> = {
    α: "\\alpha",
    β: "\\beta",
    γ: "\\gamma",
    δ: "\\delta",
    ε: "\\epsilon",
    θ: "\\theta",
    λ: "\\lambda",
    μ: "\\mu",
    π: "\\pi",
    ρ: "\\rho",
    σ: "\\sigma",
    τ: "\\tau",
    φ: "\\phi",
    χ: "\\chi",
    ψ: "\\psi",
    ω: "\\omega",
    Δ: "\\Delta",
    Θ: "\\Theta",
    Λ: "\\Lambda",
    Π: "\\Pi",
    Σ: "\\Sigma",
    Φ: "\\Phi",
    Ω: "\\Omega",
  };
  Object.entries(greekMap).forEach(([symbol, latex]) => {
    normalized = normalized.replaceAll(symbol, latex);
  });

  normalized = normalized
    .replace(/×/g, " \\times ")
    .replace(/÷/g, " \\div ")
    .replace(/±/g, " \\pm ")
    .replace(/∞/g, "\\infty")
    .replace(/°/g, "^\\circ")
    .replace(/∂/g, "\\partial")
    .replace(/∫/g, "\\int")
    .replace(/∑/g, "\\sum")
    .replace(/∏/g, "\\prod")
    .replace(/√/g, "\\sqrt")
    .replace(/≈/g, "\\approx")
    .replace(/≠/g, "\\neq")
    .replace(/≤/g, "\\leq")
    .replace(/≥/g, "\\geq")
    .replace(/→/g, "\\rightarrow")
    .replace(/∀/g, "\\forall")
    .replace(/∃/g, "\\exists")
    .replace(/∈/g, "\\in")
    .replace(/⊆/g, "\\subseteq")
    .replace(/\s*\^\s*\{/g, "^\{")
    .replace(/([0-9]+(?:\.[0-9]+)?)\s*e\s*([-+]?\d+)/gi, (_, coefficient: string, exponent: string) => `${coefficient} \\times 10^{${exponent}}`)
    .replace(/([0-9]+(?:\.[0-9]+)?)\s*×\s*10\^\{?([-+]?\d+)\}?/gi, (_, coefficient: string, exponent: string) => `${coefficient} \\times 10^{${exponent}}`);

  return normalized;
}

function renderMathExpression(expression: string, displayMode: boolean) {
  const normalizedExpression = normalizeMathExpression(expression);

  return (
    <span
      dangerouslySetInnerHTML={{
        __html: katex.renderToString(normalizedExpression, {
          displayMode,
          throwOnError: false,
          output: "htmlAndMathml",
          strict: "ignore",
        }),
      }}
    />
  );
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const tokens = text.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^\s)]+\))/g);

  return tokens.map((part, index) => {
    if (!part) return null;

    if (part.match(/^\$\$[\s\S]+?\$\$$/)) {
      return <span key={index} className="my-2 block text-center">{renderMathExpression(part.slice(2, -2), true)}</span>;
    }
    if (part.match(/^\$[^$\n]+?\$$/)) {
      return <span key={index} className="inline-block align-middle text-sky-200">{renderMathExpression(part.slice(1, -1), false)}</span>;
    }
    if (part.match(/^\\\([\s\S]+?\\\)$/)) {
      return <span key={index} className="inline-block align-middle text-sky-200">{renderMathExpression(part.slice(2, -2), false)}</span>;
    }
    if (part.match(/^\\\[[\s\S]+?\\\]$/)) {
      return <span key={index} className="my-2 block text-center">{renderMathExpression(part.slice(2, -2), true)}</span>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index} className="rounded bg-black/25 px-1.5 py-0.5 font-mono text-[0.9em] text-emerald-200">{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    const link = part.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
    if (link) return <a key={index} href={link[2]} target="_blank" rel="noreferrer" className="text-sky-300 underline underline-offset-2">{link[1]}</a>;
    return <span key={index}>{part}</span>;
  });
}

function renderMathBlock(block: string, key: string): ReactNode {
  const stripped = block.replace(/^\s*\$\$\s*|\s*\$\$\s*$/g, "").replace(/^\s*\\\[\s*|\s*\\\]\s*$/g, "");
  return (
    <div key={key} className="my-3 overflow-x-auto rounded-lg border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-center text-sky-100">
      {renderMathExpression(stripped, true)}
    </div>
  );
}

function getImageDownloadFilename(imageUrl: string, index: number) {
  const mediaType = imageUrl.match(/^data:(image\/[a-z0-9.+-]+)/i)?.[1]?.toLowerCase();
  const extension = mediaType?.slice("image/".length) || "png";
  return `teller-generated-${index + 1}.${extension === "jpeg" ? "jpg" : extension}`;
}

function isSearchedImageResult(value: unknown): value is SearchedImageResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const image = value as Record<string, unknown>;
  if (
    typeof image.title !== "string" ||
    typeof image.imageUrl !== "string" ||
    typeof image.sourcePageUrl !== "string"
  ) return false;

  const isHttpUrl = (candidate: string) => {
    try {
      const url = new URL(candidate);
      return (url.protocol === "https:" || url.protocol === "http:") &&
        Boolean(url.hostname) &&
        !url.username &&
        !url.password;
    } catch {
      return false;
    }
  };
  return isHttpUrl(image.imageUrl) && isHttpUrl(image.sourcePageUrl);
}

async function readResearchResponse(
  response: Response,
  onSites: (sites: string[]) => void,
): Promise<ChatResponsePayload> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The research response stream is unavailable.");

  const decoder = new TextDecoder();
  let buffer = "";
  let payload: ChatResponsePayload | null = null;
  const consumeEvent = (eventText: string) => {
    const data = eventText
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) return;

    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("The research response stream is invalid.");
    }
    const event = parsed as Record<string, unknown>;
    if (event.type === "sites" && Array.isArray(event.sites)) {
      onSites(event.sites.filter((site): site is string => typeof site === "string"));
    } else if (event.type === "complete") {
      if (typeof event.payload !== "object" || event.payload === null || Array.isArray(event.payload)) {
        throw new Error("The research response did not include a valid reply.");
      }
      payload = event.payload as ChatResponsePayload;
    } else if (event.type === "error") {
      throw new Error(typeof event.message === "string" ? event.message : "Web research failed.");
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || "";
      events.forEach(consumeEvent);
      if (done) {
        if (buffer.trim()) consumeEvent(buffer);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!payload) throw new Error("The research response ended before the reply was ready.");
  return payload;
}

function FormattedMessage({ content, onCopyCode, showCodeCopy = true }: { content: string; onCopyCode: (code: string) => void; showCodeCopy?: boolean }) {
  const blocks = content.split(/```([\w+-]*)\n?([\s\S]*?)```/g);
  const output: ReactNode[] = [];

  for (let index = 0; index < blocks.length; index += 3) {
    const text = blocks[index];
    if (text) {
      const mathSegments = text.split(/(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\])/g);
      mathSegments.forEach((segment, segmentIndex) => {
        if (!segment) return;

        if (segment.match(/^\$\$[\s\S]+?\$\$$/) || segment.match(/^\\\[[\s\S]+?\\\]$/)) {
          output.push(renderMathBlock(segment, `${index}-${segmentIndex}`));
          return;
        }

        const lines = segment.split("\n");
        let paragraphLines: Array<{ line: string; index: number }> = [];
        const flushParagraph = () => {
          if (!paragraphLines.length) return;
          const firstLineIndex = paragraphLines[0].index;
          output.push(
            <p key={`${index}-${segmentIndex}-paragraph-${firstLineIndex}`} className="my-2 first:mt-0 last:mb-0">
              {paragraphLines.map(({ line, index: lineIndex }, paragraphIndex) => (
                <span key={lineIndex}>
                  {renderInlineMarkdown(line)}
                  {paragraphIndex < paragraphLines.length - 1 && <br />}
                </span>
              ))}
            </p>,
          );
          paragraphLines = [];
        };

        lines.forEach((line, lineIndex) => {
          const heading = line.match(/^(#{1,3})\s+(.+)$/);
          const bullet = line.match(/^\s*[-*]\s+(.+)$/);
          const numbered = line.match(/^\s*\d+\.\s+(.+)$/);
          if (!line.trim()) {
            flushParagraph();
          } else if (heading) {
            flushParagraph();
            output.push(<h3 key={`${index}-${segmentIndex}-${lineIndex}`} className="mt-3 text-base font-semibold text-white">{renderInlineMarkdown(heading[2])}</h3>);
          } else if (bullet) {
            flushParagraph();
            output.push(<div key={`${index}-${segmentIndex}-${lineIndex}`} className="pl-4 before:mr-2 before:content-['•']">{renderInlineMarkdown(bullet[1])}</div>);
          } else if (numbered) {
            flushParagraph();
            output.push(<div key={`${index}-${segmentIndex}-${lineIndex}`} className="pl-4">{renderInlineMarkdown(line.trim())}</div>);
          } else {
            paragraphLines.push({ line, index: lineIndex });
          }
        });
        flushParagraph();
      });
    }
    if (index + 1 < blocks.length) {
      const language = blocks[index + 1] || "code";
      const code = blocks[index + 2].trim();
      output.push(
        <div key={`code-${index}`} className="my-3 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950">
          <div className="flex items-center justify-between border-b border-neutral-700 px-3 py-2 text-xs text-neutral-400">
            <span>{language}</span>
            {showCodeCopy && <button type="button" onClick={() => onCopyCode(code)} className="rounded bg-neutral-800 px-2 py-1 text-xl leading-none text-neutral-200 hover:bg-neutral-700" aria-label="Copy code" title="Copy code">⧉</button>}
          </div>
          <pre className="overflow-x-auto p-3 text-xs leading-6 text-emerald-100"><code>{code}</code></pre>
        </div>,
      );
    }
  }
  return output;
}

export default function ChatWindow() {
  const { user, isAuthenticated, isLoading: isAuthLoading, loginWithRedirect, logout, getAccessTokenSilently } = useAppAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: getTellerGreeting(),
    },
  ]);

  const [histories, setHistories] = useState<HistoryItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const activeHistoryIdRef = useRef<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<AgentMode>("teller");
  const [activeMapQuery, setActiveMapQuery] = useState("");
  const historyHydratedRef = useRef(false);
  const agentQueryHandledRef = useRef(false);

  const [input, setInput] = useState("");
  const [imageEditTarget, setImageEditTarget] = useState<Message | null>(null);
  const [imageEditPrompt, setImageEditPrompt] = useState("");
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isStartingRecording, setIsStartingRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const loadingHistoryIdsRef = useRef(new Set<string>());
  const titleGeneratedPromptCountsRef = useRef(new Map<string, number>());
  const [loadingHistoryIds, setLoadingHistoryIds] = useState<Set<string>>(() => new Set());
  const [researchSitesByHistory, setResearchSitesByHistory] = useState<Record<string, string[]>>({});
  const generatingImageHistoryIdsRef = useRef(new Set<string>());
  const [generatingImageHistoryIds, setGeneratingImageHistoryIds] = useState<Set<string>>(() => new Set());
  const loading = activeHistoryId !== null && loadingHistoryIds.has(activeHistoryId);
  const researchSites = activeHistoryId ? researchSitesByHistory[activeHistoryId] || [] : [];
  const isGeneratingImage = activeHistoryId !== null && generatingImageHistoryIds.has(activeHistoryId);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isRecordingRef = useRef(false);
  const isStartingRecordingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechTranscriptRef = useRef("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHistoryVisible, setIsHistoryVisible] = useState(true);
  const [isHistorySearchOpen, setIsHistorySearchOpen] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [isImageHistoryOpen, setIsImageHistoryOpen] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isGeneratedImagesLoading, setIsGeneratedImagesLoading] = useState(false);
  const [generatedImagesHasMore, setGeneratedImagesHasMore] = useState(false);
  const [generatedImagesError, setGeneratedImagesError] = useState("");
  const generatedImageUrlsRef = useRef(new Set<string>());
  const generatedImageOffsetRef = useRef(0);
  const [pendingFile, setPendingFile] = useState<Message["file"] | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("auto");
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState<number | null>(null);
  const [voiceReplyLoading, setVoiceReplyLoading] = useState<number | null>(null);
  const [voiceReplyError, setVoiceReplyError] = useState<{
    index: number;
    historyId: string | null;
    content: string;
    message: string;
  } | null>(null);
  const [voiceReplyPlayback, setVoiceReplyPlayback] = useState<{
    index: number;
    historyId: string | null;
    content: string;
    segment: string;
    audio: HTMLAudioElement;
  } | null>(null);
  const voiceReplyAudioRef = useRef<{
    index: number;
    historyId: string | null;
    content: string;
    url: string;
    audio: HTMLAudioElement;
    segments: VoiceReplySegment[];
  } | null>(null);
  const voiceReplyAudioUrlRef = useRef<string | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const authReady = isMounted && !isAuthLoading;
  const hasSession = authReady && isAuthenticated;
  const [monthlyChatCount, setMonthlyChatCount] = useState(0);
  const [profilePicture, setProfilePicture] = useState("");
  const [planName, setPlanName] = useState("Free");
  const [usageLimit, setUsageLimit] = useState(100);
  const [dailyImageCount, setDailyImageCount] = useState(0);
  const [dailyImageLimit, setDailyImageLimit] = useState(5);
  const [googleConnection, setGoogleConnection] = useState<GoogleConnectionStatus | null>(null);
  const [googleConnectionError, setGoogleConnectionError] = useState("");
  const [googleConnectionNotice, setGoogleConnectionNotice] = useState("");
  const [googleConnectionBusy, setGoogleConnectionBusy] = useState(false);
  const [confirmingCyberAction, setConfirmingCyberAction] = useState<string | null>(null);
  const accountProfile = {
    name: user?.name || "Teller User",
    email: user?.email || "user@example.com",
    picture:
      profilePicture ||
      user?.picture ||
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
    isAuthenticated,
  };

  function selectHistory(historyId: string | null) {
    activeHistoryIdRef.current = historyId;
    setActiveHistoryId(historyId);
  }

  useEffect(() => {
    activeHistoryIdRef.current = activeHistoryId;
  }, [activeHistoryId]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => () => {
    voiceReplyAudioRef.current?.audio.pause();
    if (voiceReplyAudioUrlRef.current) URL.revokeObjectURL(voiceReplyAudioUrlRef.current);
  }, []);

  useEffect(() => {
    const voiceReplyAudio = voiceReplyAudioRef.current;
    if (voiceReplyAudio && voiceReplyAudio.historyId !== activeHistoryId) {
      voiceReplyAudio.audio.pause();
      URL.revokeObjectURL(voiceReplyAudio.url);
      voiceReplyAudioRef.current = null;
      voiceReplyAudioUrlRef.current = null;
      setVoiceReplyPlayback((current) => current?.audio === voiceReplyAudio.audio ? null : current);
    }
  }, [activeHistoryId]);

  useEffect(() => {
    if (activeAgent !== "cyber" || isAuthLoading) return;
    if (!hasSession) return;
    let cancelled = false;
    getAccessTokenSilently()
      .then((token) => fetch("/api/google/connect", { headers: { Authorization: `Bearer ${token}` } }))
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not check the Google connection.");
        if (!cancelled) {
          setGoogleConnection(data as GoogleConnectionStatus);
          const params = new URLSearchParams(window.location.search);
          const googleResult = params.get("google");
          if (googleResult === "connected") setGoogleConnectionNotice("Google account connected.");
          if (googleResult === "error") setGoogleConnectionError("Google account connection did not complete. Try again.");
          if (googleResult) {
            params.delete("google");
            params.delete("reason");
            const query = params.toString();
            window.history.replaceState({}, document.title, `${window.location.pathname}${query ? `?${query}` : ""}`);
          }
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setGoogleConnectionError(getErrorMessage(error));
          setGoogleConnection(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeAgent, getAccessTokenSilently, hasSession, isAuthLoading]);

  useEffect(() => () => {
    generatedImageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    generatedImageUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const textarea = promptInputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [input]);

  useEffect(() => {
    const savedTheme = localStorage.getItem("teller_theme") as Theme | null;
    if (savedTheme === "auto" || savedTheme === "dark" || savedTheme === "light") {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("teller_theme", theme);
  }, [theme]);

  // Load only the current account's histories and monthly usage.
  useEffect(() => {
    if (isAuthLoading) return;

    historyHydratedRef.current = false;
    try {
      selectHistory(null);
      setActiveAgent("teller");
      setActiveMapQuery("");
      setMessages([
        {
          role: "assistant",
          content: getTellerGreeting(),
        },
      ]);
      if (!isAuthenticated) {
        const initialMessages: Message[] = [
          {
            role: "assistant",
            content: getTellerGreeting(),
          },
        ];
        const initial: HistoryItem = {
          id: Date.now().toString(),
          title: "New chat",
          messages: initialMessages,
          updatedAt: Date.now(),
        };
        setHistories([initial]);
        selectHistory(initial.id);
        setMessages(initialMessages);
        setActiveAgent("teller");
        setActiveMapQuery("");
        setMonthlyChatCount(0);
        historyHydratedRef.current = true;
        return;
      }

      getAccessTokenSilently()
        .then(async (token) => {
          const headers = { Authorization: `Bearer ${token}` };
          const historyResponse = await fetch("/api/account/history", { headers });
          return { historyResponse };
        })
        .then(async ({ historyResponse }) => {
          if (!historyResponse.ok) throw new Error("Could not load remote history.");
          const data = await historyResponse.json();
          if (!Array.isArray(data.history)) throw new Error("Invalid remote history.");
          const remoteHistories = data.history as HistoryItem[];
          if (remoteHistories.length) {
            setHistories(remoteHistories);
            selectHistory(remoteHistories[0].id);
            setMessages(remoteHistories[0].messages);
            setActiveAgent(remoteHistories[0].agent === "cyber" || remoteHistories[0].agent === "maps" ? remoteHistories[0].agent : "teller");
            setActiveMapQuery(typeof remoteHistories[0].mapQuery === "string" ? remoteHistories[0].mapQuery : "");
          } else {
            const initialMessages: Message[] = [
              {
                role: "assistant",
                content: getTellerGreeting(),
              },
            ];
            const initial: HistoryItem = {
              id: Date.now().toString(),
              title: "New chat",
              messages: initialMessages,
              updatedAt: Date.now(),
            };
            setHistories([initial]);
            selectHistory(initial.id);
            setMessages(initialMessages);
            setActiveAgent("teller");
            setActiveMapQuery("");
          }
        })
        .catch(() => {
          setHistories([]);
          selectHistory(null);
        })
        .finally(() => {
          historyHydratedRef.current = true;
        });
      // eslint-disable-next-line no-empty
    } catch (e) {}
  }, [getAccessTokenSilently, isAuthLoading, isAuthenticated]);

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated) return;
    getAccessTokenSilently()
      .then((token) => fetch("/api/account", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      }))
      .then((response) => (response.ok ? response.json() : null))
      .then((account) => {
        if (!account) return;
        if (typeof account.picture === "string") setProfilePicture(account.picture);
        setPlanName(account.plan);
        setUsageLimit(account.usageLimit);
        if (Number.isInteger(account.imageGenerationLimit)) {
          setDailyImageLimit(account.imageGenerationLimit);
        }
        if (Number.isInteger(account.imageGenerationCount)) {
          setDailyImageCount(account.imageGenerationCount);
        }
        if (Number.isInteger(account.usageCount)) {
          setMonthlyChatCount(account.usageCount);
        }
      })
      .catch(() => undefined);
  }, [getAccessTokenSilently, isAuthLoading, isAuthenticated]);

  useEffect(() => {
    if (!isMounted || isAuthLoading || !historyHydratedRef.current || agentQueryHandledRef.current) return;
    const url = new URL(window.location.href);
    const requestedAgent = url.searchParams.get("agent");
    if (requestedAgent !== "cyber" && requestedAgent !== "maps") {
      agentQueryHandledRef.current = true;
      return;
    }
    agentQueryHandledRef.current = true;
    url.searchParams.delete("agent");
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
    const modeHistory = histories.find((history) => (
      (history.agent === "cyber" || history.agent === "maps" ? history.agent : "teller") === requestedAgent
    ));
    if (modeHistory) {
      selectHistory(modeHistory.id);
      setActiveAgent(requestedAgent);
      setActiveMapQuery(typeof modeHistory.mapQuery === "string" ? modeHistory.mapQuery : "");
      setMessages(modeHistory.messages);
    } else {
      const id = Date.now().toString();
      const initialMessages: Message[] = [{ role: "assistant", content: getModeGreeting(requestedAgent) }];
      const newHistory: HistoryItem = {
        id,
        title: "New chat",
        agent: requestedAgent,
        ...(requestedAgent === "maps" ? { mapQuery: "" } : {}),
        messages: initialMessages,
        updatedAt: Date.now(),
      };
      setHistories((previous) => [newHistory, ...previous]);
      selectHistory(id);
      setActiveAgent(requestedAgent);
      setActiveMapQuery("");
      setMessages(initialMessages);
    }
  }, [histories, isAuthLoading, isMounted]);

  // Persist active history whenever messages change
  useEffect(() => {
    if (!activeHistoryId) return;
    setHistories((prev) => {
      const next = prev.slice();
      const idx = next.findIndex((h) => h.id === activeHistoryId);
      const titleFromUser = messages.find((m) => m.role === "user")?.content?.slice(0, 60) || "New chat";
      // If there's an existing non-default title (likely AI-generated), preserve it.
      const existing = prev.find((h) => h.id === activeHistoryId);
      const finalTitle = existing && existing.title && existing.title !== "New chat" ? existing.title : titleFromUser;
      const updated: HistoryItem = {
        id: activeHistoryId,
        title: finalTitle,
        agent: activeAgent,
        ...(activeMapQuery ? { mapQuery: activeMapQuery } : {}),
        messages,
        updatedAt: Date.now(),
      };
      if (idx === -1) next.unshift(updated);
      else {
        next[idx] = updated;
        next.splice(idx, 1);
        next.unshift(updated);
      }
      return next;
    });
  }, [messages, activeAgent, activeMapQuery, activeHistoryId]);

  useEffect(() => {
    if (!isAuthenticated || !historyHydratedRef.current) return;
    let cancelled = false;
    getAccessTokenSilently()
      .then((token) =>
        fetch("/api/account/history", {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            history: histories.map((history) => ({
              ...history,
              messages: history.messages.map((message) => (
                message.imageStoragePath
                  ? { ...message, imageUrl: undefined }
                  : message
              )),
            })),
          }),
        }),
      )
      .then((response) => {
        if (!response.ok && !cancelled) throw new Error("Could not save remote history.");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [getAccessTokenSilently, histories, isAuthenticated]);

  function switchMode(mode: AgentMode) {
    setIsModeMenuOpen(false);
    if (mode === activeAgent) return;

    const modeHistory = histories.find((history) => (
      (history.agent === "cyber" || history.agent === "maps" ? history.agent : "teller") === mode
    ));
    if (!modeHistory) {
      createNewChat(mode);
      return;
    }

    selectHistory(modeHistory.id);
    setActiveAgent(mode);
    setActiveMapQuery(typeof modeHistory.mapQuery === "string" ? modeHistory.mapQuery : "");
    setMessages(modeHistory.messages);
    setIsSidebarOpen(false);
    setIsImageHistoryOpen(false);
  }

  function createNewChat(agent: AgentMode = activeAgent) {
    const id = Date.now().toString();
    const initialMessages: Message[] = [
      {
        role: "assistant",
        content: getModeGreeting(agent),
      },
    ];
    const newItem: HistoryItem = {
      id,
      title: "New chat",
      agent,
      ...(agent === "maps" ? { mapQuery: "" } : {}),
      messages: initialMessages,
      updatedAt: Date.now(),
    };
    const next = [newItem, ...histories];
    setHistories(next);
    selectHistory(id);
    setActiveAgent(agent);
    setActiveMapQuery("");
    setMessages(initialMessages);
    setIsSidebarOpen(false);
  }

  function openUserPanel() {
    const userPanelUrl = `${window.location.origin}/settings`;
    window.open(userPanelUrl, "_blank", "noopener,noreferrer");
  }

  function deleteHistory(id: string) {
    if (!confirm("Delete this conversation? This cannot be undone.")) return;
    setHistories((prev) => {
      const next = prev.filter((h) => h.id !== id);
      // if deleted active, switch to first or create new
      if (id === activeHistoryId) {
        const nextModeHistory = next.find((history) => (
          (history.agent === "cyber" || history.agent === "maps" ? history.agent : "teller") === activeAgent
        ));
        if (nextModeHistory) {
          selectHistory(nextModeHistory.id);
          setMessages(nextModeHistory.messages);
          setActiveMapQuery(typeof nextModeHistory.mapQuery === "string" ? nextModeHistory.mapQuery : "");
        } else {
          const newId = Date.now().toString();
          const initialMessages: Message[] = [{
            role: "assistant",
            content: getModeGreeting(activeAgent),
            file: null,
          }];
          const newHist: HistoryItem = {
            id: newId,
            title: "New chat",
            agent: activeAgent,
            ...(activeAgent === "maps" ? { mapQuery: "" } : {}),
            messages: initialMessages,
            updatedAt: Date.now(),
          };
          next.unshift(newHist);
          selectHistory(newId);
          setActiveMapQuery("");
          setMessages(initialMessages);
        }
      }
      return next;
    });
  }

  function loadHistory(id: string) {
    const h = histories.find((x) => x.id === id);
    if (!h) return;
    selectHistory(id);
    setActiveAgent(h.agent === "cyber" || h.agent === "maps" ? h.agent : "teller");
    setActiveMapQuery(typeof h.mapQuery === "string" ? h.mapQuery : "");
    setMessages(h.messages);
    setIsSidebarOpen(false);
    setIsImageHistoryOpen(false);
  }

  async function loadGeneratedImages(reset = false) {
    if (!hasSession || isGeneratedImagesLoading) return;
    setIsGeneratedImagesLoading(true);
    setGeneratedImagesError("");

    if (reset) {
      generatedImageUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      generatedImageUrlsRef.current.clear();
      generatedImageOffsetRef.current = 0;
      setGeneratedImages([]);
      setGeneratedImagesHasMore(false);
    }

    try {
      const token = await getAccessTokenSilently();
      const offset = reset ? 0 : generatedImageOffsetRef.current;
      const response = await fetch(`/api/account/images?offset=${offset}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load generated images.");
      if (!Array.isArray(data.images)) throw new Error("The image history response was invalid.");
      generatedImageOffsetRef.current = offset + data.images.length;

      const results = await Promise.allSettled(
        data.images.map(async (image: { id: string; historyId: string; createdAt: string }) => {
          const imageResponse = await fetch(`/api/account/images/${encodeURIComponent(image.id)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!imageResponse.ok) {
            throw new Error(`Could not load image ${image.id}.`);
          }
          const imageUrl = URL.createObjectURL(await imageResponse.blob());
          generatedImageUrlsRef.current.add(imageUrl);
          return { ...image, imageUrl } satisfies GeneratedImage;
        }),
      );
      const loadedImages = results.flatMap((result) => (
        result.status === "fulfilled" ? [result.value] : []
      ));
      setGeneratedImages((previous) => reset ? loadedImages : [...previous, ...loadedImages]);
      setGeneratedImagesHasMore(data.hasMore === true);
      if (loadedImages.length < data.images.length) {
        setGeneratedImagesError("Some images could not be loaded. Try again later.");
      }
    } catch (error) {
      setGeneratedImagesError(getErrorMessage(error));
    } finally {
      setIsGeneratedImagesLoading(false);
    }
  }

  function openGeneratedImageHistory() {
    setIsImageHistoryOpen(true);
    setIsSidebarOpen(false);
    if (!hasSession) {
      setGeneratedImagesError("Log in to view your generated images.");
      return;
    }
    if (!generatedImages.length) void loadGeneratedImages(true);
  }

  function setHistoryLoading(historyId: string, isLoading: boolean) {
    const next = new Set(loadingHistoryIdsRef.current);
    if (isLoading) next.add(historyId);
    else next.delete(historyId);
    loadingHistoryIdsRef.current = next;
    setLoadingHistoryIds(next);
  }

  function setHistoryGeneratingImage(historyId: string, isGenerating: boolean) {
    const next = new Set(generatingImageHistoryIdsRef.current);
    if (isGenerating) next.add(historyId);
    else next.delete(historyId);
    generatingImageHistoryIdsRef.current = next;
    setGeneratingImageHistoryIds(next);
  }

  async function generateConversationTitle(
    historyId: string,
    conversationMessages: Message[],
  ) {
    const userMessageCount = conversationMessages.filter((message) => message.role === "user").length;
    const assistantMessageCount = conversationMessages.filter((message) => message.role === "assistant").length;
    if (
      (userMessageCount !== 4 && userMessageCount !== 7) ||
      assistantMessageCount < userMessageCount + 1
    ) return;
    if (titleGeneratedPromptCountsRef.current.get(historyId) === userMessageCount) return;
    titleGeneratedPromptCountsRef.current.set(historyId, userMessageCount);

    try {
      const token = isAuthenticated ? await getAccessTokenSilently() : null;
      const response = await fetch("/api/title", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: conversationMessages
            .filter((message) => message.role === "user" || message.role === "assistant")
            .map((message) => ({ role: message.role, content: message.content }))
            .slice(-12),
        }),
      });
      if (!response.ok) {
        titleGeneratedPromptCountsRef.current.delete(historyId);
        return;
      }

      const data = await response.json() as { title?: unknown };
      if (typeof data.title !== "string") return;
      const title = data.title
        .replace(/^[\s"*'`–-]+|[\s"*'`–-]+$/g, "")
        .replace(/\s+/g, " ")
        .slice(0, 60)
        .trim();
      const metaTitlePattern =
        /^(?:title(?:\s+generation)?|conversation(?:\s+title)?|chat(?:\s+title)?|here(?:['’]s|\s+is)\s+(?:a\s+)?(?:title|conversation)|i(?:['’]d)?\s+(?:title|suggest)|generated?\s+title)\b/i;
      const hasMetaTitleText =
        metaTitlePattern.test(title) ||
        /\b(?:title generation instruction|title generation prompt)\b/i.test(title);
      if (!title || hasMetaTitleText) {
        titleGeneratedPromptCountsRef.current.delete(historyId);
        return;
      }

      setHistories((previous) => previous.map((history) => (
        history.id === historyId
          ? { ...history, title, updatedAt: Date.now() }
          : history
      )));
    } catch (error) {
      titleGeneratedPromptCountsRef.current.delete(historyId);
      console.error("Could not generate conversation title:", error);
    }
  }

  function updateHistoryMessages(
    historyId: string | null,
    nextMessages: Message[],
    updates: Partial<Pick<HistoryItem, "agent" | "mapQuery">> = {},
  ) {
    if (!historyId) return;
    const updatedAt = Date.now();
    setHistories((previous) => previous.map((history) => (
      history.id === historyId
        ? {
            ...history,
            ...updates,
            title: history.title === "New chat"
              ? nextMessages.find((message) => message.role === "user")?.content.slice(0, 60) || history.title
              : history.title,
            messages: nextMessages,
            updatedAt,
          }
        : history
    )));
    void generateConversationTitle(historyId, nextMessages);
  }

  async function sendMessage(messageText = input, imageEditReference?: Message) {
    if (!messageText.trim()) return;
    if (monthlyChatCount >= usageLimit && !getExplicitMemoryRequest(messageText)) return;
    const requestHistoryId = activeHistoryIdRef.current;
    if (!requestHistoryId) return;
    if (requestHistoryId && loadingHistoryIdsRef.current.has(requestHistoryId)) return;
    setResearchSitesByHistory((previous) => ({ ...previous, [requestHistoryId]: [] }));
    const requestAgent = activeAgent;
    const requestFile = imageEditReference ? null : hasSession ? pendingFile : null;

    const userMessage: Message = {
      role: "user",
      content: messageText.trim(),
      file: requestFile,
    };

    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput("");
    if (requestHistoryId) {
      setHistoryLoading(requestHistoryId, true);
      updateHistoryMessages(
        requestHistoryId,
        updatedMessages,
        requestAgent === "maps" && !getExplicitMemoryRequest(userMessage.content)
          ? { agent: requestAgent, mapQuery: userMessage.content }
          : { agent: requestAgent },
      );
    }
    setPendingFile(null);
    setIsModeMenuOpen(false);
    const isMemoryRequest = Boolean(getExplicitMemoryRequest(userMessage.content));
    if (requestAgent === "maps" && !isMemoryRequest) {
      setActiveMapQuery(userMessage.content);
    }

    try {
      if (requestAgent === "cyber") {
        if (requestFile) throw new Error("CyberMail currently works with Gmail and Calendar, not file attachments. Remove the attachment and try again.");
        const token = isAuthenticated ? await getAccessTokenSilently() : null;
        const response = await fetch("/api/cyber-agent", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            messages: updatedMessages.map(({ role, content }) => ({ role, content })),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "CyberMail could not complete that request.");
        if (Number.isInteger(data.usageCount)) setMonthlyChatCount(data.usageCount);
        const assistantMessage: Message = {
          role: "assistant",
          content: typeof data.reply === "string" ? data.reply : "CyberMail completed the request.",
          ...(data.pendingAction ? { pendingAction: data.pendingAction as CyberPendingAction } : {}),
        };
        const nextMessages = [...updatedMessages, assistantMessage];
        if (activeHistoryIdRef.current === requestHistoryId) setMessages(nextMessages);
        updateHistoryMessages(requestHistoryId, nextMessages, { agent: "cyber" });
        return;
      }
      if (requestAgent === "maps" && requestFile) {
        throw new Error("CyberMaps works with locations and directions, not file attachments. Remove the attachment and try again.");
      }

      const hasImageUpload = Boolean(requestFile?.type.startsWith("image/"));
      const currentVisualDirection = extractVisualDetails(userMessage.content);
      const previousAssistantVisualDirection = updatedMessages
        .slice(0, -1)
        .reverse()
        .find((message) => message.role === "assistant")
        ?.content;
      const previousVisualDirection = previousAssistantVisualDirection
        ? extractVisualDetails(previousAssistantVisualDirection)
        : null;
      const previousGeneratedImage = !requestFile
        ? imageEditReference || updatedMessages.slice(0, -1).reverse().find((message) => (
            message.role === "assistant" &&
            Boolean(message.imageUrl) &&
            message.imageStoragePath?.startsWith("postgres:")
          ))
        : undefined;
      const shouldEditGeneratedImage = Boolean(
        previousGeneratedImage && isImageModificationPrompt(userMessage.content),
      );
      const shouldCreateImageVariation = Boolean(
        previousGeneratedImage && isImageVariationPrompt(userMessage.content),
      );
      const explicitImageIntent = isExplicitImageGenerationRequest(userMessage.content);
      let classifiedImageIntent = false;
      let imageIntentClassificationFailed = false;
      const useImageIntentHeuristic = (
        !isAuthenticated ||
        requestAgent !== "teller" ||
        userMessage.content.length > 4000
      );
      if (!explicitImageIntent &&
        requestAgent === "teller" &&
        isAuthenticated &&
        userMessage.content.length <= 4000 &&
        (!requestFile || hasImageUpload)) {
        const token = await getAccessTokenSilently();
        let classificationResponse: Response | null = null;
        try {
          classificationResponse = await fetch("/api/images/classify", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              prompt: userMessage.content,
              hasReferenceImage: Boolean(hasImageUpload || previousGeneratedImage),
            }),
          });
        } catch (error) {
          if (!(error instanceof TypeError)) throw error;
          imageIntentClassificationFailed = true;
        }

        if (classificationResponse) {
          const classificationData: unknown = await classificationResponse.json().catch(() => null);
          if (!classificationResponse.ok) {
            const code = classificationData &&
              typeof classificationData === "object" &&
              "code" in classificationData
              ? classificationData.code
              : null;
            if (classificationResponse.status === 502 && code === "IMAGE_INTENT_CLASSIFICATION_FAILED") {
              imageIntentClassificationFailed = true;
            } else {
              const error = classificationData &&
                typeof classificationData === "object" &&
                "error" in classificationData &&
                typeof classificationData.error === "string"
                ? classificationData.error
                : "Could not classify this request.";
              throw new Error(error);
            }
          } else if (
            classificationData &&
            typeof classificationData === "object" &&
            "isImageGenerationIntent" in classificationData &&
            typeof classificationData.isImageGenerationIntent === "boolean"
          ) {
            classifiedImageIntent = classificationData.isImageGenerationIntent;
          } else {
            imageIntentClassificationFailed = true;
          }
        }
      }
      const localImageIntent = Boolean(
        currentVisualDirection ||
        shouldEditGeneratedImage ||
        shouldCreateImageVariation ||
        (previousVisualDirection && isImageGenerationPrompt(userMessage.content)),
      );
      const shouldGenerateImage = hasImageUpload
        ? explicitImageIntent ||
          isImageModificationPrompt(userMessage.content) ||
          (!imageIntentClassificationFailed && classifiedImageIntent)
        : !requestFile && (
            explicitImageIntent ||
            localImageIntent ||
            (!imageIntentClassificationFailed && classifiedImageIntent) ||
            ((useImageIntentHeuristic || imageIntentClassificationFailed) &&
              isImageGenerationPrompt(userMessage.content))
          );

      if (shouldGenerateImage && !isAuthenticated) {
        const assistantMessage: Message = {
          role: "assistant",
          content: `Log in to generate images, then send this prompt again:\n\n${userMessage.content.trim()}`,
        };
        const nextMessages = [...updatedMessages, assistantMessage];
        if (activeHistoryIdRef.current === requestHistoryId) setMessages(nextMessages);
        updateHistoryMessages(requestHistoryId, nextMessages, { agent: requestAgent });
        return;
      }

      if (shouldGenerateImage) {
        setHistoryGeneratingImage(requestHistoryId, true);
        const imagePrompt = currentVisualDirection ||
          (shouldCreateImageVariation
            ? [
                "Create a new, distinct image based on the reference image. Follow any subject or changes specified in the user's request; otherwise preserve the reference image's subject and overall style while changing the composition.",
                previousGeneratedImage?.imageDescription
                  ? `Reference image details: ${previousGeneratedImage.imageDescription}`
                  : "",
                `User request: ${userMessage.content}`,
              ].filter(Boolean).join("\n")
            : previousVisualDirection && isImageGenerationPrompt(userMessage.content)
              ? `Create an image using this visual direction: ${previousVisualDirection}`
              : userMessage.content);
        const token = isAuthenticated ? await getAccessTokenSilently() : null;
        const imageResponse = await fetch("/api/images/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            prompt: imagePrompt,
            historyId: requestHistoryId,
            ...(hasImageUpload ? { referenceImage: requestFile?.dataUrl } : {}),
            ...((shouldEditGeneratedImage || shouldCreateImageVariation) && previousGeneratedImage
              ? { referenceImageStoragePath: previousGeneratedImage.imageStoragePath }
              : {}),
          }),
        });
        const imageData = await imageResponse.json();
        if (!imageResponse.ok) {
          if (imageData.code === "DAILY_IMAGE_LIMIT_REACHED") {
            setDailyImageCount(imageData.imageGenerationCount);
          }
          throw new Error(imageData.error || "Image generation failed.");
        }
        if (
          typeof imageData.imageUrl !== "string" ||
          !/^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/.test(imageData.imageUrl) ||
          typeof imageData.imageStoragePath !== "string" ||
          !/^postgres:[0-9a-f-]{36}$/i.test(imageData.imageStoragePath) ||
          typeof imageData.imageDescription !== "string" ||
          !imageData.imageDescription.trim()
        ) {
          throw new Error("The generated image could not be verified. Please try again.");
        }
        if (Number.isInteger(imageData.imageGenerationCount)) {
          setDailyImageCount(imageData.imageGenerationCount);
        } else {
          setDailyImageCount((count) => count + 1);
        }

        const assistantMessage: Message = {
          role: "assistant",
          content: "Here’s the image you asked for.",
          imageUrl: imageData.imageUrl,
          imageStoragePath: imageData.imageStoragePath,
          imageDescription: imageData.imageDescription,
        };
        const nextMessages = [...updatedMessages, assistantMessage];
        if (activeHistoryIdRef.current === requestHistoryId) setMessages(nextMessages);
        updateHistoryMessages(requestHistoryId, nextMessages, { agent: requestAgent });
        return;
      }

      const token = isAuthenticated ? await getAccessTokenSilently() : null;
      const shouldAskAboutGeneratedImage = Boolean(
        previousGeneratedImage &&
        !shouldGenerateImage &&
        isImageReferencePrompt(userMessage.content),
      );
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          agent: requestAgent,
          clarifyImageIntent: imageIntentClassificationFailed && !explicitImageIntent,
          messages: updatedMessages.map((msg, index) => {
            const isCurrentImage = msg === userMessage && msg.file?.type.startsWith("image/");
            if (msg.file) {
              return {
                role: msg.role,
                content: `${msg.content || ""}\n[Attachment: ${msg.file.name} (${msg.file.type}; ${msg.file.size} bytes)]`,
                ...(isCurrentImage ? { imageUrl: msg.file.dataUrl } : {}),
              };
            }
            return {
              role: msg.role,
              content: msg.imageDescription
                ? `${msg.content}\nVisual details of the image: ${msg.imageDescription}`
                : msg.content,
              ...(shouldAskAboutGeneratedImage && index === updatedMessages.length - 1
                ? { imageStoragePath: previousGeneratedImage?.imageStoragePath }
                : {}),
            };
          }),
        }),
      });

      const data = response.headers.get("content-type")?.includes("text/event-stream")
        ? await readResearchResponse(response, (sites) => {
            setResearchSitesByHistory((previous) => ({
              ...previous,
              [requestHistoryId]: sites,
            }));
          })
        : await response.json() as ChatResponsePayload;
      if (!response.ok) throw new Error(data.error || "Teller AI could not complete that request.");

      const hasServerUsageCount = typeof data.usageCount === "number" && Number.isInteger(data.usageCount);
      if (typeof data.usageCount === "number" && Number.isInteger(data.usageCount)) {
        setMonthlyChatCount(data.usageCount);
      }

      if (data.reply) {
        if (isAuthenticated && !hasServerUsageCount && !data.memoryAction) {
          setMonthlyChatCount((count) => count + 1);
        }
        const assistantMessage: Message = {
          role: "assistant",
          content: data.reply,
          file: null,
          ...(Array.isArray(data.choices)
            ? {
                choices: data.choices.filter(
                  (choice: unknown): choice is string => typeof choice === "string",
                ).slice(0, 3),
              }
            : {}),
          ...(Array.isArray(data.imageSearchResults)
            ? {
                imageSearchResults: data.imageSearchResults
                  .filter(isSearchedImageResult)
                  .slice(0, 12),
              }
            : {}),
        };
        const nextMessages = [...updatedMessages, assistantMessage];
        if (activeHistoryIdRef.current === requestHistoryId) setMessages(nextMessages);
        updateHistoryMessages(requestHistoryId, nextMessages, { agent: requestAgent });
      } else {
        const nextMessages: Message[] = [
          ...updatedMessages,
          { role: "assistant", content: "Sorry, something went wrong.", file: null },
        ];
        if (activeHistoryIdRef.current === requestHistoryId) setMessages(nextMessages);
        updateHistoryMessages(requestHistoryId, nextMessages, { agent: requestAgent });
      }
    } catch (err) {
      const errorMessage = getErrorMessage(err) || "Network error. Please try again.";
      const nextMessages: Message[] = [
        ...updatedMessages,
        { role: "assistant", content: errorMessage, file: null },
      ];
      if (activeHistoryIdRef.current === requestHistoryId) setMessages(nextMessages);
      updateHistoryMessages(requestHistoryId, nextMessages, { agent: requestAgent });
    } finally {
      setHistoryLoading(requestHistoryId, false);
      setHistoryGeneratingImage(requestHistoryId, false);
      setResearchSitesByHistory((previous) => {
        if (!(requestHistoryId in previous)) return previous;
        const next = { ...previous };
        delete next[requestHistoryId];
        return next;
      });
    }
  }

  async function connectGoogleAccount() {
    setGoogleConnectionBusy(true);
    setGoogleConnectionError("");
    try {
      const token = await getAccessTokenSilently();
      const response = await fetch("/api/google/connect", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok || typeof data.authorizationUrl !== "string") {
        throw new Error(data.error || "Could not start Google account connection.");
      }
      window.location.assign(data.authorizationUrl);
    } catch (error) {
      setGoogleConnectionError(getErrorMessage(error));
      setGoogleConnectionBusy(false);
    }
  }

  async function disconnectGoogleAccount() {
    setGoogleConnectionBusy(true);
    setGoogleConnectionError("");
    try {
      const token = await getAccessTokenSilently();
      const response = await fetch("/api/google/connect", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not disconnect Google.");
      setGoogleConnection({ configured: true, connected: false, email: null });
      setGoogleConnectionNotice("Google account disconnected.");
    } catch (error) {
      setGoogleConnectionError(getErrorMessage(error));
    } finally {
      setGoogleConnectionBusy(false);
    }
  }

  async function confirmCyberAction(messageIndex: number) {
    const action = messages[messageIndex]?.pendingAction;
    if (!action) return;
    setConfirmingCyberAction(action.id);
    try {
      const token = await getAccessTokenSilently();
      const response = await fetch("/api/cyber-agent/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ actionId: action.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not complete the confirmed action.");
      const resultMessage = `${data.message || "Google action completed."}${data.link ? `\n\n[Open in Google](${data.link})` : ""}`;
      setMessages((current) => {
        const actionIndex = current.findIndex((message) => message.pendingAction?.id === action.id);
        return current.flatMap((message, index) => {
        if (index !== actionIndex) return [message];
        return [
          { ...message, pendingAction: undefined },
          { role: "assistant", content: resultMessage },
        ];
        });
      });
      if (activeHistoryId) {
        setHistories((previous) => previous.map((history) => (
          history.id === activeHistoryId
            ? {
                ...history,
                messages: history.messages.flatMap((message) => (
                  message.pendingAction?.id !== action.id
                    ? [message]
                    : [{ ...message, pendingAction: undefined }, { role: "assistant", content: resultMessage }]
                )),
                updatedAt: Date.now(),
              }
            : history
        )));
      }
    } catch (error) {
      const resultMessage = `The confirmed action could not be completed: ${getErrorMessage(error)}`;
      setMessages((current) => current.flatMap((message) => (
        message.pendingAction?.id === action.id
          ? [{ ...message, pendingAction: undefined }, { role: "assistant", content: resultMessage }]
          : [message]
      )));
    } finally {
      setConfirmingCyberAction(null);
    }
  }

  async function startVoiceInput() {
    if (!hasSession) return;
    if (isRecordingRef.current || isStartingRecordingRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setSpeechError("Voice recording is not supported in this browser.");
      return;
    }

    const typedPrefix = input.trim();
    isStartingRecordingRef.current = true;
    setIsStartingRecording(true);
    speechTranscriptRef.current = "";
    setSpeechError("");

    let stream: MediaStream | null = null;
    try {
      const activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream = activeStream;

      const supportedMimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
        .find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
      const recorder = new MediaRecorder(activeStream, supportedMimeType ? { mimeType: supportedMimeType } : undefined);
      const context = new AudioContext();
      await context.resume();
      const source = context.createMediaStreamSource(activeStream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      processor.onaudioprocess = (event) => {
        chunks.push(event.inputBuffer.getChannelData(0).slice());
        event.outputBuffer.getChannelData(0).fill(0);
      };
      source.connect(processor);
      processor.connect(context.destination);
      mediaRecorderRef.current = recorder;
      audioStreamRef.current = activeStream;

      const speechWindow = window as SpeechRecognitionWindow;
      const SpeechRecognition = speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language;
        recognition.onresult = (event) => {
          let transcript = "";
          for (let index = 0; index < event.results.length; index += 1) {
            transcript += event.results[index][0].transcript;
          }
          speechTranscriptRef.current = transcript.trim();
        };
        recognition.onerror = () => {
          setSpeechError("Live captions are unavailable; the recording will still be transcribed.");
        };
        speechRecognitionRef.current = recognition;
        try {
          recognition.start();
        } catch {
          speechRecognitionRef.current = null;
          setSpeechError("Live captions are unavailable; the recording will still be transcribed when you stop.");
        }
      } else {
        setSpeechError("Live captions are unavailable; the recording will still be transcribed when you stop.");
      }

      recorder.onstop = async () => {
        processor.onaudioprocess = null;
        source.disconnect();
        processor.disconnect();
        await context.close();
        activeStream.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
        audioStreamRef.current = null;
        speechRecognitionRef.current = null;
        isRecordingRef.current = false;
        setIsRecording(false);

        if (!chunks.length) {
          setIsTranscribing(false);
          setSpeechError("No audio was recorded. Tap the microphone and speak before stopping the recording.");
          return;
        }

        setIsTranscribing(true);
        try {
          const wavRecording = encodeAudioChunksToWav(chunks, context.sampleRate);
          const token = await getAccessTokenSilently();
          const formData = new FormData();
          formData.append("audio", wavRecording, "speech.wav");
          const response = await fetch("/api/transcribe", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || "Transcription failed.");

          const transcription = typeof result.transcription === "string" ? result.transcription.trim() : "";
          if (!transcription) throw new Error("No speech was detected. Try speaking again.");
          const prompt = [typedPrefix, transcription].filter(Boolean).join(" ");
          setSpeechError("");
          setIsTranscribing(false);
          void sendMessage(prompt);
        } catch (error) {
          setIsTranscribing(false);
          const liveTranscript = speechTranscriptRef.current.trim();
          if (liveTranscript) {
            setSpeechError("");
            void sendMessage([typedPrefix, liveTranscript].filter(Boolean).join(" "));
          } else {
            setInput(typedPrefix);
            setSpeechError(getErrorMessage(error));
          }
        }
      };

      recorder.start();
      isRecordingRef.current = true;
      isStartingRecordingRef.current = false;
      setIsStartingRecording(false);
      setIsRecording(true);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      isStartingRecordingRef.current = false;
      setIsStartingRecording(false);
      isRecordingRef.current = false;
      setIsRecording(false);
      setSpeechError(error instanceof Error && error.name === "NotAllowedError"
        ? "Allow microphone access to use voice input."
        : "Could not start voice recording. Please try again.");
    }
  }

  function toggleVoiceInput() {
    if (isRecordingRef.current && mediaRecorderRef.current?.state === "recording") {
      isRecordingRef.current = false;
      setIsRecording(false);
      try {
        speechRecognitionRef.current?.stop();
      } catch {
        speechRecognitionRef.current = null;
      }
      mediaRecorderRef.current.stop();
      return;
    }
    if (!hasSession || loading || isTranscribing) return;
    void startVoiceInput();
  }

  async function copyText(text: string, index: number) {
    await navigator.clipboard.writeText(text);
    setCopiedMessage(index);
    window.setTimeout(() => setCopiedMessage((current) => current === index ? null : current), 1400);
  }

  async function generateVoiceReply(content: string, index: number) {
    const existingAudio = voiceReplyAudioRef.current;
    if (
      existingAudio?.index === index &&
      existingAudio.historyId === activeHistoryId &&
      existingAudio.content === content
    ) {
      setVoiceReplyError(null);
      setVoiceReplyPlayback({
        index,
        historyId: activeHistoryId,
        content,
        segment: getCurrentVoiceReplySegment(existingAudio.audio, existingAudio.segments),
        audio: existingAudio.audio,
      });
      try {
        await existingAudio.audio.play();
      } catch {
        setVoiceReplyPlayback((current) => current?.audio === existingAudio.audio ? null : current);
        setVoiceReplyError({
          index,
          historyId: activeHistoryId,
          content,
          message: "Your browser blocked automatic audio playback. Click Listen to try again.",
        });
      }
      return;
    }

    setVoiceReplyLoading(index);
    setVoiceReplyError(null);
    const requestedHistoryId = activeHistoryId;
    try {
      const token = isAuthenticated ? await getAccessTokenSilently() : null;
      const response = await fetch("/api/speech", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text: content }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Voice generation failed.");
      }

      const audioBlob = await response.blob();
      if (requestedHistoryId !== activeHistoryId) return;
      voiceReplyAudioRef.current?.audio.pause();
      if (voiceReplyAudioUrlRef.current) URL.revokeObjectURL(voiceReplyAudioUrlRef.current);
      const url = URL.createObjectURL(audioBlob);
      voiceReplyAudioUrlRef.current = url;
      const audio = new Audio(url);
      const segmentDurations = (response.headers.get("X-TTS-Segment-Durations") || "")
        .split(",")
        .map(Number)
        .filter((duration) => Number.isFinite(duration) && duration > 0);
      const segments = getVoiceReplySegments(content, segmentDurations);
      voiceReplyAudioRef.current = { index, historyId: requestedHistoryId, content, url, audio, segments };
      const updateCurrentSegment = () => {
        setVoiceReplyPlayback({
          index,
          historyId: requestedHistoryId,
          content,
          segment: getCurrentVoiceReplySegment(audio, segments),
          audio,
        });
      };
      audio.addEventListener("timeupdate", updateCurrentSegment);
      audio.addEventListener("loadedmetadata", updateCurrentSegment);
      audio.addEventListener("play", updateCurrentSegment);
      audio.addEventListener("ended", () => {
        setVoiceReplyPlayback((current) => current?.audio === audio ? null : current);
      });
      audio.addEventListener("pause", () => {
        setVoiceReplyPlayback((current) => current?.audio === audio ? null : current);
      });
      updateCurrentSegment();
      await audio.play();
    } catch (error) {
      setVoiceReplyPlayback((current) => current?.index === index &&
        current.historyId === requestedHistoryId &&
        current.content === content
        ? null
        : current);
      setVoiceReplyError({
        index,
        historyId: requestedHistoryId,
        content,
        message: getErrorMessage(error),
      });
    } finally {
      setVoiceReplyLoading(null);
    }
  }

  function editMessage(message: Message, index: number) {
    const editedMessages = messages.slice(0, index);
    setMessages(editedMessages);
    if (activeHistoryId) {
      setHistories((previous) => previous.map((history) => (
        history.id === activeHistoryId
          ? { ...history, messages: editedMessages, updatedAt: Date.now() }
          : history
      )));
    }
    setInput(message.content);
    setPendingFile(message.file || null);
    window.setTimeout(() => document.querySelector<HTMLInputElement>("input[placeholder='Ask Teller AI anything...']")?.focus(), 0);
  }

  async function submitImageEdit() {
    if (!imageEditTarget || !imageEditPrompt.trim() || monthlyChatCount >= usageLimit) return;
    const target = imageEditTarget;
    const prompt = `Edit this image: ${imageEditPrompt.trim()}`;
    setImageEditTarget(null);
    setImageEditPrompt("");
    await sendMessage(prompt, target);
  }

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (file.type.startsWith("image/")) {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        setSpeechError("Upload a JPEG, PNG, or WebP image.");
        event.currentTarget.value = "";
        return;
      }
      if (file.size > 3 * 1024 * 1024) {
        setSpeechError("Keep uploaded images under 3 MB.");
        event.currentTarget.value = "";
        return;
      }
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string") {
        setSpeechError("The selected file could not be read.");
        return;
      }
      setPendingFile({ name: file.name, type: file.type, size: file.size, dataUrl });
      setSpeechError("");
    };
    reader.onerror = () => setSpeechError("The selected file could not be read.");
    reader.readAsDataURL(file);
    event.currentTarget.value = "";
    setIsAttachmentMenuOpen(false);
  }

  const modeHistories = histories.filter((history) => (
    (history.agent === "cyber" || history.agent === "maps" ? history.agent : "teller") === activeAgent
  ));
  const activeAgentName = activeAgent === "cyber"
    ? "CyberMail"
    : activeAgent === "maps"
      ? "CyberMaps"
      : "Teller AI";
  const ActiveAgentIcon = activeAgent === "cyber"
    ? Mail
    : activeAgent === "maps"
      ? MapPinned
      : Sparkles;
  const normalizedHistorySearchQuery = historySearchQuery.trim().toLocaleLowerCase();
  const matchingModeHistories = modeHistories.filter((history) => (
    !normalizedHistorySearchQuery ||
    history.title.toLocaleLowerCase().includes(normalizedHistorySearchQuery) ||
    history.messages.some((message) => message.content.toLocaleLowerCase().includes(normalizedHistorySearchQuery))
  ));
  const visibleModeHistories = normalizedHistorySearchQuery
    ? matchingModeHistories
    : matchingModeHistories.slice(0, 6);
  const latestAssistantMessageIndex = messages.reduce(
    (latestIndex, message, index) => message.role === "assistant" ? index : latestIndex,
    -1,
  );

  return (
    <div data-theme={theme} className="flex h-screen bg-neutral-900 text-white">
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 transform border-r border-neutral-800 bg-neutral-900 p-4 transition-[transform,box-shadow,border-color] duration-300 ease-out hover:border-sky-400/20 hover:shadow-[4px_0_24px_rgba(56,189,248,0.08)] active:scale-[0.995] md:static md:translate-x-0 ${isHistoryVisible ? 'md:block' : 'md:hidden'} ${isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`} aria-hidden={!isSidebarOpen && true}>
        <div className="flex h-full flex-col">
          <div className="mb-4">
            <div className="mb-2 flex h-10 items-center justify-between">
              <Image
                src={metallicTEmblem}
                alt=""
                priority
                className="h-10 w-10 rounded-full object-cover drop-shadow-[0_0_16px_rgba(59,130,246,0.3)]"
              />
              <div className="flex">
                <button className="flex h-9 w-9 items-center justify-center rounded-md bg-neutral-800 text-neutral-300 transition hover:bg-neutral-700 hover:text-white md:hidden" onClick={() => setIsSidebarOpen(false)} aria-label="Close sidebar" title="Close sidebar">
                  <PanelLeftClose size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="hidden h-9 w-9 items-center justify-center rounded-md bg-neutral-800 text-neutral-300 transition hover:bg-neutral-700 hover:text-white md:inline-flex"
                  onClick={() => setIsHistoryVisible(false)}
                  aria-label="Hide chat history"
                  title="Hide chat history"
                >
                  <PanelLeftClose size={18} aria-hidden="true" />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={openGeneratedImageHistory}
              aria-current={isImageHistoryOpen ? "page" : undefined}
              className={`chat-image-history-button flex w-full items-center gap-2 rounded-lg px-4 py-2 text-left font-medium transition hover:bg-neutral-800 ${
                isImageHistoryOpen ? "bg-neutral-800 text-white" : "text-neutral-300"
              }`}
            >
              <Images size={18} aria-hidden="true" />
              File history
            </button>
            {/* file attach control moved to the input area (left of prompt) */}

            {/* Titles are generated automatically after the first assistant reply; removed manual button */}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto space-y-5 text-sm text-neutral-400 modern-scroll">
            <section aria-labelledby="chat-history-heading">
              {activeAgent !== "teller" && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-sky-500/10 text-sky-300">
                    <ActiveAgentIcon size={15} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-neutral-200">{activeAgentName}</p>
                    <p className="text-[10px] text-neutral-500">Independent chat history</p>
                  </div>
                </div>
              )}
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 id="chat-history-heading" className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Chat history</h2>
                <button
                  type="button"
                  aria-label={isHistorySearchOpen ? "Close chat history search" : "Search chat history"}
                  aria-expanded={isHistorySearchOpen}
                  aria-controls="chat-history-search"
                  title={isHistorySearchOpen ? "Close search" : "Search chats"}
                  onClick={() => {
                    if (isHistorySearchOpen) {
                      setIsHistorySearchOpen(false);
                      setHistorySearchQuery("");
                    } else {
                      setIsHistorySearchOpen(true);
                    }
                  }}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 transition duration-200 hover:scale-110 hover:bg-neutral-800 hover:text-white active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
                >
                  <Search size={15} aria-hidden="true" />
                </button>
              </div>
              {isHistorySearchOpen && (
                <input
                  id="chat-history-search"
                  type="search"
                  value={historySearchQuery}
                  onChange={(event) => setHistorySearchQuery(event.target.value)}
                  placeholder="Search chats and messages"
                  aria-label="Search chat history"
                  className="mb-3 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white placeholder:text-neutral-500 focus:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                />
              )}
              <button
                type="button"
                className="chat-new-button mb-3 w-full rounded-lg bg-white px-4 py-2 font-medium text-black transition-colors hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                onClick={() => createNewChat()}
              >
                New Chat
              </button>
              {hasSession && (
                <>
                  {visibleModeHistories.length === 0 && (
                    <p className="px-1">
                      {normalizedHistorySearchQuery
                        ? `No matching ${activeAgentName} chats`
                        : `No ${activeAgentName} chats yet`}
                    </p>
                  )}
                  <div className="space-y-1.5">
                    {visibleModeHistories.map((h) => (
                      <div
                        key={h.id}
                        className={`group flex items-center gap-1 rounded-lg border p-1 transition-[color,background-color,border-color,opacity] duration-200 ${
                          h.id === activeHistoryId
                            ? "chat-history-active border-sky-400/25 bg-sky-400/[0.08] shadow-[inset_2px_0_0_0_rgba(56,189,248,0.8)]"
                            : `border-white/[0.06] bg-white/[0.025] hover:border-white/10 hover:bg-white/[0.05] ${
                                loadingHistoryIds.size > 0 && !loadingHistoryIds.has(h.id)
                                  ? "opacity-40"
                                  : "opacity-100"
                              }`
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => loadHistory(h.id)}
                          aria-current={h.id === activeHistoryId ? "page" : undefined}
                          className="min-w-0 flex-1 px-2 py-1.5 text-left"
                        >
                          <span className={`flex min-w-0 items-center gap-1.5 truncate text-xs ${h.id === activeHistoryId ? "chat-history-active-title font-medium text-sky-100" : "text-neutral-200 group-hover:text-white"}`}>
                            {loadingHistoryIds.has(h.id) && (
                              <span
                                role="status"
                                aria-label={`${activeAgentName} is thinking`}
                                className="shrink-0 text-sky-400"
                              >
                                <LoaderCircle size={13} className="animate-spin" aria-hidden="true" />
                              </span>
                            )}
                            <span className="truncate">{h.title}</span>
                          </span>
                          <span className="mt-0.5 block truncate text-[10px] text-neutral-500">
                            {new Date(h.updatedAt).toLocaleString()}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteHistory(h.id)}
                          aria-label={`Delete ${h.title}`}
                          title="Delete chat"
                          className="mr-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-rose-400/10 hover:text-rose-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
                        >
                          <X size={14} aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

          </div>
          {/* Profile / user management at bottom */}
          <div className="mt-4 border-t border-neutral-800 pt-3">
            {isAuthLoading ? (
              <div className="px-3 py-2 text-sm text-neutral-400">Loading account...</div>
            ) : hasSession ? (
              <>
                <button onClick={() => setIsProfileOpen((s) => !s)} className="flex w-full items-center gap-3 rounded-md px-3 py-2 hover:bg-neutral-800">
                  <img
                    src={accountProfile.picture}
                    alt={accountProfile.name}
                    className="h-8 w-8 shrink-0 rounded-full object-cover"
                  />
                  <div className="min-w-0 text-left">
                    <div className="truncate text-white">{accountProfile.name}</div>
                    <div className="text-xs text-neutral-400">{accountProfile.email}</div>
                  </div>
                  <div className="text-neutral-400">{isProfileOpen ? '▾' : '▸'}</div>
                </button>

                {isProfileOpen && (
                  <div className="mt-2 space-y-2 text-sm">
                    <button type="button" onClick={openUserPanel} className="w-full rounded px-3 py-2 text-left hover:bg-neutral-800">Account Settings</button>
                    <button type="button" onClick={() => loginWithRedirect()} className="w-full rounded px-3 py-2 text-left hover:bg-neutral-800">Switch account</button>
                    <button type="button" onClick={() => {
                      void logout({ logoutParams: { returnTo: typeof window !== "undefined" ? window.location.origin : undefined } });
                    }} className="w-full rounded px-3 py-2 text-left hover:bg-neutral-800">Log out</button>
                  </div>
                )}
              </>
            ) : (
              <button type="button" onClick={() => loginWithRedirect()} className="w-full rounded-md bg-white px-4 py-2 text-sm font-medium text-black">
                Log in
              </button>
            )}
            {hasSession && (
              <div className="mt-3 px-3 text-xs text-neutral-400">
                {planName} plan: {monthlyChatCount}/{usageLimit} chats this month
                <span className="mt-1 block">
                  {dailyImageCount}/{dailyImageLimit} images today
                </span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {isSidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setIsSidebarOpen(false)} aria-hidden />}

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 shrink-0 border-b border-neutral-800 bg-neutral-900 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button className="flex h-10 w-10 items-center justify-center rounded-md bg-neutral-800 text-neutral-300 transition hover:bg-neutral-700 hover:text-white md:hidden" onClick={() => setIsSidebarOpen((s) => !s)} aria-label="Open chat sidebar" title="Open chat sidebar">
                <PanelLeftOpen size={20} aria-hidden="true" />
              </button>
              {!isHistoryVisible && (
                <button
                  type="button"
                  className="hidden h-10 w-10 items-center justify-center rounded-md bg-neutral-800 text-neutral-300 transition hover:bg-neutral-700 hover:text-white md:inline-flex"
                  onClick={() => setIsHistoryVisible(true)}
                  aria-label="Show chat history"
                  title="Show chat history"
                >
                  <PanelLeftOpen size={20} aria-hidden="true" />
                </button>
              )}
              {activeAgent !== "teller" && (
                <>
                  {activeAgent === "cyber" ? (
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 text-violet-200">
                      <Sparkles size={18} aria-hidden="true" />
                    </span>
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-200">
                      <MapPinned size={18} aria-hidden="true" />
                    </span>
                  )}
                  <div className="leading-tight">
                    <div className="text-sm font-semibold">{activeAgent === "cyber" ? "CyberMail" : "CyberMaps"}</div>
                    {activeAgent === "cyber" && <div className="text-xs text-neutral-400">Google Workspace assistant</div>}
                    {activeAgent === "maps" && <div className="text-xs text-neutral-400">Directions & interactive maps</div>}
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasSession && planName === "Free" && (
                <PayPalUpgradeButton
                  plan="pro-monthly"
                  className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
                >
                  Upgrade
                </PayPalUpgradeButton>
              )}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsThemeMenuOpen((open) => !open)}
                  className="theme-toggle-button flex h-10 w-10 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/70 text-neutral-300 shadow-sm transition hover:border-neutral-500 hover:bg-neutral-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                  aria-label={`Change theme, currently ${theme}`}
                  title={`Theme: ${theme}`}
                  aria-haspopup="menu"
                  aria-expanded={isThemeMenuOpen}
                >
                  {theme === "light" ? (
                    <Sun size={18} aria-hidden="true" />
                  ) : theme === "dark" ? (
                    <Moon size={18} aria-hidden="true" />
                  ) : (
                    <Monitor size={18} aria-hidden="true" />
                  )}
                </button>
                {isThemeMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Theme options"
                    className="absolute right-0 top-12 z-20 w-40 rounded-xl border border-neutral-700 bg-neutral-900/95 p-1.5 shadow-xl backdrop-blur-xl"
                  >
                    {(["auto", "dark", "light"] as Theme[]).map((option) => {
                      const ThemeOptionIcon = option === "light" ? Sun : option === "dark" ? Moon : Monitor;
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => {
                            setTheme(option);
                            setIsThemeMenuOpen(false);
                          }}
                          className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm capitalize transition ${
                            theme === option
                              ? "bg-neutral-800 text-white"
                              : "text-neutral-300 hover:bg-neutral-800"
                          }`}
                          role="menuitemradio"
                          aria-checked={theme === option}
                        >
                          <ThemeOptionIcon size={16} aria-hidden="true" />
                          <span className="flex-1">{option}</span>
                          {theme === option && <Check size={15} aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {isImageHistoryOpen ? (
          <section aria-labelledby="generated-image-history-heading" className="min-h-0 flex-1 overflow-y-auto p-4 modern-scroll">
            <div className="mx-auto max-w-6xl">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 id="generated-image-history-heading" className="text-2xl font-semibold text-white">File history</h1>
                  <p className="mt-1 text-sm text-neutral-400">Images you have generated with Teller AI.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsImageHistoryOpen(false)}
                  className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
                >
                  Back to chat
                </button>
              </div>

              {generatedImagesError && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-900/70 bg-rose-950/40 px-4 py-3 text-sm text-rose-200" role="alert">
                  <span>{generatedImagesError}</span>
                  {!hasSession && (
                    <button type="button" onClick={() => loginWithRedirect()} className="rounded-md bg-white px-3 py-1.5 font-medium text-neutral-950">
                      Log in
                    </button>
                  )}
                </div>
              )}

              {isGeneratedImagesLoading && generatedImages.length === 0 ? (
                <div className="flex items-center justify-center gap-2 py-16 text-neutral-400" role="status">
                  <LoaderCircle size={20} className="animate-spin" aria-hidden="true" />
                  Loading your images...
                </div>
              ) : generatedImages.length === 0 && !generatedImagesError ? (
                <p className="rounded-xl border border-dashed border-neutral-700 px-4 py-16 text-center text-neutral-400">
                  No generated images yet. Images you create in chat will appear here.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {generatedImages.map((image) => (
                    <article key={image.id} className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
                      <a href={image.imageUrl} target="_blank" rel="noreferrer" aria-label={`Open generated image from ${new Date(image.createdAt).toLocaleDateString()}`}>
                        <img
                          src={image.imageUrl}
                          alt="Generated image"
                          loading="lazy"
                          className="aspect-square w-full bg-neutral-950 object-contain"
                        />
                      </a>
                      <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-neutral-400">
                        <time dateTime={image.createdAt}>{new Date(image.createdAt).toLocaleString()}</time>
                        <a href={image.imageUrl} download={`teller-generated-${image.id}.png`} className="shrink-0 rounded px-2 py-1 text-neutral-200 hover:bg-neutral-800">
                          Download
                        </a>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {generatedImagesHasMore && (
                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => void loadGeneratedImages()}
                    disabled={isGeneratedImagesLoading}
                    className="rounded-lg border border-neutral-700 px-5 py-2.5 text-sm text-neutral-200 transition hover:bg-neutral-800 disabled:opacity-50"
                  >
                    {isGeneratedImagesLoading ? "Loading..." : "Load more"}
                  </button>
                </div>
              )}
            </div>
          </section>
        ) : (
          <>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 modern-scroll">
          <div className={`mx-auto min-w-0 space-y-4 ${activeAgent === "maps" ? "max-w-5xl" : "max-w-3xl"}`}>
            {activeAgent === "maps" && (
              <section className="overflow-hidden rounded-2xl border border-sky-500/20 bg-sky-500/[0.04]">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
                  <div>
                    <h2 className="flex items-center gap-2 font-semibold text-white">
                      <MapPinned size={17} className="text-sky-300" aria-hidden="true" />
                      CyberMaps live map
                    </h2>
                    <p className="mt-1 text-xs text-neutral-400">
                      {activeMapQuery
                        ? parseMapRequest(activeMapQuery).origin
                          ? `${parseMapRequest(activeMapQuery).origin} to ${parseMapRequest(activeMapQuery).destination}`
                          : parseMapRequest(activeMapQuery).destination
                        : "Ask for a place or directions to load the map."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeMapQuery && (
                      <a
                        href={getGoogleMapsLink(activeMapQuery)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-200 transition hover:bg-neutral-800"
                      >
                        Open in Google Maps
                      </a>
                    )}
                  </div>
                </div>
                {activeMapQuery && GOOGLE_MAPS_EMBED_API_KEY ? (
                  <iframe
                    key={`${activeHistoryId || "new"}-${activeMapQuery}`}
                    title={`Interactive map for ${parseMapRequest(activeMapQuery).destination}`}
                    src={getMapEmbedUrl(activeMapQuery, GOOGLE_MAPS_EMBED_API_KEY)}
                    className="h-[min(55vh,480px)] min-h-[300px] w-full border-0 bg-neutral-900"
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                ) : (
                  <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
                    <MapPinned size={34} className="text-sky-300" aria-hidden="true" />
                    <p className="max-w-xl text-sm text-neutral-300">
                      {activeMapQuery
                        ? "Add NEXT_PUBLIC_GOOGLE_MAPS_EMBED_API_KEY to .env.local and enable the Maps Embed API in Google Cloud to show the live map here."
                        : "Try “directions from Cape Town Station to Table Mountain” or search for a place."}
                    </p>
                    {activeMapQuery && (
                      <a
                        href={getGoogleMapsLink(activeMapQuery)}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-neutral-200"
                      >
                        View this in Google Maps
                      </a>
                    )}
                  </div>
                )}
              </section>
            )}
            {activeAgent === "cyber" && (
              <section className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.06] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="flex items-center gap-2 font-semibold text-white">
                      <Sparkles size={17} className="text-violet-300" aria-hidden="true" />
                      CyberMail
                    </h2>
                    <p className="mt-1 text-sm text-neutral-300">
                      Search Gmail and review your calendar. Drafts and new events always wait for your confirmation.
                    </p>
                  </div>
                  {googleConnection?.connected && hasSession ? (
                    <button
                      type="button"
                      onClick={() => void disconnectGoogleAccount()}
                      disabled={googleConnectionBusy}
                      className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                    >
                      {googleConnectionBusy ? "Disconnecting..." : "Disconnect"}
                    </button>
                  ) : hasSession && googleConnection?.configured ? (
                    <button
                      type="button"
                      onClick={() => void connectGoogleAccount()}
                      disabled={googleConnectionBusy}
                      className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-200 disabled:opacity-50"
                    >
                      {googleConnectionBusy ? "Connecting..." : "Connect Google"}
                    </button>
                  ) : !hasSession ? (
                    <button
                      type="button"
                      onClick={() => loginWithRedirect()}
                      className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-200"
                    >
                      Log in to connect
                    </button>
                  ) : googleConnection && !googleConnection.configured ? (
                    <span className="rounded-lg border border-amber-500/30 px-3 py-2 text-xs text-amber-200">
                      Setup required
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 px-2 py-2 text-sm text-neutral-400" role="status">
                      <LoaderCircle size={15} className="animate-spin" aria-hidden="true" />
                      Checking Google connection...
                    </span>
                  )}
                </div>
                {googleConnection?.connected && (
                  <div className="mt-3 flex items-center gap-2 text-sm text-emerald-300">
                    <Check size={16} aria-hidden="true" />
                    Connected as {googleConnection.email}
                  </div>
                )}
                {!googleConnection?.configured && hasSession && googleConnection && (
                  <p className="mt-3 text-xs leading-5 text-neutral-400">
                    Configure the server-side Google OAuth settings and enable Gmail, Gmail MCP, and Calendar APIs. See the setup notes in README.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-400">
                  <span className="inline-flex items-center gap-1.5"><Mail size={13} aria-hidden="true" /> Gmail read & draft</span>
                  <span className="inline-flex items-center gap-1.5"><CalendarDays size={13} aria-hidden="true" /> Calendar read & create</span>
                </div>
                {googleConnectionError && <p className="mt-3 text-sm text-rose-300" role="alert">{googleConnectionError}</p>}
                {googleConnectionNotice && <p className="mt-2 text-sm text-emerald-300" role="status">{googleConnectionNotice}</p>}
              </section>
            )}
            {messages.map((message, index) => (
              message.role === "user" && message.file ? null :
              <div
                key={index}
                className={`min-w-0 max-w-[85%] overflow-hidden rounded-[2rem] p-4 [overflow-wrap:anywhere] transition-[transform,box-shadow,background-color] duration-300 ease-out hover:scale-[1.015] active:scale-[0.99] motion-reduce:transition-none ${
                  message.role === "assistant" ? "chat-assistant-message" : ""
                } ${
                  message.role === "user"
                    ? "ml-auto bg-blue-600 shadow-md shadow-blue-950/30"
                    : index === latestAssistantMessageIndex
                      ? "mr-auto chat-assistant-active bg-gradient-to-br from-neutral-700 to-neutral-800 shadow-lg shadow-sky-950/30"
                      : "mr-auto bg-neutral-800"
                }`}
              >
                <div className="min-w-0 max-w-full text-sm leading-7 [overflow-wrap:anywhere]">
                  <FormattedMessage content={message.content} showCodeCopy={message.role === "assistant"} onCopyCode={(code) => void copyText(code, index)} />
                </div>
                {message.role === "assistant" &&
                  activeAgent === "teller" &&
                  index === messages.length - 1 &&
                  message.choices?.length ? (
                    <div className="mt-4" aria-label="Suggested answers">
                      <p className="mb-2 text-xs font-medium text-neutral-400">Choose a response</p>
                      <div className="flex flex-wrap gap-2">
                        {message.choices.map((choice) => (
                          <button
                            key={choice}
                            type="button"
                            onClick={() => void sendMessage(choice)}
                            disabled={loading || monthlyChatCount >= usageLimit}
                            className="rounded-full border border-neutral-600 bg-neutral-900/70 px-3 py-2 text-left text-xs leading-5 text-neutral-200 transition hover:border-neutral-400 hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {choice}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                {message.imageUrl && (
                  <>
                    <img
                      src={message.imageUrl}
                      alt={message.imageDescription || "Generated image"}
                      className="mt-3 max-h-[min(70vh,640px)] max-w-full rounded-md object-contain"
                    />
                    {message.role === "assistant" && (
                      <div className="mt-3 flex items-center gap-2">
                        <a
                          href={message.imageUrl}
                          download={getImageDownloadFilename(message.imageUrl, index)}
                          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-300 transition hover:bg-white/10 hover:text-white"
                        >
                          <Download size={17} aria-hidden="true" />
                          Download
                        </a>
                        {message.imageStoragePath?.startsWith("postgres:") && (
                          <button
                            type="button"
                            onClick={() => {
                              setImageEditTarget(message);
                              setImageEditPrompt("");
                            }}
                            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-300 transition hover:bg-white/10 hover:text-white"
                            aria-label="Edit image"
                            title="Edit image"
                          >
                            <Pencil size={17} aria-hidden="true" />
                            Edit
                          </button>
                        )}
                      </div>
                    )}
                    {message.imageDescription && (
                      <p className="mt-2 text-sm leading-6 text-neutral-300">
                        {message.imageDescription}
                      </p>
                    )}
                  </>
                )}
                {message.imageSearchResults?.length ? (
                  <section className="mt-4" aria-label="Image search results">
                    <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                      Images from the web
                    </h3>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {message.imageSearchResults.map((image) => (
                        <a
                          key={image.imageUrl}
                          href={image.sourcePageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="group min-w-0 overflow-hidden rounded-xl bg-neutral-900/70 transition hover:bg-neutral-800"
                          title={`View source: ${image.title}`}
                        >
                          <img
                            src={image.imageUrl}
                            alt={image.title}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="aspect-[4/3] w-full object-cover transition group-hover:scale-[1.02]"
                          />
                          <span className="block truncate px-2.5 py-2 text-xs text-neutral-300">
                            {image.title}
                          </span>
                        </a>
                      ))}
                    </div>
                  </section>
                ) : null}
                {voiceReplyPlayback?.index === index &&
                  voiceReplyPlayback.historyId === activeHistoryId &&
                  voiceReplyPlayback.content === getVoiceContent(message) && (
                    <p className="mt-3 border-l-2 border-sky-400 pl-3 text-sm leading-6 text-sky-200" role="status" aria-live="polite">
                      <span className="mr-2 text-xs font-medium uppercase tracking-wide text-sky-400">Reading</span>
                      {voiceReplyPlayback.segment}
                    </p>
                  )}
                <div className={`mt-3 flex gap-2 pt-2 opacity-70 ${message.role === "assistant" ? "" : "border-t border-white/10"}`}>
                  {message.role === "assistant" ? (
                    <>
                      <button type="button" onClick={() => void copyText(message.content, index)} className="rounded px-1 text-xl leading-none text-neutral-300 hover:text-white" aria-label={copiedMessage === index ? "Copied" : "Copy message"} title={copiedMessage === index ? "Copied" : "Copy message"}>{copiedMessage === index ? "✓" : "⧉"}</button>
                      <button
                        type="button"
                        onClick={() => void generateVoiceReply(getVoiceContent(message), index)}
                        disabled={voiceReplyLoading === index}
                        className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-neutral-300 hover:bg-white/10 hover:text-white disabled:opacity-50"
                        aria-label={voiceReplyLoading === index ? "Generating voice" : "Listen to reply"}
                        aria-busy={voiceReplyLoading === index}
                        title="Listen to reply"
                      >
                        {voiceReplyLoading === index ? (
                          <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />
                        ) : (
                          <>
                            <Volume2 size={14} aria-hidden="true" />
                            Listen
                          </>
                        )}
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => editMessage(message, index)} className="rounded px-1 text-xl leading-none text-neutral-300 hover:text-white" aria-label="Edit message" title="Edit message">✎</button>
                  )}
                  {message.pendingAction && (
                    <div className="mt-4 rounded-lg border border-amber-400/30 bg-amber-400/5 p-3 text-sm">
                      <p className="font-medium text-amber-100">
                        {message.pendingAction.type === "gmail.create_draft" ? "Create this Gmail draft?" : "Add this calendar event?"}
                      </p>
                      {message.pendingAction.type === "gmail.create_draft" ? (
                        <dl className="mt-2 space-y-1 text-neutral-300">
                          <div><dt className="inline text-neutral-500">To: </dt><dd className="inline">{String(message.pendingAction.arguments.to || "")}</dd></div>
                          <div><dt className="inline text-neutral-500">Subject: </dt><dd className="inline">{String(message.pendingAction.arguments.subject || "")}</dd></div>
                          <dd className="mt-2 whitespace-pre-wrap text-xs leading-5 text-neutral-400">{String(message.pendingAction.arguments.body || "")}</dd>
                        </dl>
                      ) : (
                        <dl className="mt-2 space-y-1 text-neutral-300">
                          <div><dt className="inline text-neutral-500">Event: </dt><dd className="inline">{String(message.pendingAction.arguments.summary || "")}</dd></div>
                          <div><dt className="inline text-neutral-500">Starts: </dt><dd className="inline">{String(message.pendingAction.arguments.start || "")}</dd></div>
                          <div><dt className="inline text-neutral-500">Ends: </dt><dd className="inline">{String(message.pendingAction.arguments.end || "")}</dd></div>
                          {typeof message.pendingAction.arguments.description === "string" && (
                            <dd className="mt-2 text-xs leading-5 text-neutral-400">{message.pendingAction.arguments.description}</dd>
                          )}
                        </dl>
                      )}
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void confirmCyberAction(index)}
                          disabled={confirmingCyberAction === message.pendingAction.id}
                          className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-neutral-950 disabled:opacity-50"
                        >
                          {confirmingCyberAction === message.pendingAction.id ? "Working..." : "Confirm"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setMessages((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, pendingAction: undefined } : item))}
                          disabled={confirmingCyberAction === message.pendingAction.id}
                          className="rounded-md border border-neutral-600 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700 disabled:opacity-50"
                        >
                          Not now
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                {voiceReplyError?.index === index &&
                  voiceReplyError.historyId === activeHistoryId &&
                  voiceReplyError.content === getVoiceContent(message) && (
                  <p className="mt-2 text-xs text-rose-300" role="alert">{voiceReplyError.message}</p>
                )}
              </div>
            ))}

            {activeAgent === "teller" &&
              messages.every((message) => message.role !== "user") &&
              messages.length > 0 && (
                <section aria-label="Example prompts" className="rounded-2xl border border-sky-400/15 bg-sky-400/[0.03] p-4">
                  <p className="mb-3 text-xs font-medium text-neutral-400">Try asking Teller AI</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "Explain how black holes form in simple terms",
                      "Help me plan a relaxing weekend in Cape Town",
                      "Show me a picture of the Orion Nebula",
                    ].map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendMessage(prompt)}
                        disabled={loading || monthlyChatCount >= usageLimit}
                        className="rounded-full border border-neutral-600 bg-neutral-900/70 px-3 py-2 text-left text-xs leading-5 text-neutral-200 transition hover:border-sky-400/50 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </section>
              )}

            {loading && activeAgent === "teller" && researchSites.length > 0 && (
              <div
                className="mr-auto mb-2 flex max-w-[85%] flex-wrap items-center gap-2"
                role="status"
                aria-label="Websites being researched"
              >
                <span className="text-xs text-neutral-400">Researching</span>
                {researchSites.map((site) => (
                  <span
                    key={site}
                    title={site}
                    className="inline-flex max-w-48 items-center gap-1.5 rounded-full bg-neutral-800/80 px-2 py-1 text-[11px] text-neutral-300"
                  >
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(site)}&sz=32`}
                      alt=""
                      width={16}
                      height={16}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-4 w-4 shrink-0 rounded-sm"
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                      }}
                    />
                    <span className="truncate">{site}</span>
                  </span>
                ))}
              </div>
            )}
            {loading && (
              <div
                className="mr-auto flex max-w-[85%] items-center gap-3 rounded-xl bg-neutral-800 p-4 [overflow-wrap:anywhere]"
                role="status"
              >
                {isGeneratingImage ? (
                  <>
                    <span className="pixel-loader" aria-hidden="true">
                      {Array.from({ length: 16 }, (_, index) => (
                        <span className="pixel-loader__pixel" key={index} />
                      ))}
                    </span>
                    <span>Creating your image...</span>
                  </>
                ) : (
                  activeAgent === "cyber"
                    ? "CyberMail is working..."
                    : activeAgent === "maps"
                      ? "CyberMaps is working..."
                      : "Teller AI is thinking..."
                )}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="sticky bottom-3 z-20 px-3 py-2 sm:px-6 sm:py-3">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-[2rem] border border-neutral-700/80 bg-neutral-900/95 p-2 shadow-[0_16px_48px_rgba(0,0,0,0.45)] backdrop-blur-2xl transition-colors focus-within:border-neutral-500">
                {pendingFile && (
                  <div className="mb-1 flex min-w-0 items-center gap-2 px-3 pt-1 text-xs text-neutral-300">
                    <Paperclip size={14} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{pendingFile.name}</span>
                    <button
                      type="button"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-800 hover:text-white"
                      onClick={() => setPendingFile(null)}
                      aria-label="Remove attachment"
                      title="Remove attachment"
                    >
                      <X size={15} aria-hidden="true" />
                    </button>
                  </div>
                )}
                <div className="flex min-w-0 items-end gap-2">
                <div className="relative order-2 shrink-0 self-center">
                  <button
                    type="button"
                    onClick={() => setIsModeMenuOpen((open) => !open)}
                    disabled={loading || isRecording || isTranscribing}
                    className="flex h-10 items-center gap-2 rounded-full border border-neutral-700 px-3 text-xs font-medium text-neutral-200 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Mode: ${activeAgent === "cyber" ? "CyberMail" : activeAgent === "maps" ? "CyberMaps" : "Teller AI"}`}
                    aria-haspopup="menu"
                    aria-expanded={isModeMenuOpen}
                  >
                    <span className="max-w-32 truncate font-bold text-white">
                      {activeAgent === "cyber" ? "CyberMail" : activeAgent === "maps" ? "CyberMaps" : "Teller AI"}
                    </span>
                    <span aria-hidden="true">▾</span>
                  </button>
                  {isModeMenuOpen && (
                    <div className="absolute bottom-12 left-0 z-30 w-56 rounded-xl border border-neutral-700 bg-neutral-900 p-1 shadow-xl" role="menu" aria-label="Choose chat mode">
                      {([
                        { id: "teller", label: "Teller AI", description: "General chat" },
                        { id: "cyber", label: "CyberMail", description: "Gmail & Calendar" },
                        { id: "maps", label: "CyberMaps", description: "Directions & live map" },
                      ] as const).map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={activeAgent === mode.id}
                          disabled={loading || isRecording || isTranscribing}
                          onClick={() => switchMode(mode.id)}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50 ${
                            activeAgent === mode.id ? "bg-neutral-800 text-white" : "text-neutral-300"
                          }`}
                        >
                          <span>
                            <span className="block text-sm font-bold">{mode.label}</span>
                            <span className="block text-xs text-neutral-500">{mode.description}</span>
                          </span>
                          {activeAgent === mode.id && <Check size={16} aria-hidden="true" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative order-1 shrink-0 self-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    disabled={!hasSession || loading}
                    onChange={handleFileSelection}
                  />
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    disabled={!hasSession || loading}
                    onChange={handleFileSelection}
                  />
                  <button
                    type="button"
                    onClick={() => setIsAttachmentMenuOpen((open) => !open)}
                    disabled={!hasSession || loading}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-600 disabled:opacity-60"
                    aria-label="Add attachment"
                    aria-haspopup="menu"
                    aria-expanded={isAttachmentMenuOpen}
                    title={hasSession ? "Add attachment" : "Log in to attach files"}
                  >
                    <Paperclip size={20} aria-hidden="true" />
                  </button>
                  {isAttachmentMenuOpen && hasSession && (
                    <div className="absolute bottom-12 left-0 z-30 w-44 rounded-xl border border-neutral-700 bg-neutral-900 p-1 shadow-xl" role="menu" aria-label="Add attachment">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsAttachmentMenuOpen(false);
                          fileInputRef.current?.click();
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-neutral-200 transition hover:bg-neutral-800"
                      >
                        <Paperclip size={16} aria-hidden="true" />
                        Upload a file
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsAttachmentMenuOpen(false);
                          cameraInputRef.current?.click();
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-neutral-200 transition hover:bg-neutral-800"
                      >
                        <Camera size={16} aria-hidden="true" />
                        Take a photo
                      </button>
                    </div>
                  )}
                </div>

                {isRecording || isTranscribing ? (
                  <div
                    className="order-3 flex h-11 min-w-0 flex-1 items-center gap-3 px-2 text-sm text-neutral-300"
                    role="status"
                    aria-live="polite"
                  >
                    {isRecording ? (
                      <>
                        <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden="true" />
                        <span className="shrink-0">Recording</span>
                        <span className="flex h-7 min-w-0 flex-1 items-center justify-center gap-1" aria-label="Audio recording in progress">
                          {[0.3, 0.55, 0.8, 0.45, 1, 0.65, 0.4, 0.75, 0.5].map((height, index) => (
                            <span
                              key={index}
                              className="voice-audio-bar"
                              style={{ height: `${height * 100}%`, animationDelay: `${index * 90}ms` }}
                            />
                          ))}
                        </span>
                      </>
                    ) : (
                      <span>Transcribing audio...</span>
                    )}
                  </div>
                ) : (
                  <textarea
                    ref={promptInputRef}
                    rows={1}
                    className="order-3 max-h-[45vh] min-h-11 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-3 text-sm leading-5 text-white outline-none placeholder:text-neutral-500"
                    placeholder={activeAgent === "cyber" ? "Ask CyberMail about Gmail or your calendar..." : activeAgent === "maps" ? "Search for a place or ask for directions..." : "Ask Teller AI anything..."}
                    value={input}
                    disabled={loading}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                    aria-label={`Message ${activeAgent === "cyber" ? "CyberMail" : activeAgent === "maps" ? "CyberMaps" : "Teller AI"}`}
                  />
                )}

                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  disabled={(!hasSession && !isRecording) || loading || isStartingRecording || isTranscribing}
                  className={`order-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400 ${isRecording ? "bg-red-500 text-white hover:bg-red-400" : "text-neutral-300 hover:bg-neutral-800 hover:text-white"}`}
                  aria-label={isStartingRecording ? "Starting microphone" : isRecording ? "Stop recording" : "Transcribe voice input"}
                  title={isStartingRecording ? "Starting microphone" : isRecording ? "Stop recording" : "Transcribe voice input"}
                  aria-pressed={isRecording}
                >
                  {isStartingRecording
                    ? <LoaderCircle size={20} className="animate-spin" aria-hidden="true" />
                    : <Mic size={20} aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  onClick={() => void sendMessage()}
                  disabled={loading || isTranscribing || (!input.trim() && !pendingFile)}
                  className="order-5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-neutral-950 transition-colors hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
                  aria-label="Send message"
                  title="Send message"
                >
                  <ArrowUp size={21} strokeWidth={2.5} aria-hidden="true" />
                </button>
                </div>
                {speechError && <p className="px-3 pt-2 text-xs text-rose-300" role="alert">{speechError}</p>}
            </div>
            <p className="px-3 pt-2 text-center text-xs text-neutral-500">
              Teller AI can make mistakes, just like ChatGPT. Check important information.{" "}
              {hasSession
                ? "To save a memory, start a message with “Remember that…”"
                : "Sign in to save personal memories."}
            </p>
          </div>
        </div>
          </>
        )}
      </main>
      {imageEditTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="image-edit-dialog-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setImageEditTarget(null);
                setImageEditPrompt("");
              }
            }}
            className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h2 id="image-edit-dialog-title" className="text-sm font-semibold text-white">Edit image</h2>
              <button
                type="button"
                onClick={() => {
                  setImageEditTarget(null);
                  setImageEditPrompt("");
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-300 transition hover:bg-white/10 hover:text-white"
                aria-label="Close image editor"
                title="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="min-h-0 overflow-auto bg-black/20 p-3 sm:p-5">
              <img
                src={imageEditTarget.imageUrl}
                alt={imageEditTarget.imageDescription || "Image selected for editing"}
                className="mx-auto max-h-[min(68vh,720px)] max-w-full object-contain"
              />
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitImageEdit();
              }}
              className="border-t border-white/10 p-4"
            >
              <label htmlFor="image-edit-prompt" className="mb-2 block text-xs font-medium text-neutral-300">
                Describe the changes you want
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <textarea
                  id="image-edit-prompt"
                  autoFocus
                  rows={2}
                  value={imageEditPrompt}
                  onChange={(event) => setImageEditPrompt(event.target.value)}
                  placeholder="What would you like to change?"
                  className="min-h-12 min-w-0 flex-1 resize-y rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-sky-400"
                />
                <button
                  type="submit"
                  disabled={loading || monthlyChatCount >= usageLimit || !imageEditPrompt.trim()}
                  className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 text-sm font-semibold text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Pencil size={16} aria-hidden="true" />
                  Generate edit
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
