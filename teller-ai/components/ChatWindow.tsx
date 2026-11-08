"use client";

import { useAppAuth } from "@/components/Auth0Provider";
import PayPalUpgradeButton from "@/components/PayPalUpgradeButton";
import {
  ArrowUp,
  ArrowLeft,
  CalendarDays,
  Check,
  Images,
  LoaderCircle,
  MapPinned,
  Mail,
  Mic,
  Paperclip,
  Sparkles,
  X,
} from "lucide-react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { encodeAudioChunksToWav } from "@/lib/recording-audio";

type Message = {
  role: "user" | "assistant";
  content: string;
  pendingAction?: CyberPendingAction;
  imageUrl?: string;
  imageStoragePath?: string;
  imageDescription?: string;
  file?: {
    name: string;
    type: string;
    size: number;
    dataUrl: string;
    storagePath?: string;
  } | null;
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

function getModeGreeting(agent: AgentMode) {
  if (agent === "cyber") {
    return "Hi, I’m CyberMail. Connect your Google account to search and summarize Gmail, review your calendar, create email drafts, and propose calendar events. I’ll ask before creating drafts or events.";
  }
  if (agent === "maps") {
    return "Hi, I’m CyberMaps. Ask me to find a place or get directions, for example “directions from Cape Town Station to Table Mountain by transit.” The live map will update alongside our chat.";
  }
  return "Hi, I’m Teller AI. Ask me anything — I can help with research, writing, business, coding, summaries, and ideas.";
}

function isImageGenerationPrompt(prompt: string) {
  return /\b(?:pic|picture|image|photo|artwork|illustration)\b/i.test(prompt) &&
    /\b(?:make|create|generate|draw|design|show|of|for|with|turn)\b/i.test(prompt);
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
    /^\s*(?:(?:please|can you|could you|would you)\s+)*(?:make|change|turn)\s+(?:the|its|their)\s+(?:background|sky|lighting|colors?|colours?|clothing|outfit|subject|character|style|composition)\b/i.test(prompt) ||
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

        segment.split("\n").forEach((line, lineIndex) => {
          const heading = line.match(/^(#{1,3})\s+(.+)$/);
          const bullet = line.match(/^\s*[-*]\s+(.+)$/);
          const numbered = line.match(/^\s*\d+\.\s+(.+)$/);
          if (heading) output.push(<h3 key={`${index}-${segmentIndex}-${lineIndex}`} className="mt-3 text-base font-semibold text-white">{renderInlineMarkdown(heading[2])}</h3>);
          else if (bullet) output.push(<div key={`${index}-${segmentIndex}-${lineIndex}`} className="pl-4 before:mr-2 before:content-['•']">{renderInlineMarkdown(bullet[1])}</div>);
          else if (numbered) output.push(<div key={`${index}-${segmentIndex}-${lineIndex}`} className="pl-4">{renderInlineMarkdown(line.trim())}</div>);
          else output.push(<span key={`${index}-${segmentIndex}-${lineIndex}`}>{renderInlineMarkdown(line)}{lineIndex < segment.split("\n").length - 1 && <br />}</span>);
        });
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
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "Hi, I’m Teller AI. Ask me anything — I can help with research, writing, business, coding, summaries, and ideas.",
    },
  ]);

  const [histories, setHistories] = useState<HistoryItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<AgentMode>("teller");
  const [activeMapQuery, setActiveMapQuery] = useState("");
  const historyHydratedRef = useRef(false);
  const agentQueryHandledRef = useRef(false);

  const [input, setInput] = useState("");
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [speechPreview, setSpeechPreview] = useState("");
  const [speechError, setSpeechError] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const voicePressActiveRef = useRef(false);
  const suppressClickRef = useRef(false);
  const isRecordingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechTranscriptRef = useRef("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHistoryVisible, setIsHistoryVisible] = useState(true);
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
  const [isMounted, setIsMounted] = useState(false);
  const { user, isAuthenticated, isLoading: isAuthLoading, loginWithRedirect, logout, getAccessTokenSilently } = useAppAuth();
  const authReady = isMounted && !isAuthLoading;
  const hasSession = authReady && isAuthenticated;
  const [monthlyChatCount, setMonthlyChatCount] = useState(0);
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
      user?.picture ||
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80",
    isAuthenticated,
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

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
  }, [messages, loading, speechPreview, isRecording, isTranscribing]);

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
      setActiveHistoryId(null);
      setActiveAgent("teller");
      setActiveMapQuery("");
      setMessages([
        {
          role: "assistant",
          content:
            "Hi, I’m Teller AI. Ask me anything — I can help with research, writing, business, coding, summaries, and ideas.",
        },
      ]);
      if (!isAuthenticated) {
        const initialMessages: Message[] = [
          {
            role: "assistant",
            content:
              "Hi, I’m Teller AI. Ask me anything — I can help with research, writing, business, coding, summaries, and ideas.",
          },
        ];
        const initial: HistoryItem = {
          id: Date.now().toString(),
          title: "New chat",
          messages: initialMessages,
          updatedAt: Date.now(),
        };
        setHistories([initial]);
        setActiveHistoryId(initial.id);
        setMessages(initialMessages);
        setActiveAgent("teller");
        setActiveMapQuery("");
        setMonthlyChatCount(0);
        historyHydratedRef.current = true;
        return;
      }

      getAccessTokenSilently()
        .then((token) => fetch("/api/account/history", { headers: { Authorization: `Bearer ${token}` } }))
        .then(async (response) => {
          if (!response.ok) throw new Error("Could not load remote history.");
          const data = await response.json();
          if (!Array.isArray(data.history)) throw new Error("Invalid remote history.");
          const remoteHistories = data.history as HistoryItem[];
          if (remoteHistories.length) {
            setHistories(remoteHistories);
            setActiveHistoryId(remoteHistories[0].id);
            setMessages(remoteHistories[0].messages);
            setActiveAgent(remoteHistories[0].agent === "cyber" || remoteHistories[0].agent === "maps" ? remoteHistories[0].agent : "teller");
            setActiveMapQuery(typeof remoteHistories[0].mapQuery === "string" ? remoteHistories[0].mapQuery : "");
          } else {
            const initialMessages: Message[] = [
              {
                role: "assistant",
                content:
                  "Hi, I’m Teller AI. Ask me anything — I can help with research, writing, business, coding, summaries, and ideas.",
              },
            ];
            const initial: HistoryItem = {
              id: Date.now().toString(),
              title: "New chat",
              messages: initialMessages,
              updatedAt: Date.now(),
            };
            setHistories([initial]);
            setActiveHistoryId(initial.id);
            setMessages(initialMessages);
            setActiveAgent("teller");
            setActiveMapQuery("");
          }
        })
        .catch(() => {
          setHistories([]);
          setActiveHistoryId(null);
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
      .then((token) => fetch("/api/account", { headers: { Authorization: `Bearer ${token}` } }))
      .then((response) => (response.ok ? response.json() : null))
      .then((account) => {
        if (!account) return;
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
      setActiveHistoryId(modeHistory.id);
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
      setActiveHistoryId(id);
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

    setActiveHistoryId(modeHistory.id);
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
    setActiveHistoryId(id);
    setActiveAgent(agent);
    setActiveMapQuery("");
    setMessages(initialMessages);
    setIsSidebarOpen(false);
  }

  function openUserPanel() {
    const userPanelUrl = `${window.location.origin}/Settings`;
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
          setActiveHistoryId(nextModeHistory.id);
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
          setActiveHistoryId(newId);
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
    setActiveHistoryId(id);
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

  async function sendMessage(messageText = input) {
    if (!messageText.trim()) return;
    if (monthlyChatCount >= usageLimit) return;

    const userMessage: Message = {
      role: "user",
      content: messageText.trim(),
      file: pendingFile,
    };

    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setInput("");
    setSpeechPreview("");
    setLoading(true);
    setIsModeMenuOpen(false);
    if (activeAgent === "maps") {
      setActiveMapQuery(userMessage.content);
      if (activeHistoryId) {
        setHistories((previous) => previous.map((history) => (
          history.id === activeHistoryId
            ? { ...history, agent: "maps", mapQuery: userMessage.content }
            : history
        )));
      }
    }

    try {
      if (activeAgent === "cyber") {
        if (pendingFile) throw new Error("CyberMail currently works with Gmail and Calendar, not file attachments. Remove the attachment and try again.");
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
        setMessages(nextMessages);
        if (activeHistoryId) {
          setHistories((previous) => previous.map((history) => (
            history.id === activeHistoryId
              ? { ...history, agent: "cyber", messages: nextMessages, updatedAt: Date.now() }
              : history
          )));
        }
        return;
      }
      if (activeAgent === "maps" && pendingFile) {
        throw new Error("CyberMaps works with locations and directions, not file attachments. Remove the attachment and try again.");
      }

      const hasImageUpload = Boolean(pendingFile?.type.startsWith("image/"));
      const currentVisualDirection = extractVisualDetails(userMessage.content);
      const previousAssistantVisualDirection = updatedMessages
        .slice(0, -1)
        .reverse()
        .find((message) => message.role === "assistant")
        ?.content;
      const previousVisualDirection = previousAssistantVisualDirection
        ? extractVisualDetails(previousAssistantVisualDirection)
        : null;
      const previousGeneratedImage = !pendingFile
        ? updatedMessages.slice(0, -1).reverse().find((message) => (
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
      const shouldGenerateImage = hasImageUpload
        ? isImageModificationPrompt(userMessage.content)
        : !pendingFile && (
            Boolean(currentVisualDirection) ||
            isImageGenerationPrompt(userMessage.content) ||
            Boolean(previousVisualDirection && isImageGenerationPrompt(userMessage.content)) ||
            shouldEditGeneratedImage ||
            shouldCreateImageVariation
          );

      if (shouldGenerateImage) {
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
            historyId: activeHistoryId,
            ...(hasImageUpload ? { referenceImage: pendingFile?.dataUrl } : {}),
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
        setMessages([...updatedMessages, assistantMessage]);
        if (activeHistoryId) {
          setHistories((previous) => previous.map((history) => (
            history.id === activeHistoryId
              ? { ...history, messages: [...updatedMessages, assistantMessage], updatedAt: Date.now() }
              : history
          )));
        }
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
          agent: activeAgent,
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

      const data = await response.json();

      const hasServerUsageCount = Number.isInteger(data.usageCount);
      if (hasServerUsageCount) {
        setMonthlyChatCount(data.usageCount);
      }

      if (data.reply) {
        if (isAuthenticated && !hasServerUsageCount) {
          setMonthlyChatCount((count) => count + 1);
        }
        const assistantMessage: Message = { role: "assistant", content: data.reply, file: null };
        setMessages([...updatedMessages, assistantMessage]);

        // If the server returned a suggested title, update the active history
        if (data.title && activeHistoryId) {
          setHistories((prev) => {
            const next = prev.slice();
            const idx = next.findIndex((h) => h.id === activeHistoryId);
            if (idx !== -1) {
              next[idx] = {
                ...next[idx],
                title: data.title,
                messages: [...updatedMessages, assistantMessage],
                updatedAt: Date.now(),
              };
              const item = next.splice(idx, 1)[0];
              next.unshift(item);
            } else {
              next.unshift({ id: activeHistoryId, title: data.title, messages: [...updatedMessages, assistantMessage], updatedAt: Date.now() });
            }
            return next;
          });
        } else if (activeHistoryId) {
          // If the active history still has the default title, generate one now
          const current = histories.find((h) => h.id === activeHistoryId);
          if (current && (!current.title || current.title === "New chat")) {
            (async () => {
              try {
                const res = await fetch("/api/title", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    messages: [
                      ...updatedMessages.map((msg) => ({
                        role: msg.role,
                        content: msg.file
                          ? `${msg.content || ""}\n[Attachment: ${msg.file.name} (${msg.file.type}; ${msg.file.size} bytes)]`
                          : msg.content,
                      })),
                      { role: "assistant", content: data.reply },
                    ],
                  }),
                });
                const d = await res.json();
                if (d.title) {
                  setHistories((prev) => {
                    const next = prev.slice();
                    const idx = next.findIndex((h) => h.id === activeHistoryId);
                    if (idx !== -1) {
                      next[idx] = { ...next[idx], title: d.title, messages: [...updatedMessages, { role: "assistant", content: data.reply }], updatedAt: Date.now() };
                      const item = next.splice(idx, 1)[0];
                      next.unshift(item);
                    }
                    return next;
                  });
                }
              } catch (e) {}
            })();
          }
        }
      } else {
        setMessages([...updatedMessages, { role: "assistant", content: "Sorry, something went wrong.", file: null }]);
      }
    } catch (err) {
      const errorMessage = getErrorMessage(err) || "Network error. Please try again.";
      setMessages([...updatedMessages, { role: "assistant", content: errorMessage, file: null }]);
    } finally {
      setLoading(false);
      setPendingFile(null);
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
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setSpeechError("Voice recording is not supported in this browser.");
      return;
    }

    const typedPrefix = input.trim();
    speechTranscriptRef.current = "";
    setSpeechError("");
    setSpeechPreview(typedPrefix);

    let stream: MediaStream | null = null;
    try {
      const activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream = activeStream;
      if (!voicePressActiveRef.current) {
        activeStream.getTracks().forEach((track) => track.stop());
        return;
      }

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
          setSpeechPreview([typedPrefix, transcript.trim()].filter(Boolean).join(" "));
        };
        recognition.onerror = () => {
          setSpeechError("Live captions stopped. The recording will still be transcribed when you release.");
        };
        speechRecognitionRef.current = recognition;
        try {
          recognition.start();
        } catch {
          speechRecognitionRef.current = null;
          setSpeechError("Live captions are unavailable; the recording will be transcribed when you release.");
        }
      } else {
        setSpeechError("Live captions are unavailable; the recording will be transcribed when you release.");
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

        if (!chunks.length) {
          setIsTranscribing(false);
          setSpeechPreview("");
          setSpeechError("No audio was recorded. Hold the button while speaking and try again.");
          return;
        }

        setIsTranscribing(true);
        setSpeechPreview((preview) => preview || "Transcribing audio...");
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
          setSpeechPreview("");
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
      setIsRecording(true);
      setSpeechPreview(typedPrefix);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      isRecordingRef.current = false;
      setIsRecording(false);
      setSpeechPreview("");
      setSpeechError(error instanceof Error && error.name === "NotAllowedError"
        ? "Allow microphone access to use voice input."
        : "Could not start voice recording. Please try again.");
    }
  }

  function beginHoldToSpeak() {
    if (loading || isTranscribing) return;
    voicePressActiveRef.current = true;
    suppressClickRef.current = false;
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      if (!voicePressActiveRef.current) return;
      suppressClickRef.current = true;
      void startVoiceInput();
    }, 300);
  }

  function finishHoldToSpeak() {
    voicePressActiveRef.current = false;
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    try {
      speechRecognitionRef.current?.stop();
    } catch {
      speechRecognitionRef.current = null;
    }
    if (isRecordingRef.current && mediaRecorderRef.current?.state === "recording") {
      isRecordingRef.current = false;
      setIsRecording(false);
      mediaRecorderRef.current.stop();
    }
  }

  async function copyText(text: string, index: number) {
    await navigator.clipboard.writeText(text);
    setCopiedMessage(index);
    window.setTimeout(() => setCopiedMessage((current) => current === index ? null : current), 1400);
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

  const modeHistories = histories.filter((history) => (
    (history.agent === "cyber" || history.agent === "maps" ? history.agent : "teller") === activeAgent
  ));

  return (
    <div data-theme={theme} className="flex h-screen bg-neutral-950 text-white">
      <aside className={`fixed inset-y-0 left-0 z-40 w-72 transform border-r border-neutral-800 bg-neutral-900 p-4 transition-transform duration-200 md:static md:translate-x-0 ${isHistoryVisible ? 'md:block' : 'md:hidden'} ${isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`} aria-hidden={!isSidebarOpen && true}>
        <div className="flex h-full flex-col">
          <div className="mb-4">
            <h1 className="relative mb-2 flex items-center justify-center text-2xl font-bold">
              <img src="/jupiter-black.svg" alt="Jupiter" className="h-16 w-16 object-contain" />
              <button className="absolute right-0 rounded bg-neutral-800 px-2 py-1 text-sm md:hidden" onClick={() => setIsSidebarOpen(false)} aria-label="Close sidebar">
                ✕
              </button>
            </h1>

            <button className="mb-2 w-full rounded-lg bg-white px-4 py-2 font-medium text-black" onClick={() => createNewChat()}>
              New Chat
            </button>
            <button
              type="button"
              onClick={openGeneratedImageHistory}
              aria-current={isImageHistoryOpen ? "page" : undefined}
              className={`flex w-full items-center gap-2 rounded-lg px-4 py-2 text-left font-medium transition hover:bg-neutral-800 ${
                isImageHistoryOpen ? "bg-neutral-800 text-white" : "text-neutral-300"
              }`}
            >
              <Images size={18} aria-hidden="true" />
              History
            </button>
            {/* file attach control moved to the input area (left of prompt) */}

            {/* Titles are generated automatically after the first assistant reply; removed manual button */}
          </div>

          {hasSession && (
            <div className="min-h-0 flex-1 overflow-y-auto space-y-5 text-sm text-neutral-400 modern-scroll">
              <section aria-labelledby="chat-history-heading">
                <h2 id="chat-history-heading" className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">Chat history</h2>
                {modeHistories.length === 0 && <p className="px-1">No chats yet</p>}
                <div className="space-y-2">
                  {modeHistories.slice(0, 6).map((h) => (
                    <div key={h.id} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') loadHistory(h.id); }} onClick={() => loadHistory(h.id)} className={`flex items-center justify-between w-full rounded-md px-3 py-2 hover:bg-neutral-800 ${h.id === activeHistoryId ? "bg-neutral-800" : ""}`}>
                      <div className="min-w-0">
                        <div className="truncate text-white">{h.title}</div>
                        <div className="mt-1 text-xs text-neutral-400">{new Date(h.updatedAt).toLocaleString()}</div>
                      </div>
                      <div className="ml-2 flex-shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); deleteHistory(h.id); }} className="rounded px-2 py-1 text-xs bg-neutral-800">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

            </div>
          )}
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
        <header className="sticky top-0 z-30 shrink-0 border-b border-neutral-800 bg-neutral-950/95 p-4 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button className="flex h-10 w-10 items-center justify-center rounded-md bg-neutral-800 transition hover:bg-neutral-700 md:hidden" onClick={() => setIsSidebarOpen((s) => !s)} aria-label="Open chat menu" title="Open chat menu">
                <img src="/jupiter-black.svg" alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
              </button>
              <button className="hidden h-10 w-10 items-center justify-center rounded-md bg-neutral-800 transition hover:bg-neutral-700 md:inline-flex" onClick={() => setIsHistoryVisible((v) => !v)} aria-label="Toggle history visibility" title="Toggle chat history">
                <img src="/jupiter-black.svg" alt="" aria-hidden="true" className="h-7 w-7 object-contain" />
              </button>
              {activeAgent === "cyber" ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 text-violet-200">
                  <Sparkles size={18} aria-hidden="true" />
                </span>
              ) : activeAgent === "maps" ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-200">
                  <MapPinned size={18} aria-hidden="true" />
                </span>
              ) : (
                <img src="/jupiter-black.svg" alt="Teller AI" className="h-8 w-8 object-contain" />
              )}
              <div className="leading-tight">
                <div className="text-sm font-semibold">{activeAgent === "cyber" ? "CyberMail" : activeAgent === "maps" ? "CyberMaps" : "Teller AI"}</div>
                {activeAgent === "cyber" && <div className="text-xs text-neutral-400">Google Workspace assistant</div>}
                {activeAgent === "maps" && <div className="text-xs text-neutral-400">Directions & interactive maps</div>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasSession && planName === "Free" && (
                <PayPalUpgradeButton
                  plan="pro-monthly"
                  className="rounded-md bg-orange-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-400"
                >
                  Upgrade
                </PayPalUpgradeButton>
              )}
              <div className="relative">
              <button
                type="button"
                onClick={() => setIsThemeMenuOpen((open) => !open)}
                className="rounded-md bg-neutral-800 px-3 py-2 text-sm"
                aria-label="Change theme"
                aria-expanded={isThemeMenuOpen}
              >
                Theme: {theme[0].toUpperCase() + theme.slice(1)}
              </button>
              {isThemeMenuOpen && (
                <div className="absolute right-0 top-11 z-20 w-36 rounded-lg border border-neutral-700 bg-neutral-900 p-1 shadow-xl">
                  {(["auto", "dark", "light"] as Theme[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setTheme(option);
                        setIsThemeMenuOpen(false);
                      }}
                      className="block w-full rounded px-3 py-2 text-left text-sm capitalize hover:bg-neutral-800"
                    >
                      {option}
                    </button>
                  ))}
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
                  <h1 id="generated-image-history-heading" className="text-2xl font-semibold text-white">Generated image history</h1>
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
              <div key={index} className={`min-w-0 max-w-[85%] overflow-hidden rounded-xl p-4 [overflow-wrap:anywhere] ${message.role === "user" ? "ml-auto bg-blue-600" : "mr-auto bg-neutral-800"}`}>
                <div className="min-w-0 max-w-full text-sm leading-7 [overflow-wrap:anywhere]">
                  <FormattedMessage content={message.content} showCodeCopy={message.role === "assistant"} onCopyCode={(code) => void copyText(code, index)} />
                </div>
                {message.imageUrl && (
                  <>
                    <img
                      src={message.imageUrl}
                      alt={message.imageDescription || "Generated image"}
                      className="mt-3 max-h-[min(70vh,640px)] max-w-full rounded-md object-contain"
                    />
                    {message.imageDescription && (
                      <p className="mt-2 text-sm leading-6 text-neutral-300">
                        {message.imageDescription}
                      </p>
                    )}
                  </>
                )}
                <div className="mt-3 flex gap-2 border-t border-white/10 pt-2 opacity-70">
                  {message.role === "assistant" ? (
                    <>
                      <button type="button" onClick={() => void copyText(message.content, index)} className="rounded px-1 text-xl leading-none text-neutral-300 hover:text-white" aria-label={copiedMessage === index ? "Copied" : "Copy message"} title={copiedMessage === index ? "Copied" : "Copy message"}>{copiedMessage === index ? "✓" : "⧉"}</button>
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
              </div>
            ))}

            {(speechPreview || isRecording || isTranscribing) && (
              <div className="ml-auto max-w-[85%] overflow-hidden rounded-xl bg-blue-600 p-4 [overflow-wrap:anywhere]" aria-live="polite">
                <div className="text-sm leading-7">{speechPreview || (isRecording ? "Listening..." : "Transcribing audio...")}</div>
                {(isRecording || isTranscribing) && (
                  <div className="mt-3 border-t border-white/10 pt-2 text-xs text-blue-100">
                    {isRecording ? "Listening..." : "Transcribing audio..."}
                  </div>
                )}
              </div>
            )}

            {loading && (
              <div className="mr-auto max-w-[85%] rounded-xl bg-neutral-800 p-4 [overflow-wrap:anywhere]">{activeAgent === "cyber" ? "CyberMail is working..." : activeAgent === "maps" ? "CyberMaps is working..." : "Teller AI is thinking..."}</div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="sticky bottom-0 z-20 border-t border-neutral-800/70 bg-neutral-950/85 px-3 py-4 backdrop-blur-xl sm:px-6 sm:py-5">
          <div className="mx-auto max-w-3xl">
            {hasSession ? (
              <div className="rounded-[2rem] border border-neutral-700/80 bg-neutral-900/95 p-2 shadow-[0_12px_40px_rgba(0,0,0,0.35)] transition-colors focus-within:border-neutral-500">
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
                <label className="order-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white" title="Attach file">
                  <input type="file" className="hidden" onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.type.startsWith("image/")) {
                      if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
                        setSpeechError("Upload a JPEG, PNG, or WebP image.");
                        e.target.value = "";
                        return;
                      }
                      if (f.size > 3 * 1024 * 1024) {
                        setSpeechError("Keep uploaded images under 3 MB.");
                        e.target.value = "";
                        return;
                      }
                    }
                    const reader = new FileReader();
                    reader.onload = () => {
                      const dataUrl = reader.result as string;
                      setPendingFile({ name: f.name, type: f.type, size: f.size, dataUrl });
                      setSpeechError("");
                    };
                    reader.onerror = () => setSpeechError("The selected file could not be read.");
                    reader.readAsDataURL(f);
                    e.target.value = "";
                  }} />
                  <Paperclip size={20} aria-hidden="true" />
                </label>

                <textarea
                  ref={promptInputRef}
                  rows={1}
                  className="order-3 max-h-[45vh] min-h-11 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-3 text-sm leading-5 text-white outline-none placeholder:text-neutral-500"
                  placeholder={activeAgent === "cyber" ? "Ask CyberMail about Gmail or your calendar..." : activeAgent === "maps" ? "Search for a place or ask for directions..." : "Ask Teller AI anything..."}
                  value={input}
                  disabled={isRecording || isTranscribing || loading}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendMessage();
                    }
                  }}
                  aria-label={`Message ${activeAgent === "cyber" ? "CyberMail" : activeAgent === "maps" ? "CyberMaps" : "Teller AI"}`}
                />

                <button
                  type="button"
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    beginHoldToSpeak();
                  }}
                  onPointerUp={finishHoldToSpeak}
                  onPointerCancel={() => {
                    suppressClickRef.current = false;
                    finishHoldToSpeak();
                  }}
                  onClick={() => {
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    void sendMessage();
                  }}
                  disabled={loading || isTranscribing}
                  className={`order-4 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400 ${isRecording ? "bg-red-500 text-white hover:bg-red-400" : "bg-white text-neutral-950 hover:bg-neutral-200"}`}
                  aria-label={isRecording ? "Release to transcribe" : "Send message or hold to speak"}
                  title={isRecording ? "Release to transcribe" : "Click to send, hold to speak"}
                >
                  {isTranscribing ? (
                    <LoaderCircle size={20} className="animate-spin" aria-hidden="true" />
                  ) : input.trim() || pendingFile ? (
                    <ArrowUp size={21} strokeWidth={2.5} aria-hidden="true" />
                  ) : (
                    <Mic size={20} aria-hidden="true" />
                  )}
                </button>
                </div>
                {speechError && <p className="px-3 pt-2 text-xs text-rose-300" role="alert">{speechError}</p>}
              </div>
            ) : (
              <div className="space-y-2">
                <button type="button" onClick={() => loginWithRedirect()} className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-neutral-300 hover:bg-neutral-800">
                  Log in to attach files and send messages
                </button>
              </div>
            )}
          </div>
        </div>
          </>
        )}
      </main>
    </div>
  );
}
