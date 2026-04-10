/**
 * Full Compression Evaluation
 *
 * - Compresses each prompt 3 times to check consistency
 * - Sends both original + best compressed version to Claude Haiku
 * - Reports actual token savings and semantic preservation
 */

import { compressPrompt, estimateTokens } from "./src/compress.js";

const OLLAMA_BASE = "http://127.0.0.1:11434";
const COMPILER_MODEL = "johnny";
const ANTHROPIC_API_KEY = process.env["ANTHROPIC_API_KEY"]!;

const INTERPRET_SYSTEM =
  "You are analyzing a user request. List EXACTLY what the user wants done as a numbered list of discrete actions. " +
  "Be precise about: WHO (recipients), WHAT (format, data), WHEN (timeframes). " +
  "One line per action. No commentary. If shorthand codes are used (snd=send, chk=check, sum=summarize, rsch=research, rd=read, wr=write, rpt=report, fmt=format, @=email, #=file, |=pipe/then), expand them.";

const TEST_CASES = [
  {
    id: "email-research",
    input:
      "Hey, can you please research the latest news about renewable energy subsidies in the EU and send a nicely formatted HTML summary email to Alice?",
  },
  {
    id: "email-check",
    input:
      "I'd like you to check my email and if there's anything new from Alice, please summarize it and send the summary to me",
  },
  {
    id: "market-report",
    input:
      "I want you to write a detailed market report covering Japan equities performance over the last quarter, including key movers and sector analysis, and then send it as an HTML email to both Alice and Bob",
  },
  {
    id: "multi-step",
    input:
      "First, please check if there are any new emails from Alice. If there are, read them and summarize the key points. Then research any topics she mentioned and prepare a brief response. Finally, send the response back to Alice as a nicely formatted email.",
  },
  {
    id: "reminder-set",
    input:
      "Can you set a reminder for 30 minutes from now to review Alice's reply about the quarterly budget proposal?",
  },
  {
    id: "medium-complexity",
    input:
      "Can you check the current status of all our active ad campaigns and tell me which ones are about to expire in the next 24 hours?",
  },
  {
    id: "complex-analysis",
    input:
      "I need you to analyze our sales performance data for the last two weeks, compare it against the benchmark targets for the APAC region, identify any significant deviations or anomalies, and then prepare a comprehensive report with charts and send it to the entire team as an HTML email. Also, flag any deals that might need legal review.",
  },
  {
    id: "file-read",
    input:
      "Can you read the file at docs/project-overview.docx and give me a brief summary of what's in it?",
  },
];

const ATTEMPTS = 3;

async function askClaude(
  prompt: string,
): Promise<{ text: string; inputTokens: number }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: INTERPRET_SYSTEM,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude ${response.status}: ${err}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  return {
    text: data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join(""),
    inputTokens: data.usage.input_tokens,
  };
}

interface CompAttempt {
  compressed: string;
  tokens: number;
  reduction: number;
}

async function run(): Promise<void> {
  console.log("=== Full Compression Evaluation ===");
  console.log(`Compiler: ${COMPILER_MODEL} | Interpreter: claude-haiku-4-5`);
  console.log(`Attempts per prompt: ${ATTEMPTS} | Test cases: ${TEST_CASES.length}\n`);

  const allResults: Array<{
    id: string;
    original: string;
    origTokensEst: number;
    attempts: CompAttempt[];
    bestCompressed: string | null;
    bestReduction: number;
    origInterpretation?: string;
    compInterpretation?: string;
    origActualTokens?: number;
    compActualTokens?: number;
    actualSaved?: number;
    consistency: string;
  }> = [];

  for (const test of TEST_CASES) {
    const origTokens = estimateTokens(test.input);
    console.log(`[${test.id}] (${origTokens} tok est)`);

    const attempts: CompAttempt[] = [];

    for (let i = 0; i < ATTEMPTS; i++) {
      const result = await compressPrompt(test.input, {
        ollamaBaseUrl: OLLAMA_BASE,
        model: COMPILER_MODEL,
        minTokenThreshold: 0,
      });

      const compressed =
        result.compressed === test.input ? null : result.compressed;
      const attempt: CompAttempt = {
        compressed: compressed ?? "(unchanged)",
        tokens: compressed ? result.compressedTokenEstimate : origTokens,
        reduction: compressed ? result.reductionPercent : 0,
      };
      attempts.push(attempt);
      process.stdout.write(
        `  attempt ${i + 1}: ${compressed ? `${attempt.reduction}% "${compressed.substring(0, 60)}${compressed.length > 60 ? "..." : ""}"` : "(unchanged)"}\n`,
      );
    }

    // Pick best compression (highest reduction that actually compressed)
    const compressed = attempts
      .filter((a) => a.compressed !== "(unchanged)")
      .sort((a, b) => b.reduction - a.reduction);
    const best = compressed[0] ?? null;

    // Check consistency
    const uniqueOutputs = new Set(attempts.map((a) => a.compressed));
    const consistency =
      uniqueOutputs.size === 1
        ? "consistent"
        : `${uniqueOutputs.size} variants in ${ATTEMPTS} runs`;

    const entry: (typeof allResults)[number] = {
      id: test.id,
      original: test.input,
      origTokensEst: origTokens,
      attempts,
      bestCompressed: best?.compressed ?? null,
      bestReduction: best?.reduction ?? 0,
      consistency,
    };

    // If we got a good compression, ask Claude to interpret both versions
    if (best && best.reduction > 0) {
      process.stdout.write("  Claude (original)... ");
      const orig = await askClaude(test.input);
      console.log(`${orig.inputTokens} tok`);

      process.stdout.write("  Claude (compressed)... ");
      const comp = await askClaude(best.compressed);
      console.log(`${comp.inputTokens} tok`);

      entry.origInterpretation = orig.text;
      entry.compInterpretation = comp.text;
      entry.origActualTokens = orig.inputTokens;
      entry.compActualTokens = comp.inputTokens;
      entry.actualSaved = orig.inputTokens - comp.inputTokens;
    }

    allResults.push(entry);
    console.log();
  }

  // ── Detailed Results ──
  console.log("=".repeat(100));
  console.log("DETAILED RESULTS");
  console.log("=".repeat(100));

  for (const r of allResults) {
    console.log(`\n${"~".repeat(90)}`);
    console.log(`[${r.id}] | consistency: ${r.consistency}`);
    console.log(`${"~".repeat(90)}`);

    console.log(`\n  ORIGINAL (${r.origTokensEst} tok est):`);
    console.log(`    ${r.original}`);

    if (!r.bestCompressed) {
      console.log(`\n  COMPRESSED: (no compression achieved in ${ATTEMPTS} attempts)`);
      continue;
    }

    console.log(`\n  BEST COMPRESSED (${r.bestReduction}% est reduction):`);
    console.log(`    ${r.bestCompressed}`);

    if (r.origInterpretation && r.compInterpretation) {
      console.log(
        `\n  ACTUAL TOKENS: ${r.origActualTokens} -> ${r.compActualTokens} (saved ${r.actualSaved}, ${r.origActualTokens! > 0 ? Math.round((1 - r.compActualTokens! / r.origActualTokens!) * 100) : 0}% actual reduction)`,
      );

      console.log(`\n  CLAUDE ON ORIGINAL:`);
      for (const line of r.origInterpretation.split("\n")) {
        console.log(`    ${line}`);
      }
      console.log(`\n  CLAUDE ON COMPRESSED:`);
      for (const line of r.compInterpretation.split("\n")) {
        console.log(`    ${line}`);
      }
    }
  }

  // ── Summary Table ──
  const tested = allResults.filter((r) => r.origActualTokens != null);
  const notCompressed = allResults.filter((r) => !r.bestCompressed);

  console.log("\n" + "=".repeat(100));
  console.log("SUMMARY");
  console.log("=".repeat(100));

  console.log(`\n  Total test cases:       ${allResults.length}`);
  console.log(`  Compressed:             ${tested.length}`);
  console.log(`  Not compressed:         ${notCompressed.length} (model returned unchanged)`);

  if (tested.length > 0) {
    console.log("\n  ACTUAL TOKEN SAVINGS (Claude API input_tokens):");
    let totalOrig = 0;
    let totalComp = 0;
    for (const r of tested) {
      const pct =
        r.origActualTokens! > 0
          ? Math.round(
              (1 - r.compActualTokens! / r.origActualTokens!) * 100,
            )
          : 0;
      console.log(
        `    ${r.id.padEnd(22)} ${String(r.origActualTokens).padStart(4)} -> ${String(r.compActualTokens).padStart(4)}  (saved ${String(r.actualSaved).padStart(3)}, ${String(pct).padStart(2)}%)`,
      );
      totalOrig += r.origActualTokens!;
      totalComp += r.compActualTokens!;
    }
    const totalPct =
      totalOrig > 0 ? Math.round((1 - totalComp / totalOrig) * 100) : 0;
    console.log(
      `    ${"TOTAL".padEnd(22)} ${String(totalOrig).padStart(4)} -> ${String(totalComp).padStart(4)}  (saved ${String(totalOrig - totalComp).padStart(3)}, ${String(totalPct).padStart(2)}%)`,
    );
  }

  // Consistency report
  console.log("\n  COMPRESSION CONSISTENCY:");
  for (const r of allResults) {
    console.log(`    ${r.id.padEnd(22)} ${r.consistency}`);
  }

  if (notCompressed.length > 0) {
    console.log(
      `\n  NOTE: ${notCompressed.length} prompts were returned unchanged by the compiler.`,
    );
    console.log(
      "  The llama3 model sometimes passes through input at temperature 0.1.",
    );
    console.log(
      "  Consider: lower temperature, re-run Modelfile with stricter instructions,",
    );
    console.log("  or switch to a more instruction-following base model.");
  }
}

run().catch(console.error);
