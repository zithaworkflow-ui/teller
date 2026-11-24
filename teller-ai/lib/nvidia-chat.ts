import { getNvidiaAIConfig, getNvidiaChatConfig } from "@/lib/nvidia-ai";

export function hasNvidiaChatProvider() {
  return Boolean(process.env.NVIDIA_API_KEY);
}

async function callNvidiaCompletion<T>(
  requestBody: Record<string, unknown>,
  config: ReturnType<typeof getNvidiaAIConfig>,
): Promise<T> {
  const response = await fetch(config.apiBaseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({ ...requestBody, model: config.model }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    throw new Error(
      `NVIDIA chat request failed (${response.status})${detail ? `: ${detail}` : "."}`,
    );
  }

  return await response.json() as T;
}

export async function callNvidiaChatCompletion<T = unknown>(
  requestBody: Record<string, unknown>,
): Promise<T> {
  return callNvidiaCompletion<T>(requestBody, getNvidiaChatConfig());
}

export async function callNvidiaModelCompletion<T = unknown>(
  requestBody: Record<string, unknown>,
): Promise<T> {
  return callNvidiaCompletion<T>(requestBody, getNvidiaAIConfig());
}