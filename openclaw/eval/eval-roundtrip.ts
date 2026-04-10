/**
 * Roundtrip Evaluation: Does compression preserve meaning?
 *
 * For each test case:
 * 1. Compress the verbose prompt via Ollama johnny
 * 2. Ask Claude Haiku to interpret BOTH versions as discrete action lists
 * 3. Compare the interpretations side-by-side
 *
 * This answers: "If I send the compressed version to Claude instead of the original,
 * will Claude understand the same set of tasks?"
 *
 * Usage: ANTHROPIC_API_KEY=... npx tsx extensions/johnny/eval-roundtrip.ts
 */

import { compressPrompt, estimateTokens } from "./src/compress.js";

const OLLAMA_BASE = "http://127.0.0.1:11434";
const COMPILER_MODEL = "johnny";

const ANTHROPIC_API_KEY = process.env["ANTHROPIC_API_KEY"];
if (!ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY to run roundtrip eval");
  process.exit(1);
}

const INTERPRET_SYSTEM =
  "You are analyzing a user request. List EXACTLY what the user wants done as a numbered list of discrete actions. " +
  "Be precise about: WHO (recipients), WHAT (format, data), WHEN (timeframes). " +
  "One line per action. No commentary. If shorthand codes are used (like snd=send, chk=check, sum=summarize, rsch=research, rd=read, wr=write, rpt=report, fmt=format, @=email, #=file, |=pipe/then), expand them.";

const TEST_CASES = [
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
    id: "email-research",
    input:
      "Hey, can you please research the latest news about renewable energy subsidies in the EU and send a nicely formatted HTML summary email to Alice?",
  },
];

async function askClaude(prompt: string): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
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
    throw new Error(`Claude API ${response.status}: ${err}`);
  }

  const data = (await response.json()) as {
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  return {
    text: data.content.filter((b) => b.type === "text").map((b) => b.text).join(""),
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
  };
}

interface Result {
  id: string;
  original: string;
  compressed: string;
  origTokensEst: number;
  compTokensEst: number;
  reduction: number;
  origInterpretation: string;
  compInterpretation: string;
  origActualInput: number;
  compActualInput: number;
  actualTokenSaved: number;
}

async function run(): Promise<void> {
  console.log("=== Roundtrip Eval: Verbose vs Compressed through Claude Haiku ===\n");
  console.log(`Compiler: ${COMPILER_MODEL} (Ollama)`);
  console.log(`Interpreter: claude-haiku-4-5`);
  console.log(`Test cases: ${TEST_CASES.length}\n`);

  const results: Result[] = [];

  for (const test of TEST_CASES) {
    process.stdout.write(`[${test.id}] compressing... `);

    const comp = await compressPrompt(test.input, {
      ollamaBaseUrl: OLLAMA_BASE,
      model: COMPILER_MODEL,
      minTokenThreshold: 0,
    });

    console.log(
      `${comp.reductionPercent}% (${comp.originalTokenEstimate} -> ${comp.compressedTokenEstimate} tok est)`,
    );

    if (comp.compressed === test.input) {
      console.log("  [no compression -- skipping interpretation]");
      continue;
    }

    process.stdout.write("  asking Claude (original)... ");
    const orig = await askClaude(test.input);
    console.log(`done (${orig.inputTokens} input tok)`);

    process.stdout.write("  asking Claude (compressed)... ");
    const compressed = await askClaude(comp.compressed);
    console.log(`done (${compressed.inputTokens} input tok)`);

    results.push({
      id: test.id,
      original: test.input,
      compressed: comp.compressed,
      origTokensEst: comp.originalTokenEstimate,
      compTokensEst: comp.compressedTokenEstimate,
      reduction: comp.reductionPercent,
      origInterpretation: orig.text,
      compInterpretation: compressed.text,
      origActualInput: orig.inputTokens,
      compActualInput: compressed.inputTokens,
      actualTokenSaved: orig.inputTokens - compressed.inputTokens,
    });
  }

  // Print comparison
  console.log("\n" + "=".repeat(100));
  console.log("SIDE-BY-SIDE: How Claude interprets each version");
  console.log("=".repeat(100));

  for (const r of results) {
    console.log(`\n${"~".repeat(90)}`);
    console.log(`[${r.id}] -- ${r.reduction}% est reduction | actual: ${r.origActualInput} -> ${r.compActualInput} input tokens (saved ${r.actualTokenSaved})`);
    console.log(`${"~".repeat(90)}`);

    console.log(`\n  ORIGINAL:`);
    console.log(`  "${r.original}"\n`);

    console.log(`  COMPRESSED:`);
    console.log(`  "${r.compressed}"\n`);

    console.log(`  CLAUDE'S INTERPRETATION OF ORIGINAL:`);
    for (const line of r.origInterpretation.split("\n")) {
      console.log(`    ${line}`);
    }

    console.log(`\n  CLAUDE'S INTERPRETATION OF COMPRESSED:`);
    for (const line of r.compInterpretation.split("\n")) {
      console.log(`    ${line}`);
    }
  }

  // Summary
  if (results.length === 0) {
    console.log("\nNo prompts were compressed. The model returned all inputs unchanged.");
    return;
  }

  const totalOrigActual = results.reduce((s, r) => s + r.origActualInput, 0);
  const totalCompActual = results.reduce((s, r) => s + r.compActualInput, 0);
  const totalSaved = results.reduce((s, r) => s + r.actualTokenSaved, 0);
  const avgReduction = Math.round(
    results.reduce((s, r) => s + r.reduction, 0) / results.length,
  );

  console.log("\n" + "=".repeat(100));
  console.log("ACTUAL TOKEN USAGE (from Claude API)");
  console.log("=".repeat(100));

  console.log("\n  Per-prompt breakdown:");
  for (const r of results) {
    const pct = r.origActualInput > 0
      ? Math.round((1 - r.compActualInput / r.origActualInput) * 100)
      : 0;
    console.log(
      `    ${r.id.padEnd(20)} ${String(r.origActualInput).padStart(4)} -> ${String(r.compActualInput).padStart(4)} tokens  (saved ${String(r.actualTokenSaved).padStart(3)}, ${pct}% reduction)`,
    );
  }

  const totalPct = totalOrigActual > 0
    ? Math.round((1 - totalCompActual / totalOrigActual) * 100)
    : 0;

  console.log(`\n  TOTAL:                  ${totalOrigActual} -> ${totalCompActual} tokens  (saved ${totalSaved}, ${totalPct}% reduction)`);
  console.log(`  Avg est reduction:      ${avgReduction}%`);
  console.log(`\n  Review the interpretations above to judge semantic preservation.`);
}

run().catch(console.error);
