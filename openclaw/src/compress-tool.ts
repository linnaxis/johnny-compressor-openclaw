import { Type } from "@sinclair/typebox";
import type { CompressOptions } from "./compress.js";
import { compressPrompt } from "./compress.js";

const JohnnySchema = Type.Object(
  {
    text: Type.String({ description: "Verbose text to compress into minimal shorthand tokens." }),
    verbose: Type.Optional(
      Type.Boolean({
        description: "Show before/after comparison with token estimates.",
      }),
    ),
  },
  { additionalProperties: false },
);

export function createCompressTool(options: CompressOptions) {
  return {
    name: "johnny",
    label: "Johnny",
    description:
      "Compress verbose English text into minimal shorthand tokens using a local Ollama model. " +
      "Useful for reducing token usage when relaying prompts or summarizing verbose instructions.",
    parameters: JohnnySchema,
    execute: async (
      _toolCallId: string,
      params: { text: string; verbose?: boolean },
    ) => {
      const result = await compressPrompt(params.text, options);

      if (params.verbose) {
        const lines = [
          `--- ORIGINAL (${result.originalTokenEstimate} tok est) ---`,
          params.text,
          "",
          `--- COMPRESSED (${result.compressedTokenEstimate} tok est, ${result.reductionPercent}% reduction) ---`,
          result.compressed,
        ];
        if (result.skipped) {
          lines.push("", "(Compression skipped — below threshold or Ollama unavailable)");
        }
        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      }

      return { content: [{ type: "text" as const, text: result.compressed }] };
    },
  };
}
