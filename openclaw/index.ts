import { definePluginEntry, type OpenClawPluginApi } from "./api.js";
import { createCompressTool } from "./src/compress-tool.js";
import { compressPrompt } from "./src/compress.js";
import { checkHealth, formatHealthStatus } from "./src/health.js";

interface JohnnyConfig {
  autoCompress?: boolean;
  minTokenThreshold?: number;
  ollamaBaseUrl?: string;
  model?: string;
}

function resolveConfig(raw: unknown): Required<JohnnyConfig> {
  const cfg = (raw ?? {}) as JohnnyConfig;
  return {
    autoCompress: cfg.autoCompress ?? false,
    minTokenThreshold: cfg.minTokenThreshold ?? 50,
    ollamaBaseUrl: cfg.ollamaBaseUrl ?? "http://127.0.0.1:11434",
    model: cfg.model ?? "johnny",
  };
}

const SAMPLE_PROMPT =
  "Hey, can you please check my email and if there is anything new, summarize the key points and send me a brief overview?";

export default definePluginEntry({
  id: "johnny",
  name: "Johnny",
  description: "Prompt compression via local Ollama model — named after Johnny Mnemonic.",
  register(api: OpenClawPluginApi) {
    const config = resolveConfig(api.pluginConfig);
    const compressOptions = {
      ollamaBaseUrl: config.ollamaBaseUrl,
      model: config.model,
      minTokenThreshold: config.minTokenThreshold,
    };

    // Register the on-demand johnny tool.
    api.registerTool(() => createCompressTool(compressOptions), {
      name: "johnny",
    });

    // Fire-and-forget startup health check — warn if Ollama is unreachable or model missing.
    checkHealth({ ollamaBaseUrl: config.ollamaBaseUrl, model: config.model }).then(
      (health) => {
        if (!health.ollamaRunning) {
          api.logger.warn(
            "johnny: Ollama is not reachable — compression will silently fall back to original text. " +
              "Install Ollama (https://ollama.com) and run: ollama serve",
          );
        } else if (!health.modelExists) {
          api.logger.warn(
            `johnny: model "${config.model}" not found in Ollama — compression will silently fall back to original text. ` +
              "Run: ollama create johnny -f Modelfile",
          );
        }
      },
      () => {
        // Swallow — startup check is best-effort.
      },
    );

    // Register /johnny command for health checks and guided setup.
    api.registerCommand({
      name: "johnny",
      description: "Johnny prompt compressor — status, setup, and test.",
      async execute(_args: string) {
        const args = _args.trim();
        const subcommand = args.split(/\s+/)[0] || "status";

        if (subcommand === "status" || subcommand === "") {
          const health = await checkHealth({
            ollamaBaseUrl: config.ollamaBaseUrl,
            model: config.model,
          });
          return { content: [{ type: "text" as const, text: formatHealthStatus(health) }] };
        }

        if (subcommand === "setup") {
          return await runSetup(config);
        }

        if (subcommand === "test") {
          return await runTest(compressOptions);
        }

        return {
          content: [
            {
              type: "text" as const,
              text: [
                "Usage: /johnny [subcommand]",
                "",
                "  status  — check Ollama connectivity and model availability (default)",
                "  setup   — guided setup: check Ollama, verify model, show next steps",
                "  test    — compress a sample prompt and show before/after stats",
              ].join("\n"),
            },
          ],
        };
      },
    });

    // Register auto-compression hook when enabled.
    if (config.autoCompress) {
      api.on("before_prompt_build", async (event) => {
        const prompt = (event as { prompt?: string }).prompt ?? "";
        if (!prompt) return {};

        const result = await compressPrompt(prompt, compressOptions);
        if (result.skipped) return {};

        api.logger.debug(
          `johnny: compressed ${result.originalTokenEstimate} → ${result.compressedTokenEstimate} tok est (${result.reductionPercent}% reduction)`,
        );

        return { userMessageOverride: result.compressed };
      });
    }
  },
});

async function runSetup(config: Required<JohnnyConfig>) {
  const lines: string[] = ["Johnny Setup", ""];
  const health = await checkHealth({
    ollamaBaseUrl: config.ollamaBaseUrl,
    model: config.model,
  });

  // Step 1: Ollama
  if (health.ollamaRunning) {
    lines.push("  1. Ollama: running");
  } else {
    lines.push("  1. Ollama: not running");
    lines.push("");
    lines.push("     Install: https://ollama.com");
    lines.push("     Then run: ollama serve");
    lines.push("");
    lines.push("  Re-run /johnny setup after starting Ollama.");
    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }

  // Step 2: Model
  if (health.modelExists) {
    lines.push(`  2. Model "${config.model}": found`);
  } else {
    lines.push(`  2. Model "${config.model}": not found`);
    lines.push("");
    lines.push("     Create it:");
    lines.push("       cd <johnny-openclaw-dir>");
    lines.push("       ollama create johnny -f core/Modelfile");
    lines.push("");
    lines.push("  Re-run /johnny setup after creating the model.");
    return { content: [{ type: "text" as const, text: lines.join("\n") }] };
  }

  lines.push("");
  lines.push("  All good! Johnny is ready to compress prompts.");
  lines.push("  Try: /johnny test");

  return { content: [{ type: "text" as const, text: lines.join("\n") }] };
}

async function runTest(compressOptions: {
  ollamaBaseUrl: string;
  model: string;
  minTokenThreshold: number;
}) {
  const result = await compressPrompt(SAMPLE_PROMPT, {
    ...compressOptions,
    minTokenThreshold: 0, // Force compression for the test
  });

  const lines = [
    "Johnny Compression Test",
    "",
    `  Original (${result.originalTokenEstimate} tok est):`,
    `    ${SAMPLE_PROMPT}`,
    "",
    `  Compressed (${result.compressedTokenEstimate} tok est, ${result.reductionPercent}% reduction):`,
    `    ${result.compressed}`,
  ];

  if (result.skipped) {
    lines.push("");
    lines.push("  (Compression failed — Ollama may be down or model missing. Run /johnny status)");
  }

  return { content: [{ type: "text" as const, text: lines.join("\n") }] };
}
