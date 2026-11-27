"use client";

import { useAppAuth } from "@/components/Auth0Provider";
import PayPalUpgradeButton from "@/components/PayPalUpgradeButton";
import Image from "next/image";
import {
  ArrowUp,
  ArrowLeft,
  BrainCircuit,
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
  Square,
  Sun,
  Moon,
  Monitor,
  Wrench,
  Volume2,
  X,
} from "lucide-react";
import katex from "katex";
import "katex/dist/katex.min.css";
import metallicTEmblem from "../Futuristic Metallic T Emblem.png";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { encodeAudioChunksToWav } from "@/lib/recording-audio";
import { getExplicitMemoryRequest } from "@/lib/user-memory";
import { THINK_MODE_USAGE_COST } from "@/lib/plans";
import { formatTextForSpeech, splitTextForSpeech } from "@/lib/voice-format";

type Message = {
  role: "user" | "assistant";
  content: string;
  createdAt?: number;
  choices?: string[];
  pendingAction?: CyberPendingAction | ComposioPendingAction;
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
  mapEmbedUrl?: unknown;
  error?: string;
  memoryAction?: boolean;
  pendingAction?: unknown;
};

type SearchedImageResult = {
  title: string;
  imageUrl: string;
  sourcePageUrl: string;
  width?: number;
  height?: number;
};

type AgentMode = "grope" | "cyber" | "maps";
type StoredAgentMode = AgentMode | "teller";
type CyberPendingAction = {
  id: string;
  type: "gmail.create_draft" | "calendar.create_event";
  arguments: Record<string, unknown>;
};
type ComposioPendingAction = {
  id: string;
  type: "composio.multi_execute";
  actions: Array<{
    toolSlug: string;
    description: string;
    arguments: Record<string, unknown>;
  }>;
};

type HistoryItem = {
  id: string;
  title: string;
  agent?: StoredAgentMode;
  mapQuery?: string;
  mapEmbedUrl?: string | null;
  messages: Message[];
  updatedAt: number;
};

type GoogleConnectionStatus = {
  configured: boolean;
  connected: boolean;
  email: string | null;
};

function getHistoryAgent(agent: unknown): AgentMode {
  return agent === "cyber" || agent === "maps" ? agent : "grope";
}

type IntegrationToolkit = {
  slug: string;
  name: string;
  description: string;
  logo: string | null;
  connected: boolean;
  accountId?: string | null;
  autoInstalled?: boolean;
  requiresLogin?: boolean;
};

const INTEGRATION_CATEGORIES = [
  "Productivity & Workflow",
  "Developer Tools & Coding",
  "Creativity & Design",
  "Data & Analytics",
  "Business, Sales & Marketing",
  "Everyday Errands & Lifestyle",
] as const;

type IntegrationCategory = (typeof INTEGRATION_CATEGORIES)[number] | "Other";

const INTEGRATION_FAVICON_DOMAINS: Record<string, string> = {
  gmail: "gmail.com",
  googlegmail: "gmail.com",
  googledrive: "drive.google.com",
  googlecalendar: "calendar.google.com",
  googledocs: "docs.google.com",
  googlesheets: "sheets.google.com",
  notion: "notion.so",
  slack: "slack.com",
  github: "github.com",
  gitlab: "gitlab.com",
  dropbox: "dropbox.com",
  microsoftteams: "teams.microsoft.com",
  outlook: "outlook.com",
  microsoftoutlook: "outlook.com",
  onedrive: "onedrive.live.com",
  trello: "trello.com",
  asana: "asana.com",
  airtable: "airtable.com",
  linear: "linear.app",
  jira: "atlassian.com",
  figma: "figma.com",
  canva: "canva.com",
  zoom: "zoom.us",
  hubspot: "hubspot.com",
  salesforce: "salesforce.com",
  stripe: "stripe.com",
  paypal: "paypal.com",
  spotify: "spotify.com",
  youtube: "youtube.com",
  mailchimp: "mailchimp.com",
  intercom: "intercom.com",
  zendesk: "zendesk.com",
  shopify: "shopify.com",
};

function getIntegrationLogoUrl(toolkit: IntegrationToolkit) {
  if (toolkit.logo) return toolkit.logo;

  const slug = toolkit.slug.toLowerCase().replace(/[^a-z0-9]/g, "");
  const name = toolkit.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const domain = INTEGRATION_FAVICON_DOMAINS[slug] ??
    INTEGRATION_FAVICON_DOMAINS[name] ??
    `${slug || name || "app"}.com`;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

const CATEGORY_KEYWORDS: Record<Exclude<IntegrationCategory, "Other">, string[]> = {
  "Productivity & Workflow": [
    "google drive", "gdrive", "gmail", "google calendar", "googlecalendar", "gcal",
    "google docs", "googledocs", "google sheets", "googlesheets", "notion", "dropbox",
    "outlook", "todoist", "onedrive", "microsoft", "teams", "slack", "trello",
    "asana", "monday", "evernote", "airtable", "basecamp", "clickup", "confluence",
  ],
  "Developer Tools & Coding": [
    "github", "gitlab", "bitbucket", "supabase", "vercel", "softr", "base44",
    "netlify", "render", "railway", "firebase", "postgres", "mysql", "mongodb",
    "redis", "replit", "docker", "sentry", "postman", "digitalocean", "aws",
    "linear", "jira", "codesandbox", "cloudflare", "huggingface",
  ],
  "Creativity & Design": [
    "canva", "figma", "adobe", "runway", "gamma", "freepik", "unsplash",
    "midjourney", "loom", "miro", "spotify", "youtube", "picsart", "capcut",
  ],
  "Data & Analytics": [
    "snowflake", "databricks", "bigquery", "tableau", "looker", "metabase",
    "powerbi", "googleanalytics", "mixpanel", "amplitude", "segment", "mode",
    "hex", "dbt", "redash", "dune", "graph", "chart",
  ],
  "Business, Sales & Marketing": [
    "salesforce", "hubspot", "pipedrive", "zoho", "intercom", "zendesk",
    "mailchimp", "linkedin", "typeform", "calendly", "zoom", "meet", "crm",
    "marketing", "campaign", "apollo", "klaviyo", "stripe", "paypal",
  ],
  "Everyday Errands & Lifestyle": [
    "opentable", "instacart", "doordash", "uber", "booking", "lyft", "grubhub",
    "deliveroo", "yelp", "eventbrite", "airbnb", "expedia", "travel",
  ],
};

function getIntegrationCategory(toolkit: IntegrationToolkit): IntegrationCategory {
  const haystack = `${toolkit.slug} ${toolkit.name}`.toLocaleLowerCase();
  for (const category of INTEGRATION_CATEGORIES) {
    if (CATEGORY_KEYWORDS[category].some((keyword) => haystack.includes(keyword))) {
      return category;
    }
  }
  return "Other";
}

function getIntegrationDescription(toolkit: IntegrationToolkit) {
  return toolkit.description.trim() || `Connect ${toolkit.name} so Grope can work with it from chat.`;
}

function isToolkitInstalled(toolkit: IntegrationToolkit) {
  return toolkit.connected || (toolkit.autoInstalled === true && toolkit.requiresLogin !== true);
}

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

function isGoogleMapsEmbedUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "www.google.com" &&
      url.pathname.startsWith("/maps/embed");
  } catch {
    return false;
  }
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
  return getTellerGreeting();
}

function getGropeAgentMode(message: string): AgentMode {
  const normalized = message.toLowerCase();
  if (/\b(directions?|route|routes|map|maps|nearby|navigation|navigate|distance|driving|walking|cycling|transit|geocode|coordinates?|latitude|longitude)\b/.test(normalized)) {
    return "maps";
  }
  return "grope";
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

function ResearchSiteIcon({ site }: { site: string }) {
  const [useFallbackProvider, setUseFallbackProvider] = useState(false);
  const [showInitial, setShowInitial] = useState(false);
  const hostname = site.replace(/^www\./i, "");
  const faviconUrl = useFallbackProvider
    ? `https://icons.duckduckgo.com/ip3/${encodeURIComponent(hostname)}.ico`
    : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;

  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-neutral-700 text-[10px] font-semibold text-neutral-200">
      {showInitial ? (
        <span aria-hidden="true">{hostname.charAt(0).toUpperCase()}</span>
      ) : (
        <Image
          src={faviconUrl}
          alt=""
          width={16}
          height={16}
          loading="lazy"
          unoptimized
          referrerPolicy="no-referrer"
          className="h-4 w-4"
          onError={() => {
            if (useFallbackProvider) setShowInitial(true);
            else setUseFallbackProvider(true);
          }}
        />
      )}
    </span>
  );
}

function isComposioPendingAction(value: unknown): value is ComposioPendingAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const action = value as Record<string, unknown>;
  return (
    typeof action.id === "string" &&
    action.type === "composio.multi_execute" &&
    Array.isArray(action.actions) &&
    action.actions.length > 0 &&
    action.actions.every((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const nested = item as Record<string, unknown>;
      return (
        typeof nested.toolSlug === "string" &&
        typeof nested.description === "string" &&
        Boolean(nested.arguments) &&
        typeof nested.arguments === "object" &&
        !Array.isArray(nested.arguments)
      );
    })
  );
}

function isCyberPendingAction(value: unknown): value is CyberPendingAction {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const action = value as Record<string, unknown>;
  return (
    typeof action.id === "string" &&
    (action.type === "gmail.create_draft" || action.type === "calendar.create_event") &&
    typeof action.arguments === "object" &&
    action.arguments !== null &&
    !Array.isArray(action.arguments)
  );
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

function ProgressiveResponse({ content, children }: { content: string; children: ReactNode }) {
  const responseRef = useRef<HTMLDivElement | null>(null);
  const [visibleHeight, setVisibleHeight] = useState(0);

  useEffect(() => {
    const response = responseRef.current;
    if (!response) return;

    setVisibleHeight(0);
    let revealedHeight = 0;
    const lineHeight = Number.parseFloat(window.getComputedStyle(response).lineHeight) || 28;
    const fullHeight = response.scrollHeight;
    let timeoutId: number;

    const revealNextLines = () => {
      revealedHeight = Math.min(revealedHeight + lineHeight * 2, fullHeight);
      setVisibleHeight(revealedHeight);
      if (revealedHeight < fullHeight) {
        timeoutId = window.setTimeout(revealNextLines, 400);
      }
    };

    timeoutId = window.setTimeout(revealNextLines, 400);
    return () => window.clearTimeout(timeoutId);
  }, [content]);

  return (
    <div
      ref={responseRef}
      className="overflow-hidden leading-7 transition-[max-height] duration-400 ease-out motion-reduce:transition-none"
      style={{ maxHeight: `${visibleHeight}px` }}
    >
      {children}
    </div>
  );
}

function NeutronStarLoader() {
  return (
    <span className="neutron-star-loader" aria-hidden="true">
      <svg className="neutron-star-loader__cube" viewBox="0 0 96 96">
        <path d="M48 8 82 27.5v41L48 88 14 68.5v-41Z M48 8v41m34-21.5L48 49 14 27.5M48 49v39" />
      </svg>
      <span className="neutron-star-loader__orbit">
        <span className="neutron-star-loader__star neutron-star-loader__star--blue" />
        <span className="neutron-star-loader__star neutron-star-loader__star--violet" />
      </span>
    </span>
  );
}

export default function ChatWindow() {
  const { user, isAuthenticated, isLoading: isAuthLoading, loginWithRedirect, logout, getAccessTokenSilently } = useAppAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: getTellerGreeting(),
      createdAt: Date.now(),
    },
  ]);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const thinkingStatusRef = useRef<HTMLDivElement | null>(null);
  const autoScrollToThinkingHistoryRef = useRef<string | null>(null);

  const [histories, setHistories] = useState<HistoryItem[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const activeHistoryIdRef = useRef<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<AgentMode>("grope");
  const [activeMapQuery, setActiveMapQuery] = useState("");
  const historyHydratedRef = useRef(false);
  const agentQueryHandledRef = useRef(false);

  const [input, setInput] = useState("");
  const [thinkMode, setThinkMode] = useState(false);
  const [imageEditTarget, setImageEditTarget] = useState<Message | null>(null);
  const [imageEditPrompt, setImageEditPrompt] = useState("");
  const promptInputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isAttachmentMenuOpen, setIsAttachmentMenuOpen] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isStartingRecording, setIsStartingRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const loadingHistoryIdsRef = useRef(new Set<string>());
  const titleGenerationStartedRef = useRef(new Set<string>());
  const [loadingHistoryIds, setLoadingHistoryIds] = useState<Set<string>>(() => new Set());
  const [researchSitesByHistory, setResearchSitesByHistory] = useState<Record<string, string[]>>({});
  const generatingImageHistoryIdsRef = useRef(new Set<string>());
  const [generatingImageHistoryIds, setGeneratingImageHistoryIds] = useState<Set<string>>(() => new Set());
  const loading = activeHistoryId !== null && loadingHistoryIds.has(activeHistoryId);
  const researchSites = activeHistoryId ? researchSitesByHistory[activeHistoryId] || [] : [];
  const isGeneratingImage = activeHistoryId !== null && generatingImageHistoryIds.has(activeHistoryId);
  const isThinking = loading && activeAgent === "grope" && !isGeneratingImage;
  const isRecordingRef = useRef(false);
  const isStartingRecordingRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechTranscriptRef = useRef("");
  const requestControllersRef = useRef(new Map<string, AbortController>());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isHistoryVisible, setIsHistoryVisible] = useState(true);
  const [isHistorySearchOpen, setIsHistorySearchOpen] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState("");
  const [isImageHistoryOpen, setIsImageHistoryOpen] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const [integrationToolkits, setIntegrationToolkits] = useState<IntegrationToolkit[]>([]);
  const [isLoadingIntegrations, setIsLoadingIntegrations] = useState(false);
  const [integrationError, setIntegrationError] = useState("");
  const [integrationSearchQuery, setIntegrationSearchQuery] = useState("");
  const [integrationCategory, setIntegrationCategory] = useState<IntegrationCategory | "All">("All");
  const [connectingToolkit, setConnectingToolkit] = useState<string | null>(null);
  const [integrationRefreshKey, setIntegrationRefreshKey] = useState(0);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [isGeneratedImagesLoading, setIsGeneratedImagesLoading] = useState(false);
  const [generatedImagesHasMore, setGeneratedImagesHasMore] = useState(false);
  const [generatedImagesError, setGeneratedImagesError] = useState("");
  const generatedImageUrlsRef = useRef(new Set<string>());
  const generatedImageOffsetRef = useRef(0);
  const generatedImageLoadingRef = useRef(false);
  const generatedImageRetryResetRef = useRef(true);
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
  const thinkWouldExceedChatLimit = monthlyChatCount + (thinkMode ? THINK_MODE_USAGE_COST : 1) > usageLimit;
  const [, setDailyImageCount] = useState(0);
  const [, setDailyImageLimit] = useState(5);
  const [googleConnection, setGoogleConnection] = useState<GoogleConnectionStatus | null>(null);
  const [googleConnectionError, setGoogleConnectionError] = useState("");
  const [googleConnectionNotice, setGoogleConnectionNotice] = useState("");
  const [googleConnectionBusy, setGoogleConnectionBusy] = useState(false);
  const [confirmingActionId, setConfirmingActionId] = useState<string | null>(null);
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
    const historyId = autoScrollToThinkingHistoryRef.current;
    if (!historyId) return;
    if (historyId !== activeHistoryId) {
      autoScrollToThinkingHistoryRef.current = null;
      return;
    }

    const scrollContainer = messagesScrollRef.current;
    if (!scrollContainer) return;

    let lastUserMessageIndex = -1;
    messages.forEach((message, index) => {
      if (message.role === "user") lastUserMessageIndex = index;
    });
    const hasFirstResponse = messages
      .slice(lastUserMessageIndex + 1)
      .some((message) => message.role === "assistant");

    if (hasFirstResponse || !isThinking) {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior: "smooth",
      });
    } else {
      const thinkingStatus = thinkingStatusRef.current;
      if (thinkingStatus) {
        const containerTop = scrollContainer.getBoundingClientRect().top + scrollContainer.clientTop;
        const thinkingTop = scrollContainer.scrollTop +
          thinkingStatus.getBoundingClientRect().top - containerTop;
        scrollContainer.scrollTo({
          top: Math.max(0, thinkingTop - scrollContainer.clientHeight * 0.35),
          behavior: "smooth",
        });
      }
    }
    if (hasFirstResponse) autoScrollToThinkingHistoryRef.current = null;
  }, [activeAgent, activeHistoryId, isThinking, loading, messages, researchSites.length]);

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
          if (googleResult === "connected") setGoogleConnectionNotice("Google Calendar connected.");
          if (googleResult === "error") setGoogleConnectionError("Google Calendar connection did not complete. Try again.");
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
      setActiveAgent("grope");
      setActiveMapQuery("");
      setMessages([
        {
          role: "assistant",
          content: getTellerGreeting(),
          createdAt: Date.now(),
        },
      ]);
      if (!isAuthenticated) {
        const initialMessages: Message[] = [
          {
            role: "assistant",
            content: getTellerGreeting(),
            createdAt: Date.now(),
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
        setActiveAgent("grope");
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
            setActiveAgent("grope");
            setActiveMapQuery(typeof remoteHistories[0].mapQuery === "string" ? remoteHistories[0].mapQuery : "");
          } else {
            const initialMessages: Message[] = [
              {
                role: "assistant",
                content: getTellerGreeting(),
                createdAt: Date.now(),
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
            setActiveAgent("grope");
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
    setActiveAgent("grope");
  }, [histories, isAuthLoading, isMounted]);

  // Persist active history whenever messages change
  useEffect(() => {
    if (!activeHistoryId) return;
    setHistories((prev) => {
      const next = prev.slice();
      const idx = next.findIndex((h) => h.id === activeHistoryId);
      const existing = prev.find((h) => h.id === activeHistoryId);
      const updated: HistoryItem = {
        id: activeHistoryId,
        title: existing?.title || "New chat",
        agent: activeAgent,
        ...(activeMapQuery ? { mapQuery: activeMapQuery } : {}),
        ...(typeof existing?.mapEmbedUrl === "string" ? { mapEmbedUrl: existing.mapEmbedUrl } : {}),
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

  useEffect(() => {
    if (!isToolsOpen || isAuthLoading || !isAuthenticated) return;
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setIsLoadingIntegrations(true);
      setIntegrationError("");
      try {
        const token = await getAccessTokenSilently();
        const response = await fetch("/api/composio/toolkits", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load app connectors.");
        if (!Array.isArray(data.toolkits)) throw new Error("The app connector response was invalid.");
        if (!cancelled) {
          let disabledAutoInstallSlugs = new Set<string>();
          try {
            const saved = JSON.parse(window.localStorage.getItem("grope-disabled-auto-addons") || "[]");
            if (Array.isArray(saved)) disabledAutoInstallSlugs = new Set(saved.filter((slug): slug is string => typeof slug === "string"));
          } catch {
            disabledAutoInstallSlugs = new Set<string>();
          }
          setIntegrationToolkits(
            (data.toolkits as IntegrationToolkit[]).map((toolkit) => (
              disabledAutoInstallSlugs.has(toolkit.slug)
                ? { ...toolkit, autoInstalled: false }
                : toolkit
            )),
          );
        }
      } catch (error) {
        if (!cancelled) setIntegrationError(getErrorMessage(error));
      } finally {
        if (!cancelled) setIsLoadingIntegrations(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [getAccessTokenSilently, integrationRefreshKey, isAuthenticated, isAuthLoading, isToolsOpen]);

  function switchMode(mode: AgentMode) {
    setIsModeMenuOpen(false);
    if (mode === activeAgent) return;

    const modeHistory = histories.find((history) => (
      getHistoryAgent(history.agent) === mode
    ));
    if (!modeHistory) {
      createNewChat(mode);
      return;
    }

    selectHistory(modeHistory.id);
    setActiveAgent("grope");
    setActiveMapQuery(typeof modeHistory.mapQuery === "string" ? modeHistory.mapQuery : "");
    setMessages(modeHistory.messages);
    setIsSidebarOpen(false);
    setIsImageHistoryOpen(false);
    setIsToolsOpen(false);
  }

  function createNewChat(agent: AgentMode = activeAgent) {
    const id = Date.now().toString();
    const initialMessages: Message[] = [
      {
        role: "assistant",
        content: getModeGreeting(agent),
        createdAt: Date.now(),
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
    setActiveAgent("grope");
    setActiveMapQuery("");
    setMessages(initialMessages);
    setIsSidebarOpen(false);
    setIsImageHistoryOpen(false);
    setIsToolsOpen(false);
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
          getHistoryAgent(history.agent) === activeAgent
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
            createdAt: Date.now(),
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
    setActiveAgent("grope");
    setActiveMapQuery(typeof h.mapQuery === "string" ? h.mapQuery : "");
    setMessages(h.messages);
    setIsSidebarOpen(false);
    setIsImageHistoryOpen(false);
    setIsToolsOpen(false);
  }

  async function loadGeneratedImages(reset = false) {
    if (!hasSession || generatedImageLoadingRef.current) return;
    generatedImageLoadingRef.current = true;
    generatedImageRetryResetRef.current = reset;
    setIsGeneratedImagesLoading(true);
    setGeneratedImagesError("");

    try {
      const token = await getAccessTokenSilently();
      const offset = reset ? 0 : generatedImageOffsetRef.current;
      const response = await fetch(`/api/account/images?offset=${offset}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load generated images.");
      if (!Array.isArray(data.images)) throw new Error("The image history response was invalid.");

      const imagesWithBlobs = await Promise.all(
        data.images.map(async (image: { id: string; historyId: string; createdAt: string }) => {
          const imageResponse = await fetch(`/api/account/images/${encodeURIComponent(image.id)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!imageResponse.ok) {
            throw new Error(`Could not load image ${image.id}.`);
          }
          return { ...image, blob: await imageResponse.blob() };
        }),
      );
      const loadedImages = imagesWithBlobs.map(({ blob, ...image }) => {
        const imageUrl = URL.createObjectURL(blob);
        generatedImageUrlsRef.current.add(imageUrl);
        return { ...image, imageUrl } satisfies GeneratedImage;
      });

      if (reset) {
        const retainedUrls = new Set(loadedImages.map((image) => image.imageUrl));
        generatedImageUrlsRef.current.forEach((url) => {
          if (!retainedUrls.has(url)) {
            URL.revokeObjectURL(url);
            generatedImageUrlsRef.current.delete(url);
          }
        });
        setGeneratedImages(loadedImages);
      } else {
        setGeneratedImages((previous) => [...previous, ...loadedImages]);
      }
      generatedImageOffsetRef.current = offset + data.images.length;
      setGeneratedImagesHasMore(data.hasMore === true);
      generatedImageRetryResetRef.current = false;
    } catch (error) {
      setGeneratedImagesError(getErrorMessage(error));
    } finally {
      generatedImageLoadingRef.current = false;
      setIsGeneratedImagesLoading(false);
    }
  }

  function openGeneratedImageHistory() {
    setIsImageHistoryOpen(true);
    setIsToolsOpen(false);
    setIsSidebarOpen(false);
    if (!hasSession) {
      setGeneratedImagesError("Log in to view your generated images.");
      return;
    }
    void loadGeneratedImages(true);
  }

  function openGeneratedImageEditor(image: GeneratedImage) {
    const history = histories.find((item) => item.id === image.historyId);
    if (history) loadHistory(history.id);
    else createNewChat("grope");
    setImageEditTarget({
      role: "assistant",
      content: "Here’s the image you asked for.",
      imageUrl: image.imageUrl,
      imageStoragePath: `postgres:${image.id}`,
    });
    setImageEditPrompt("");
    setIsImageHistoryOpen(false);
  }

  function openTools() {
    setIsToolsOpen(true);
    setIsImageHistoryOpen(false);
    setIsSidebarOpen(false);
  }

  function uninstallAutoInstalledToolkit(toolkit: IntegrationToolkit) {
    setIntegrationToolkits((current) => current.map((item) => (
      item.slug === toolkit.slug ? { ...item, autoInstalled: false } : item
    )));
    try {
      const saved = JSON.parse(window.localStorage.getItem("grope-disabled-auto-addons") || "[]");
      const disabled = new Set(Array.isArray(saved)
        ? saved.filter((slug): slug is string => typeof slug === "string")
        : []);
      disabled.add(toolkit.slug);
      window.localStorage.setItem("grope-disabled-auto-addons", JSON.stringify(Array.from(disabled)));
    } catch {
      window.localStorage.setItem("grope-disabled-auto-addons", JSON.stringify([toolkit.slug]));
    }
  }

  async function connectComposioToolkit(toolkit: string) {
    setConnectingToolkit(toolkit);
    setIntegrationError("");
    try {
      const token = await getAccessTokenSilently();
      const response = await fetch("/api/composio/connect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ toolkit }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.redirectUrl !== "string") {
        throw new Error(data.error || "Could not start the app connection.");
      }
      window.location.assign(data.redirectUrl);
    } catch (error) {
      setIntegrationError(getErrorMessage(error));
      setConnectingToolkit(null);
    }
  }

  async function disconnectComposioToolkit(toolkit: IntegrationToolkit) {
    if (!toolkit.accountId) {
      setIntegrationError("Composio did not return an account ID for this installed app.");
      return;
    }
    setConnectingToolkit(toolkit.slug);
    setIntegrationError("");
    try {
      const token = await getAccessTokenSilently();
      const response = await fetch("/api/composio/disconnect", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ accountId: toolkit.accountId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not uninstall the app connector.");
      setIntegrationToolkits((current) => current.map((item) => (
        item.slug === toolkit.slug
          ? { ...item, connected: false, accountId: null }
          : item
      )));
    } catch (error) {
      setIntegrationError(getErrorMessage(error));
    } finally {
      setConnectingToolkit(null);
    }
  }

  function setHistoryLoading(historyId: string, isLoading: boolean) {
    const next = new Set(loadingHistoryIdsRef.current);
    if (isLoading) next.add(historyId);
    else next.delete(historyId);
    loadingHistoryIdsRef.current = next;
    setLoadingHistoryIds(next);
  }

  function stopActiveRequest() {
    if (!activeHistoryId) return;
    requestControllersRef.current.get(activeHistoryId)?.abort();
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
    const firstUserMessage = conversationMessages.find(
      (message) => message.role === "user" && message.content.trim(),
    );
    if (!firstUserMessage) return;
    const firstPromptTitle = firstUserMessage.content.slice(0, 60);
    const existingHistory = histories.find((history) => history.id === historyId);
    if (
      existingHistory?.title &&
      existingHistory.title !== "New chat" &&
      existingHistory.title !== firstPromptTitle
    ) return;
    if (titleGenerationStartedRef.current.has(historyId)) return;
    titleGenerationStartedRef.current.add(historyId);

    try {
      const token = isAuthenticated ? await getAccessTokenSilently() : null;
      const response = await fetch("/api/title", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: firstUserMessage.content }],
        }),
      });
      if (!response.ok) {
        titleGenerationStartedRef.current.delete(historyId);
        return;
      }

      const data = await response.json() as { title?: unknown };
      if (typeof data.title !== "string") {
        titleGenerationStartedRef.current.delete(historyId);
        return;
      }
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
        titleGenerationStartedRef.current.delete(historyId);
        return;
      }

      setHistories((previous) => previous.map((history) => (
        history.id === historyId
          ? { ...history, title, updatedAt: Date.now() }
          : history
      )));
    } catch (error) {
      titleGenerationStartedRef.current.delete(historyId);
      console.error("Could not generate conversation title:", error);
    }
  }

  function updateHistoryMessages(
    historyId: string | null,
    nextMessages: Message[],
    updates: Partial<Pick<HistoryItem, "agent" | "mapQuery" | "mapEmbedUrl">> = {},
  ) {
    if (!historyId) return;
    const updatedAt = Date.now();
    setHistories((previous) => previous.map((history) => (
      history.id === historyId
        ? {
            ...history,
            ...updates,
            title: history.title || "New chat",
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
    const requestAgent = getGropeAgentMode(messageText);
    const requestThinkMode = thinkMode;
    const thinkUsageLimitMessage = "Think mode uses two chats per response. Turn it off or upgrade your plan to continue.";
    const requestController = new AbortController();
    requestControllersRef.current.set(requestHistoryId, requestController);
    setResearchSitesByHistory((previous) => ({ ...previous, [requestHistoryId]: [] }));
    const requestFile = imageEditReference ? null : hasSession ? pendingFile : null;
    autoScrollToThinkingHistoryRef.current = requestHistoryId;

    const userMessage: Message = {
      role: "user",
      content: messageText.trim(),
      createdAt: Date.now(),
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
          ? { agent: "grope", mapQuery: userMessage.content, mapEmbedUrl: null }
          : { agent: "grope" },
      );
    }
    setPendingFile(null);
    setIsModeMenuOpen(false);
    const isMemoryRequest = Boolean(getExplicitMemoryRequest(userMessage.content));
    if (requestAgent === "maps" && !isMemoryRequest) {
      setActiveMapQuery(userMessage.content);
    }

    let generatedImageAssistantMessage: Message | null = null;
    try {
      if (requestAgent === "cyber") {
        if (requestFile) throw new Error("Grope currently works with Gmail and Calendar, not file attachments. Remove the attachment and try again.");
        if (
          requestThinkMode &&
          monthlyChatCount + THINK_MODE_USAGE_COST > usageLimit &&
          !isMemoryRequest
        ) {
          throw new Error(thinkUsageLimitMessage);
        }
        const token = isAuthenticated ? await getAccessTokenSilently() : null;
        const response = await fetch("/api/cyber-agent", {
          method: "POST",
          signal: requestController.signal,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            thinkMode: requestThinkMode,
            messages: updatedMessages.map(({ role, content }) => ({ role, content })),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Grope could not complete that request.");
        if (Number.isInteger(data.usageCount)) setMonthlyChatCount(data.usageCount);
        const assistantMessage: Message = {
          role: "assistant",
          content: typeof data.reply === "string" ? data.reply : "Grope completed the request.",
          createdAt: Date.now(),
          ...(isComposioPendingAction(data.pendingAction)
            ? { pendingAction: data.pendingAction }
            : isCyberPendingAction(data.pendingAction)
              ? { pendingAction: data.pendingAction }
              : {}),
        };
        const nextMessages = [...updatedMessages, assistantMessage];
        if (activeHistoryIdRef.current === requestHistoryId) setMessages(nextMessages);
        updateHistoryMessages(requestHistoryId, nextMessages, { agent: "grope" });
        return;
      }
      if (requestAgent === "maps" && requestFile) {
        throw new Error("CyberMaps works with locations and directions, not file attachments. Remove the attachment and try again.");
      }
      if (
        requestAgent === "maps" &&
        requestThinkMode &&
        monthlyChatCount + THINK_MODE_USAGE_COST > usageLimit &&
        !isMemoryRequest
      ) {
        throw new Error(thinkUsageLimitMessage);
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
      let classifiedOtherIntent = false;
      let imageIntentClassificationFailed = false;
      const useImageIntentHeuristic = (
        !isAuthenticated ||
        requestAgent !== "grope" ||
        userMessage.content.length > 4000
      );
      if (requestAgent === "grope" &&
        isAuthenticated &&
        userMessage.content.length <= 4000 &&
        (!requestFile || hasImageUpload)) {
        const token = await getAccessTokenSilently();
        let classificationResponse: Response | null = null;
        try {
          classificationResponse = await fetch("/api/images/classify", {
            method: "POST",
            signal: requestController.signal,
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
            classifiedOtherIntent = "hasOtherIntent" in classificationData &&
              classificationData.hasOtherIntent === true;
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
      const shouldHandleOtherIntent = classifiedOtherIntent || (
        imageIntentClassificationFailed &&
        shouldGenerateImage &&
        /\b(?:also|and then|then|as well as|plus)\b/i.test(userMessage.content)
      );
      if (
        requestThinkMode &&
        (!shouldGenerateImage || shouldHandleOtherIntent) &&
        monthlyChatCount + THINK_MODE_USAGE_COST > usageLimit &&
        !isMemoryRequest
      ) {
        throw new Error(thinkUsageLimitMessage);
      }

      if (shouldGenerateImage && !isAuthenticated) {
        const assistantMessage: Message = {
          role: "assistant",
          content: `Log in to generate images, then send this prompt again:\n\n${userMessage.content.trim()}`,
          createdAt: Date.now(),
        };
        const nextMessages = [...updatedMessages, assistantMessage];
        if (activeHistoryIdRef.current === requestHistoryId) setMessages(nextMessages);
        updateHistoryMessages(requestHistoryId, nextMessages, { agent: "grope" });
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
          signal: requestController.signal,
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

        generatedImageAssistantMessage = {
          role: "assistant",
          content: "Here’s the image you asked for.",
          createdAt: Date.now(),
          imageUrl: imageData.imageUrl,
          imageStoragePath: imageData.imageStoragePath,
          imageDescription: imageData.imageDescription,
        };
        void loadGeneratedImages(true);
        if (!shouldHandleOtherIntent) {
          const nextMessages = [...updatedMessages, generatedImageAssistantMessage];
          if (activeHistoryIdRef.current === requestHistoryId) setMessages(nextMessages);
          updateHistoryMessages(requestHistoryId, nextMessages, { agent: "grope" });
          return;
        }
      }

      const token = isAuthenticated ? await getAccessTokenSilently() : null;
      const shouldAskAboutGeneratedImage = Boolean(
        previousGeneratedImage &&
        !shouldGenerateImage &&
        isImageReferencePrompt(userMessage.content),
      );
      const response = await fetch("/api/chat", {
        method: "POST",
        signal: requestController.signal,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          agent: requestAgent,
          thinkMode: requestThinkMode,
          generatedImageHandled: Boolean(generatedImageAssistantMessage),
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
      if (!response.ok) throw new Error(data.error || "Teller could not complete that request.");

      const hasServerUsageCount = typeof data.usageCount === "number" && Number.isInteger(data.usageCount);
      if (typeof data.usageCount === "number" && Number.isInteger(data.usageCount)) {
        setMonthlyChatCount(data.usageCount);
      }

      if (data.reply) {
        if (isAuthenticated && !hasServerUsageCount && !data.memoryAction) {
          setMonthlyChatCount((count) => count + (requestThinkMode ? THINK_MODE_USAGE_COST : 1));
        }
        const assistantMessage: Message = {
          role: "assistant",
          content: generatedImageAssistantMessage
            ? `Generated the image you requested.\n\n${data.reply}`
            : data.reply,
          createdAt: Date.now(),
          file: null,
          ...(generatedImageAssistantMessage
            ? {
                imageUrl: generatedImageAssistantMessage.imageUrl,
                imageStoragePath: generatedImageAssistantMessage.imageStoragePath,
                imageDescription: generatedImageAssistantMessage.imageDescription,
              }
            : {}),
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
          ...(isComposioPendingAction(data.pendingAction)
            ? { pendingAction: data.pendingAction }
            : {}),
        };
        const nextMessages = [...updatedMessages, assistantMessage];
        if (activeHistoryIdRef.current === requestHistoryId) setMessages(nextMessages);
        updateHistoryMessages(requestHistoryId, nextMessages, {
          agent: "grope",
          ...(requestAgent === "maps" && isGoogleMapsEmbedUrl(data.mapEmbedUrl)
            ? { mapEmbedUrl: data.mapEmbedUrl }
            : {}),
        });
      } else {
        const nextMessages: Message[] = [
          ...updatedMessages,
          {
            ...(generatedImageAssistantMessage || {}),
            role: "assistant",
            content: generatedImageAssistantMessage
              ? "Generated the image you requested, but I could not complete the other part of your request."
              : "Sorry, something went wrong.",
            file: null,
            createdAt: Date.now(),
          },
        ];
        if (activeHistoryIdRef.current === requestHistoryId) setMessages(nextMessages);
        updateHistoryMessages(requestHistoryId, nextMessages, { agent: "grope" });
      }
    } catch (err) {
      if (requestController.signal.aborted) {
        if (generatedImageAssistantMessage) {
          const nextMessages = [...updatedMessages, generatedImageAssistantMessage];
          if (activeHistoryIdRef.current === requestHistoryId) setMessages(nextMessages);
          updateHistoryMessages(requestHistoryId, nextMessages, { agent: "grope" });
        }
        return;
      }
      const errorMessage = getErrorMessage(err) || "Network error. Please try again.";
      const nextMessages: Message[] = [
        ...updatedMessages,
        {
          ...(generatedImageAssistantMessage || {}),
          role: "assistant",
          content: generatedImageAssistantMessage
            ? `Generated the image you requested, but could not complete the other part: ${errorMessage}`
            : errorMessage,
          file: null,
          createdAt: Date.now(),
        },
      ];
      if (activeHistoryIdRef.current === requestHistoryId) setMessages(nextMessages);
      updateHistoryMessages(requestHistoryId, nextMessages, { agent: "grope" });
    } finally {
      if (requestControllersRef.current.get(requestHistoryId) === requestController) {
        requestControllersRef.current.delete(requestHistoryId);
      }
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
      setGoogleConnectionNotice("Google Calendar disconnected.");
    } catch (error) {
      setGoogleConnectionError(getErrorMessage(error));
    } finally {
      setGoogleConnectionBusy(false);
    }
  }

  async function confirmCyberAction(messageIndex: number) {
    const action = messages[messageIndex]?.pendingAction;
    if (!action || action.type === "composio.multi_execute") return;
    setConfirmingActionId(action.id);
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
      const resultAssistantMessage: Message = {
        role: "assistant",
        content: resultMessage,
        createdAt: Date.now(),
      };
      setMessages((current) => {
        const actionIndex = current.findIndex((message) => message.pendingAction?.id === action.id);
        return current.flatMap((message, index) => {
        if (index !== actionIndex) return [message];
        return [
          { ...message, pendingAction: undefined },
          resultAssistantMessage,
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
                    : [{ ...message, pendingAction: undefined }, resultAssistantMessage]
                )),
                updatedAt: Date.now(),
              }
            : history
        )));
      }
    } catch (error) {
      const resultMessage = `The confirmed action could not be completed: ${getErrorMessage(error)}`;
      const resultAssistantMessage: Message = {
        role: "assistant",
        content: resultMessage,
        createdAt: Date.now(),
      };
      setMessages((current) => current.flatMap((message) => (
        message.pendingAction?.id === action.id
          ? [{ ...message, pendingAction: undefined }, resultAssistantMessage]
          : [message]
      )));
    } finally {
      setConfirmingActionId(null);
    }
  }

  async function confirmComposioAction(messageIndex: number) {
    const action = messages[messageIndex]?.pendingAction;
    if (!action || action.type !== "composio.multi_execute") return;
    setConfirmingActionId(action.id);
    try {
      const token = await getAccessTokenSilently();
      const response = await fetch("/api/composio/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ actionId: action.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not complete the confirmed actions.");
      const resultMessage = `${data.message || "Connected-app actions executed."}${typeof data.result === "string" ? `\n\n\`\`\`json\n${data.result}\n\`\`\`` : ""}`;
      const resultAssistantMessage: Message = {
        role: "assistant",
        content: resultMessage,
        createdAt: Date.now(),
      };
      setMessages((current) => current.flatMap((message) => (
        message.pendingAction?.id === action.id
          ? [{ ...message, pendingAction: undefined }, resultAssistantMessage]
          : [message]
      )));
      if (activeHistoryId) {
        setHistories((previous) => previous.map((history) => (
          history.id === activeHistoryId
            ? {
                ...history,
                messages: history.messages.flatMap((message) => (
                  message.pendingAction?.id === action.id
                    ? [{ ...message, pendingAction: undefined }, resultAssistantMessage]
                    : [message]
                )),
                updatedAt: Date.now(),
              }
            : history
        )));
      }
    } catch (error) {
      const resultAssistantMessage: Message = {
        role: "assistant",
        content: `The confirmed action could not be completed: ${getErrorMessage(error)}`,
        createdAt: Date.now(),
      };
      setMessages((current) => current.flatMap((message) => (
        message.pendingAction?.id === action.id
          ? [{ ...message, pendingAction: undefined }, resultAssistantMessage]
          : [message]
      )));
      if (activeHistoryId) {
        setHistories((previous) => previous.map((history) => (
          history.id === activeHistoryId
            ? {
                ...history,
                messages: history.messages.flatMap((message) => (
                  message.pendingAction?.id === action.id
                    ? [{ ...message, pendingAction: undefined }, resultAssistantMessage]
                    : [message]
                )),
                updatedAt: Date.now(),
              }
            : history
        )));
      }
    } finally {
      setConfirmingActionId(null);
    }
  }

  function confirmPendingAction(messageIndex: number) {
    if (messages[messageIndex]?.pendingAction?.type === "composio.multi_execute") {
      void confirmComposioAction(messageIndex);
    } else {
      void confirmCyberAction(messageIndex);
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
    window.setTimeout(() => document.querySelector<HTMLInputElement>("input[placeholder='Ask Grope anything...']")?.focus(), 0);
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
    getHistoryAgent(history.agent) === activeAgent
  ));
  const activeMapEmbedUrl = histories.find((history) => history.id === activeHistoryId)?.mapEmbedUrl;
  const activeAgentName = activeAgent === "cyber"
    ? "Grope"
    : activeAgent === "maps"
      ? "CyberMaps"
      : "Grope";
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

            <div className="space-y-2">
              <button
                type="button"
                onClick={openGeneratedImageHistory}
                aria-current={isImageHistoryOpen ? "page" : undefined}
                className={`chat-sidebar-page-button flex w-full items-center gap-2 rounded-lg px-4 py-2 text-left font-medium transition hover:bg-neutral-800 ${
                  isImageHistoryOpen ? "bg-neutral-800 text-white" : "text-neutral-300"
                }`}
              >
                <Images size={18} aria-hidden="true" />
                File history
              </button>
              <button
                type="button"
                onClick={openTools}
                aria-current={isToolsOpen ? "page" : undefined}
                className={`chat-sidebar-page-button flex w-full items-center gap-2 rounded-lg px-4 py-2 text-left font-medium transition hover:bg-neutral-800 ${
                  isToolsOpen ? "bg-neutral-800 text-white" : "text-neutral-300"
                }`}
              >
                <Wrench size={18} aria-hidden="true" />
                Tools
              </button>
            </div>
            {/* file attach control moved to the input area (left of prompt) */}

          </div>

          <div className="min-h-0 flex-1 overflow-y-auto space-y-5 text-sm text-neutral-400 modern-scroll">
            <section aria-labelledby="chat-history-heading">
              {activeAgent !== "grope" && (
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
                        className={`group flex items-center gap-1 rounded-full border p-1 transition-[color,background-color,border-color,opacity] duration-200 ${
                          h.id === activeHistoryId
                            ? "border-neutral-700 bg-neutral-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
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
                          className="min-w-0 flex-1 rounded-full px-3 py-1.5 text-left"
                        >
                          <span className={`flex min-w-0 items-center gap-1.5 truncate text-xs ${h.id === activeHistoryId ? "font-medium text-neutral-100" : "text-neutral-200 group-hover:text-white"}`}>
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
              <div className="mt-2 flex justify-end px-3">
                <span className="inline-flex h-6 items-center rounded-md border border-neutral-100/70 bg-gradient-to-r from-neutral-400 via-neutral-100 to-neutral-300 px-2.5 text-[11px] font-semibold leading-none text-neutral-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_0_14px_rgba(212,212,216,0.16)]">
                  {planName}
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
              {activeAgent !== "grope" && (
                <>
                  {activeAgent === "cyber" ? (
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 text-violet-200">
                      <Mail size={18} aria-hidden="true" />
                    </span>
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-200">
                      <MapPinned size={18} aria-hidden="true" />
                    </span>
                  )}
                  <div className="leading-tight">
                    <div className="text-sm font-semibold">{activeAgent === "cyber" ? "Grope" : "CyberMaps"}</div>
                    {activeAgent === "cyber" && <div className="text-xs text-neutral-400">Optional Gmail & Calendar tools</div>}
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

        {isToolsOpen ? (
          <section aria-labelledby="tools-heading" className="min-h-0 flex-1 overflow-y-auto p-4 modern-scroll">
            <div className="mx-auto max-w-6xl">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 id="tools-heading" className="text-2xl font-semibold text-white">Tools</h1>
                  <p className="mt-1 text-sm text-neutral-400">48 essential app connectors for account connections.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsToolsOpen(false);
                    setIntegrationSearchQuery("");
                  }}
                  className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-200 hover:bg-neutral-800"
                >
                  Back to chat
                </button>
              </div>

              {integrationError && (
                <p className="mb-4 rounded-lg border border-rose-900/70 bg-rose-950/40 px-4 py-3 text-sm text-rose-200" role="alert">
                  {integrationError}
                </p>
              )}

              {!isAuthenticated && !isAuthLoading ? (
                <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-5 py-10 text-center">
                  <p className="text-neutral-300">Sign in to browse and connect app integrations.</p>
                  <button
                    type="button"
                    onClick={() => loginWithRedirect()}
                    className="mt-4 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-neutral-200"
                  >
                    Log in
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <label className="relative min-w-56 flex-1">
                      <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                      <input
                        type="search"
                        value={integrationSearchQuery}
                        onChange={(event) => setIntegrationSearchQuery(event.target.value)}
                        placeholder="Search app integrations"
                        aria-label="Search app integrations"
                        className="w-full rounded-lg border border-neutral-700 bg-neutral-950 py-2 pl-9 pr-3 text-sm text-white placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-500/20"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setIntegrationRefreshKey((current) => current + 1)}
                      disabled={isLoadingIntegrations}
                      className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition hover:bg-neutral-800 disabled:opacity-50"
                    >
                      {isLoadingIntegrations ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>

                  <div className="mb-6 flex gap-2 overflow-x-auto pb-1 modern-scroll" aria-label="Integration categories">
                    {(["All", ...INTEGRATION_CATEGORIES, "Other"] as Array<IntegrationCategory | "All">).map((category) => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setIntegrationCategory(category)}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition ${
                          integrationCategory === category
                            ? "border-neutral-300 bg-neutral-100 text-neutral-950"
                            : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
                        }`}
                        aria-pressed={integrationCategory === category}
                      >
                        {category}
                      </button>
                    ))}
                  </div>

                  {!isLoadingIntegrations && integrationToolkits.some(isToolkitInstalled) && (
                    <section className="mb-8" aria-labelledby="installed-tools-heading">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h2 id="installed-tools-heading" className="text-lg font-semibold text-white">Installed addons</h2>
                          <p className="mt-1 text-sm text-neutral-500">Connected apps ready for Grope to use.</p>
                        </div>
                        <span className="rounded-full border border-neutral-700 px-2.5 py-1 text-xs text-neutral-400">
                          {integrationToolkits.filter(isToolkitInstalled).length} installed
                        </span>
                      </div>
                      <div className="flex gap-3 overflow-x-auto pb-2 modern-scroll">
                        {integrationToolkits
                          .filter(isToolkitInstalled)
                          .filter((toolkit) => (
                            !integrationSearchQuery.trim() ||
                            toolkit.name.toLocaleLowerCase().includes(integrationSearchQuery.trim().toLocaleLowerCase()) ||
                            toolkit.slug.toLocaleLowerCase().includes(integrationSearchQuery.trim().toLocaleLowerCase())
                          ))
                          .map((toolkit) => (
                            <article
                              key={toolkit.slug}
                              className="flex w-64 shrink-0 flex-col gap-3 rounded-2xl border border-emerald-900/60 bg-neutral-900 p-3"
                            >
                              <div className="flex items-start gap-3">
                                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-700 bg-neutral-800">
                                  <Image
                                    src={getIntegrationLogoUrl(toolkit)}
                                    alt=""
                                    width={48}
                                    height={48}
                                    unoptimized
                                    className="h-full w-full object-contain"
                                  />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <h3 className="truncate text-sm font-semibold text-white">{toolkit.name}</h3>
                                  <p className="mt-0.5 text-xs text-emerald-300">Installed</p>
                                </div>
                              </div>
                              <p className="line-clamp-2 min-h-8 text-xs leading-4 text-neutral-400">
                                {getIntegrationDescription(toolkit)}
                              </p>
                              <button
                                type="button"
                                onClick={() => toolkit.connected
                                  ? void disconnectComposioToolkit(toolkit)
                                  : uninstallAutoInstalledToolkit(toolkit)}
                                disabled={connectingToolkit !== null}
                                className="self-start rounded-full border border-neutral-700 px-2.5 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-rose-800 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-50"
                                aria-label={`Uninstall ${toolkit.name}`}
                              >
                                {connectingToolkit === toolkit.slug ? "Removing..." : "Uninstall"}
                              </button>
                            </article>
                          ))}
                      </div>
                    </section>
                  )}

                  {isLoadingIntegrations && integrationToolkits.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-neutral-400" role="status">
                      <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
                      Loading app integrations...
                    </div>
                  ) : integrationToolkits.length === 0 && !integrationError ? (
                    <p className="rounded-xl border border-dashed border-neutral-700 px-4 py-16 text-center text-neutral-400">
                      No app integrations are currently available.
                    </p>
                  ) : (
                    <div className="space-y-8">
                      {([...INTEGRATION_CATEGORIES, "Other"] as IntegrationCategory[])
                        .map((category) => ({
                          category,
                          toolkits: integrationToolkits.filter((toolkit) => (
                            getIntegrationCategory(toolkit) === category &&
                            (integrationCategory === "All" || integrationCategory === category) &&
                            (!integrationSearchQuery.trim() ||
                              toolkit.name.toLocaleLowerCase().includes(integrationSearchQuery.trim().toLocaleLowerCase()) ||
                              toolkit.slug.toLocaleLowerCase().includes(integrationSearchQuery.trim().toLocaleLowerCase()))
                          )),
                        }))
                        .filter(({ toolkits }) => toolkits.length > 0)
                        .map(({ category, toolkits }) => (
                          <section key={category} aria-labelledby={`integration-category-${category.replace(/[^a-zA-Z0-9]+/g, "-").toLocaleLowerCase()}`}>
                            <div className="mb-3 flex items-center gap-3">
                              <h2
                                id={`integration-category-${category.replace(/[^a-zA-Z0-9]+/g, "-").toLocaleLowerCase()}`}
                                className="text-lg font-semibold text-white"
                              >
                                {category}
                              </h2>
                              <span className="rounded-full border border-neutral-800 px-2 py-0.5 text-xs text-neutral-500">
                                {toolkits.length}
                              </span>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              {toolkits.map((toolkit) => (
                                <article key={toolkit.slug} className="flex min-h-44 flex-col rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                                  <div className="flex items-start gap-3">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-700 bg-neutral-800">
                                      <Image
                                        src={getIntegrationLogoUrl(toolkit)}
                                        alt=""
                                        width={40}
                                        height={40}
                                        unoptimized
                                        className="h-full w-full object-contain"
                                      />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <h3 className="truncate font-semibold text-white">{toolkit.name}</h3>
                                      <p className="mt-1 text-xs text-neutral-500">
                                        {isToolkitInstalled(toolkit)
                                          ? (toolkit.connected ? "Connected" : "Installed")
                                          : "Not installed"}
                                      </p>
                                    </div>
                                    {isToolkitInstalled(toolkit) && <Check size={17} className="mt-0.5 shrink-0 text-emerald-300" aria-label="Installed" />}
                                  </div>
                                  <p className="mt-3 line-clamp-3 flex-1 text-sm leading-5 text-neutral-400">
                                    {getIntegrationDescription(toolkit)}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => isToolkitInstalled(toolkit)
                                      ? (toolkit.connected
                                        ? void disconnectComposioToolkit(toolkit)
                                        : uninstallAutoInstalledToolkit(toolkit))
                                      : void connectComposioToolkit(toolkit.slug)}
                                    disabled={connectingToolkit !== null}
                                    className={`mt-4 self-start rounded-full border px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                      isToolkitInstalled(toolkit)
                                        ? "border-neutral-700 text-neutral-300 hover:border-rose-800 hover:text-rose-300"
                                        : "border-neutral-700 text-neutral-200 hover:bg-neutral-800"
                                    }`}
                                  >
                                    {connectingToolkit === toolkit.slug
                                      ? (isToolkitInstalled(toolkit) ? "Uninstalling..." : "Installing...")
                                      : isToolkitInstalled(toolkit) ? "Uninstall" : "Install"}
                                  </button>
                                </article>
                              ))}
                            </div>
                          </section>
                        ))}
                    </div>
                  )}
                  {!isLoadingIntegrations && integrationToolkits.length > 0 && integrationSearchQuery.trim() && !integrationToolkits.some((toolkit) => (
                    (integrationCategory === "All" || getIntegrationCategory(toolkit) === integrationCategory) &&
                    (
                      toolkit.name.toLocaleLowerCase().includes(integrationSearchQuery.trim().toLocaleLowerCase()) ||
                      toolkit.slug.toLocaleLowerCase().includes(integrationSearchQuery.trim().toLocaleLowerCase())
                    )
                  )) && (
                    <p className="py-12 text-center text-sm text-neutral-400">No integrations match that search.</p>
                  )}
                </>
              )}
            </div>
          </section>
        ) : isImageHistoryOpen ? (
          <section aria-labelledby="generated-image-history-heading" className="min-h-0 flex-1 overflow-y-auto p-4 modern-scroll">
            <div className="mx-auto max-w-6xl">
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 id="generated-image-history-heading" className="text-2xl font-semibold text-white">File history</h1>
                  <p className="mt-1 text-sm text-neutral-400">Images you have generated with Teller.</p>
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
                  {hasSession && (
                    <button
                      type="button"
                      onClick={() => void loadGeneratedImages(generatedImageRetryResetRef.current)}
                      disabled={isGeneratedImagesLoading}
                      className="rounded-md border border-rose-300/30 px-3 py-1.5 font-medium text-rose-100 transition hover:bg-rose-900/40 disabled:opacity-50"
                    >
                      {isGeneratedImagesLoading ? "Loading..." : "Retry"}
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
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openGeneratedImageEditor(image)}
                            className="rounded px-2 py-1 text-neutral-200 hover:bg-neutral-800"
                          >
                            Edit
                          </button>
                          <a href={image.imageUrl} download={`teller-generated-${image.id}.png`} className="rounded px-2 py-1 text-neutral-200 hover:bg-neutral-800">
                            Download
                          </a>
                        </div>
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
        <div ref={messagesScrollRef} className="min-h-0 flex-1 overflow-y-auto p-4 modern-scroll">
          <div className={`mx-auto min-w-0 space-y-4 max-w-3xl ${isThinking ? "pb-[70vh]" : ""}`}>
            {messages.map((message, index) => (
              message.role === "user" && message.file ? null :
              <div
                key={index}
                className={message.role === "assistant"
                  ? `chat-assistant-message group min-w-0 w-full [overflow-wrap:anywhere] ${
                    index === latestAssistantMessageIndex ? "chat-assistant-enter" : ""
                  }`
                  : "group ml-auto min-w-0 max-w-[85%] overflow-hidden rounded-[2rem] bg-blue-600 p-4 [overflow-wrap:anywhere] shadow-md shadow-blue-950/30 transition-transform duration-300 ease-out hover:scale-[1.015] active:scale-[0.99] motion-reduce:transition-none"}
              >
                <div className="min-w-0 max-w-full text-sm leading-7 [overflow-wrap:anywhere]">
                  {message.role === "assistant" &&
                  index === latestAssistantMessageIndex &&
                  index > 0 ? (
                    <ProgressiveResponse content={message.content}>
                      <FormattedMessage content={message.content} onCopyCode={(code) => void copyText(code, index)} />
                    </ProgressiveResponse>
                  ) : (
                    <FormattedMessage
                      content={message.content}
                      showCodeCopy={message.role === "assistant"}
                      onCopyCode={(code) => void copyText(code, index)}
                    />
                  )}
                </div>
                {message.role === "assistant" &&
                  activeAgent === "grope" &&
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
                            disabled={loading || (thinkMode ? thinkWouldExceedChatLimit : monthlyChatCount >= usageLimit)}
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
                <div className="mt-3 flex gap-2 pt-2 opacity-70">
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
                        {message.pendingAction.type === "composio.multi_execute"
                          ? "Run these connected-app actions?"
                          : message.pendingAction.type === "gmail.create_draft"
                            ? "Create this Gmail draft?"
                            : "Add this calendar event?"}
                      </p>
                      {message.pendingAction.type === "composio.multi_execute" ? (
                        <ul className="mt-2 space-y-3 text-neutral-300">
                          {message.pendingAction.actions.map((action, actionIndex) => (
                            <li key={`${action.toolSlug}-${actionIndex}`} className="rounded-md bg-neutral-900/70 p-2">
                              <p className="text-xs font-medium text-neutral-200">{action.description}</p>
                              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-4 text-neutral-400">
                                {JSON.stringify(action.arguments, null, 2)}
                              </pre>
                            </li>
                          ))}
                        </ul>
                      ) : message.pendingAction.type === "gmail.create_draft" ? (
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
                          onClick={() => confirmPendingAction(index)}
                          disabled={confirmingActionId === message.pendingAction.id}
                          className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-neutral-950 disabled:opacity-50"
                        >
                          {confirmingActionId === message.pendingAction.id
                            ? "Working..."
                            : message.pendingAction.type === "composio.multi_execute"
                              ? "Confirm and run"
                              : "Confirm"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setMessages((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, pendingAction: undefined } : item))}
                          disabled={confirmingActionId === message.pendingAction.id}
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
                {typeof message.createdAt === "number" &&
                  Number.isFinite(new Date(message.createdAt).getTime()) && (
                  <time
                    dateTime={new Date(message.createdAt).toISOString()}
                    className={`block max-h-0 translate-y-[-0.25rem] overflow-hidden text-xs text-neutral-500 opacity-0 transition-[max-height,opacity,transform] duration-200 ease-out group-hover:max-h-6 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:max-h-6 group-focus-within:translate-y-0 group-focus-within:opacity-100 motion-reduce:transition-none ${
                      message.role === "user" ? "text-right" : ""
                    }`}
                  >
                    {new Date(message.createdAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </time>
                )}
              </div>
            ))}

            {activeAgent === "grope" &&
              messages.every((message) => message.role !== "user") &&
              messages.length > 0 && (
                <section aria-label="Example prompts" className="rounded-2xl border border-sky-400/15 bg-sky-400/[0.03] p-4">
                  <p className="mb-3 text-xs font-medium text-neutral-400">Try asking Grope</p>
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
                        disabled={loading || (thinkMode ? thinkWouldExceedChatLimit : monthlyChatCount >= usageLimit)}
                        className="rounded-full border border-neutral-600 bg-neutral-900/70 px-3 py-2 text-left text-xs leading-5 text-neutral-200 transition hover:border-sky-400/50 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </section>
              )}

            {loading && activeAgent === "grope" && researchSites.length > 0 && (
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
                    <ResearchSiteIcon site={site} />
                    <span className="truncate">{site}</span>
                  </span>
                ))}
              </div>
            )}
            {loading && (
              <div
                ref={isThinking ? thinkingStatusRef : null}
                className="mr-auto flex min-h-24 w-full max-w-[85%] items-center justify-start py-4 [overflow-wrap:anywhere]"
                role="status"
                aria-label={isGeneratingImage
                  ? "Creating your image"
                  : activeAgent === "cyber"
                    ? "Grope is working"
                    : activeAgent === "maps"
                      ? "CyberMaps is working"
                      : "Grope is thinking"}
              >
                {isGeneratingImage ? (
                  <span className="pixel-loader pixel-loader--large" aria-hidden="true">
                    {Array.from({ length: 49 }, (_, index) => (
                      <span className="pixel-loader__pixel" key={index} />
                    ))}
                  </span>
                ) : (
                  activeAgent === "grope" ? (
                    <NeutronStarLoader />
                  ) : activeAgent === "cyber" ? (
                    "Grope is working..."
                  ) : (
                    "CyberMaps is working..."
                  )
                )}
              </div>
            )}

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
                  <span className="flex h-10 items-center rounded-full border border-neutral-700 px-3 text-xs font-bold text-white">
                    Grope
                  </span>
                </div>
                <div className="relative order-1 shrink-0 self-center">
                  <input
                    ref={fileInputRef}
                    type="file"
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
                    placeholder="Ask Grope anything..."
                    value={input}
                    disabled={loading}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendMessage();
                      }
                    }}
                    aria-label="Message Grope"
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
                  onClick={() => setThinkMode((enabled) => !enabled)}
                  disabled={loading}
                  className={`order-5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    thinkMode
                      ? "bg-sky-400 text-neutral-950 shadow-[0_0_16px_rgba(56,189,248,0.35)] hover:bg-sky-300"
                      : "text-neutral-300 hover:bg-neutral-800 hover:text-white"
                  }`}
                  aria-label="Think mode"
                  aria-pressed={thinkMode}
                  title="Think responses use two chats and provide more detailed, carefully considered answers"
                >
                  <BrainCircuit size={21} strokeWidth={1.8} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => loading ? stopActiveRequest() : void sendMessage()}
                  disabled={!loading && (isTranscribing || (!input.trim() && !pendingFile))}
                  className={`order-6 flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400 ${loading ? "bg-neutral-700 text-neutral-100 hover:bg-neutral-600" : "bg-white text-neutral-950 hover:bg-neutral-200"}`}
                  aria-label={loading ? (isGeneratingImage ? "Stop image generation" : "Stop response") : "Send message"}
                  title={loading ? (isGeneratingImage ? "Stop image generation" : "Stop response") : "Send message"}
                >
                  {loading
                    ? <Square size={18} strokeWidth={3} fill="currentColor" aria-hidden="true" />
                    : <ArrowUp size={21} strokeWidth={2.5} aria-hidden="true" />}
                </button>
                </div>
                {speechError && <p className="px-3 pt-2 text-xs text-rose-300" role="alert">{speechError}</p>}
            </div>
            <p className="px-3 pt-2 text-center text-xs text-neutral-500">
              Grope can make mistakes. Check important information.{" "}
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
            <div className="min-h-0 overflow-auto p-3 sm:p-5">
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
                <input
                  id="image-edit-prompt"
                  type="text"
                  autoFocus
                  value={imageEditPrompt}
                  onChange={(event) => setImageEditPrompt(event.target.value)}
                  placeholder="What would you like to change?"
                  className="h-12 min-w-0 flex-1 rounded-full border border-neutral-700 bg-neutral-950 px-5 text-sm text-white outline-none placeholder:text-neutral-500 focus:border-sky-400"
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
