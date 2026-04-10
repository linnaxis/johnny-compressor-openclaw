import fs from "node:fs";

const COMPRESS_TIMEOUT_MS = 5_000;

export interface CompressOptions {
  ollamaBaseUrl: string;
  model: string;
  minTokenThreshold: number;
}

export interface CompressResult {
  compressed: string;
  originalTokenEstimate: number;
  compressedTokenEstimate: number;
  reductionPercent: number;
  skipped: boolean;
}

/** Rough token estimate: word count * 1.3. */
export function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * 1.3);
}

/**
 * Resolve the Ollama base URL, swapping localhost for host.docker.internal
 * when running inside Docker.
 */
export function resolveOllamaUrl(configuredUrl: string): string {
  const isDocker =
    fs.existsSync("/.dockerenv") || !!process.env["OPENCLAW_DOCKER"];
  if (!isDocker) return configuredUrl;
  return configuredUrl.replace(
    /127\.0\.0\.1|localhost/,
    "host.docker.internal",
  );
}

/**
 * Compress a verbose prompt via the local Ollama johnny model.
 * Returns the original text unchanged on any error (graceful degradation).
 */
export async function compressPrompt(
  text: string,
  options: CompressOptions,
): Promise<CompressResult> {
  const originalTokens = estimateTokens(text);

  // Skip compression for short messages.
  if (originalTokens < options.minTokenThreshold) {
    return {
      compressed: text,
      originalTokenEstimate: originalTokens,
      compressedTokenEstimate: originalTokens,
      reductionPercent: 0,
      skipped: true,
    };
  }

  const baseUrl = resolveOllamaUrl(options.ollamaBaseUrl);
  const url = `${baseUrl.replace(/\/+$/, "")}/api/generate`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      COMPRESS_TIMEOUT_MS,
    );

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: options.model,
        prompt: text,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return fallbackResult(text, originalTokens);
    }

    const data = (await response.json()) as { response?: string };
    const compressed = (data.response ?? "").trim().replace(/^["']|["']$/g, "");

    if (!compressed) {
      return fallbackResult(text, originalTokens);
    }

    const compressedTokens = estimateTokens(compressed);
    const reduction =
      originalTokens > 0
        ? Math.round((1 - compressedTokens / originalTokens) * 100)
        : 0;

    return {
      compressed,
      originalTokenEstimate: originalTokens,
      compressedTokenEstimate: compressedTokens,
      reductionPercent: Math.max(0, reduction),
      skipped: false,
    };
  } catch {
    return fallbackResult(text, originalTokens);
  }
}

function fallbackResult(text: string, tokens: number): CompressResult {
  return {
    compressed: text,
    originalTokenEstimate: tokens,
    compressedTokenEstimate: tokens,
    reductionPercent: 0,
    skipped: true,
  };
}
