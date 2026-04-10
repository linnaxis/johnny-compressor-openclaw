import { resolveOllamaUrl } from "./compress.js";

export interface HealthStatus {
  ollamaRunning: boolean;
  modelExists: boolean;
  modelName: string;
  ollamaUrl: string;
  error?: string;
}

const HEALTH_TIMEOUT_MS = 3_000;

/**
 * Check Ollama connectivity and whether the johnny model is available.
 * Returns a structured status for both CLI output and programmatic use.
 */
export async function checkHealth(options: {
  ollamaBaseUrl: string;
  model: string;
}): Promise<HealthStatus> {
  const baseUrl = resolveOllamaUrl(options.ollamaBaseUrl).replace(/\/+$/, "");
  const status: HealthStatus = {
    ollamaRunning: false,
    modelExists: false,
    modelName: options.model,
    ollamaUrl: baseUrl,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      status.error = `Ollama returned HTTP ${response.status}`;
      return status;
    }

    status.ollamaRunning = true;

    const data = (await response.json()) as {
      models?: Array<{ name?: string }>;
    };
    const models = data.models ?? [];
    status.modelExists = models.some((m) => {
      const name = m.name ?? "";
      return name === options.model || name.startsWith(`${options.model}:`);
    });
  } catch (err) {
    status.error =
      err instanceof Error ? err.message : "Failed to connect to Ollama";
  }

  return status;
}

/** Format health status as a human-readable string for command output. */
export function formatHealthStatus(health: HealthStatus): string {
  const lines: string[] = ["Johnny Health Check", ""];

  if (health.ollamaRunning) {
    lines.push(`  Ollama:  running (${health.ollamaUrl})`);
  } else {
    lines.push(`  Ollama:  not reachable (${health.ollamaUrl})`);
    if (health.error) {
      lines.push(`           ${health.error}`);
    }
    lines.push("");
    lines.push("  Fix: install Ollama (https://ollama.com) and run: ollama serve");
    return lines.join("\n");
  }

  if (health.modelExists) {
    lines.push(`  Model:   ${health.modelName} (found)`);
  } else {
    lines.push(`  Model:   ${health.modelName} (not found)`);
    lines.push("");
    lines.push("  Fix: ollama create johnny -f Modelfile");
    lines.push("       (run from the johnny-openclaw directory)");
  }

  if (health.ollamaRunning && health.modelExists) {
    lines.push("");
    lines.push("  Status:  healthy");
  }

  return lines.join("\n");
}
