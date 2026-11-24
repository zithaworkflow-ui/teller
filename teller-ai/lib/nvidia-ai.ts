export const NVIDIA_CHAT_COMPLETIONS_URL =
  "https://integrate.api.nvidia.com/v1/chat/completions";
export const NVIDIA_DEFAULT_MODEL =
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
export const NVIDIA_DEFAULT_CHAT_MODEL = "nvidia/nemotron-3.5-bolt-e4b";

export function getNvidiaAIConfig() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error("NVIDIA AI is not configured. Set NVIDIA_API_KEY on the server.");
  }

  return {
    apiKey,
    apiBaseUrl: process.env.NVIDIA_API_BASE_URL?.trim() || NVIDIA_CHAT_COMPLETIONS_URL,
    model: process.env.NVIDIA_MODEL?.trim() || NVIDIA_DEFAULT_MODEL,
  };
}

export function getNvidiaChatConfig() {
  return {
    ...getNvidiaAIConfig(),
    model: process.env.NVIDIA_CHAT_MODEL?.trim() || NVIDIA_DEFAULT_CHAT_MODEL,
  };
}
