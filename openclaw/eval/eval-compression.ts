/**
 * Johnny Compression Evaluation Script
 *
 * Tests real compression against Ollama and evaluates:
 * 1. Token savings (estimated)
 * 2. Semantic preservation — can the compressed prompt be "decompressed" back to the original intent?
 *
 * Usage: bun extensions/johnny/eval-compression.ts
 */

import { compressPrompt, estimateTokens } from "./src/compress.js";

const OLLAMA_BASE = "http://127.0.0.1:11434";
const MODEL = "johnny";

const TEST_PROMPTS = [
  {
    id: "email-research",
    input:
      "Hey, can you please research the latest news about renewable energy subsidies in the EU and send a nicely formatted HTML summary email to Alice?",
    expectedIntent: "Research EU renewable energy subsidy news, summarize as HTML, email to Alice",
  },
  {
    id: "email-check",
    input:
      "I'd like you to check my email and if there's anything new from Alice, please summarize it and send the summary to me",
    expectedIntent: "Check email from Alice, summarize new messages, send summary",
  },
  {
    id: "file-read",
    input:
      "Can you read the file at docs/project-overview.docx and give me a brief summary of what's in it?",
    expectedIntent: "Read project overview file, summarize contents",
  },
  {
    id: "market-report",
    input:
      "I want you to write a detailed market report covering Japan equities performance over the last quarter, including key movers and sector analysis, and then send it as an HTML email to both Alice and Bob",
    expectedIntent:
      "Write Japan equities quarterly report with movers + sector analysis, email HTML to Alice and Bob",
  },
  {
    id: "multi-step",
    input:
      "First, please check if there are any new emails from Alice. If there are, read them and summarize the key points. Then research any topics she mentioned and prepare a brief response. Finally, send the response back to Alice as a nicely formatted email.",
    expectedIntent:
      "Check Alice's emails, summarize, research mentioned topics, draft response, send back to Alice",
  },
  {
    id: "reminder-set",
    input:
      "Can you set a reminder for 30 minutes from now to review Alice's reply about the quarterly budget proposal?",
    expectedIntent: "Set 30min reminder to review Alice's budget proposal reply",
  },
  {
    id: "code-task",
    input:
      "Please look at the backend API codebase and find all the places where we handle user authentication, then give me a summary of how the auth lifecycle works from login to token expiry",
    expectedIntent:
      "Search backend code for auth handling, summarize lifecycle (login to token expiry)",
  },
  {
    id: "already-terse",
    input: "chk @new | sum",
    expectedIntent: "Check new messages, summarize",
  },
  {
    id: "medium-complexity",
    input:
      "Can you check the current status of all our active ad campaigns and tell me which ones are about to expire in the next 24 hours?",
    expectedIntent: "Check active ad campaigns, list those expiring within 24h",
  },
  {
    id: "complex-analysis",
    input:
      "I need you to analyze our sales performance data for the last two weeks, compare it against the benchmark targets for the APAC region, identify any significant deviations or anomalies, and then prepare a comprehensive report with charts and send it to the entire team as an HTML email. Also, flag any deals that might need legal review.",
    expectedIntent:
      "Analyze 2-week sales performance vs APAC benchmarks, find anomalies, create report with charts, email team HTML, flag legal concerns",
  },
];

interface EvalResult {
  id: string;
  original: string;
  compressed: string;
  originalTokens: number;
  compressedTokens: number;
  reductionPercent: number;
  expectedIntent: string;
  skipped: boolean;
  preservesEntities: boolean;
  preservesActions: boolean;
  entityNotes: string;
  actionNotes: string;
}

/** Simple heuristic check: do key entities from the original appear in the compressed version? */
function checkEntityPreservation(
  original: string,
  compressed: string,
  expectedIntent: string,
): { preserved: boolean; notes: string } {
  const lowerOrig = original.toLowerCase();
  const lowerComp = compressed.toLowerCase();

  // Extract likely entities: proper nouns, numbers, file paths, technical terms
  const entityPatterns = [
    // Names (check both full and shortcode)
    { regex: /\balice\b/i, alternatives: ["alice"] },
    { regex: /\bbob\b/i, alternatives: ["bob"] },
    // Time references
    { regex: /\b(\d+)\s*(minutes?|hours?|days?|weeks?)\b/i, alternatives: null },
    // File paths
    { regex: /[\w/-]+\.\w{2,4}/g, alternatives: null },
    // Technical terms
    { regex: /\b(apac|html|equities|renewable|energy)\b/i, alternatives: null },
    // Numbers
    { regex: /\b\d+\b/g, alternatives: null },
  ];

  const missing: string[] = [];
  const found: string[] = [];

  for (const pattern of entityPatterns) {
    const matches = lowerOrig.match(pattern.regex);
    if (!matches) continue;

    for (const match of matches) {
      const trimmed = match.trim().toLowerCase();
      if (trimmed.length < 2) continue;

      const inCompressed =
        lowerComp.includes(trimmed) ||
        (pattern.alternatives?.some((alt) => lowerComp.includes(alt)) ??
          false);

      if (inCompressed) {
        found.push(trimmed);
      } else {
        // Check if the entity is semantically present via abbreviation
        const firstThreeChars = trimmed.slice(0, 3);
        if (lowerComp.includes(firstThreeChars)) {
          found.push(`${trimmed} (abbrev)`);
        } else {
          missing.push(trimmed);
        }
      }
    }
  }

  const uniqueMissing = [...new Set(missing)];
  const uniqueFound = [...new Set(found)];

  return {
    preserved: uniqueMissing.length === 0,
    notes:
      uniqueMissing.length > 0
        ? `Missing: ${uniqueMissing.join(", ")} | Found: ${uniqueFound.join(", ")}`
        : `All entities preserved: ${uniqueFound.join(", ")}`,
  };
}

/** Check if the compressed version preserves core action verbs. */
function checkActionPreservation(
  original: string,
  compressed: string,
): { preserved: boolean; notes: string } {
  const lowerOrig = original.toLowerCase();
  const lowerComp = compressed.toLowerCase();

  // Map verbose actions to their shortcodes
  const actionMap: Record<string, string[]> = {
    research: ["rsch", "research"],
    send: ["snd", "send"],
    check: ["chk", "check"],
    read: ["rd", "read"],
    write: ["wr", "write"],
    edit: ["ed", "edit"],
    summarize: ["sum", "summarize", "summary"],
    format: ["fmt", "format"],
    analyze: ["analyze", "analysis", "anlz"],
    report: ["rpt", "report"],
    remind: ["cron", "remind", "reminder"],
    find: ["find", "search", "look"],
    compare: ["compare", "cmp", "vs"],
    prepare: ["prepare", "prep"],
    flag: ["flag", "!"],
  };

  const missing: string[] = [];
  const found: string[] = [];

  for (const [action, codes] of Object.entries(actionMap)) {
    if (!lowerOrig.includes(action)) continue;

    const inCompressed = codes.some((code) => lowerComp.includes(code));
    if (inCompressed) {
      found.push(action);
    } else {
      missing.push(action);
    }
  }

  return {
    preserved: missing.length === 0,
    notes:
      missing.length > 0
        ? `Missing actions: ${missing.join(", ")} | Found: ${found.join(", ")}`
        : `All actions preserved: ${found.join(", ")}`,
  };
}

async function runEval(): Promise<void> {
  console.log("=== Johnny Compression Evaluation ===\n");
  console.log(`Model: ${MODEL}`);
  console.log(`Ollama: ${OLLAMA_BASE}`);
  console.log(`Test cases: ${TEST_PROMPTS.length}\n`);

  const results: EvalResult[] = [];

  for (const test of TEST_PROMPTS) {
    process.stdout.write(`[${test.id}] compressing... `);

    const result = await compressPrompt(test.input, {
      ollamaBaseUrl: OLLAMA_BASE,
      model: MODEL,
      minTokenThreshold: 0, // Force compression on all, even short ones
    });

    const entityCheck = checkEntityPreservation(
      test.input,
      result.compressed,
      test.expectedIntent,
    );
    const actionCheck = checkActionPreservation(test.input, result.compressed);

    results.push({
      id: test.id,
      original: test.input,
      compressed: result.compressed,
      originalTokens: result.originalTokenEstimate,
      compressedTokens: result.compressedTokenEstimate,
      reductionPercent: result.reductionPercent,
      expectedIntent: test.expectedIntent,
      skipped: result.skipped,
      preservesEntities: entityCheck.preserved,
      preservesActions: actionCheck.preserved,
      entityNotes: entityCheck.notes,
      actionNotes: actionCheck.notes,
    });

    console.log(
      `${result.reductionPercent}% reduction (${result.originalTokenEstimate} → ${result.compressedTokenEstimate} tok)`,
    );
  }

  // Print detailed results
  console.log("\n" + "=".repeat(100));
  console.log("DETAILED RESULTS");
  console.log("=".repeat(100));

  for (const r of results) {
    console.log(`\n--- [${r.id}] ---`);
    console.log(`  ORIGINAL (${r.originalTokens} tok est):`);
    console.log(`    ${r.original}`);
    console.log(`  COMPRESSED (${r.compressedTokens} tok est):`);
    console.log(`    ${r.compressed}`);
    console.log(`  EXPECTED INTENT:`);
    console.log(`    ${r.expectedIntent}`);
    console.log(`  REDUCTION: ${r.reductionPercent}%`);
    console.log(
      `  ENTITIES: ${r.preservesEntities ? "PASS" : "FAIL"} — ${r.entityNotes}`,
    );
    console.log(
      `  ACTIONS:  ${r.preservesActions ? "PASS" : "FAIL"} — ${r.actionNotes}`,
    );
  }

  // Summary table
  console.log("\n" + "=".repeat(100));
  console.log("SUMMARY");
  console.log("=".repeat(100));

  const totalOrigTokens = results.reduce((s, r) => s + r.originalTokens, 0);
  const totalCompTokens = results.reduce((s, r) => s + r.compressedTokens, 0);
  const avgReduction =
    results.length > 0
      ? Math.round(
          results.reduce((s, r) => s + r.reductionPercent, 0) / results.length,
        )
      : 0;
  const entityPassCount = results.filter((r) => r.preservesEntities).length;
  const actionPassCount = results.filter((r) => r.preservesActions).length;

  console.log(
    `\n  Total tokens:     ${totalOrigTokens} → ${totalCompTokens} (${Math.round((1 - totalCompTokens / totalOrigTokens) * 100)}% overall reduction)`,
  );
  console.log(`  Avg reduction:    ${avgReduction}%`);
  console.log(
    `  Entity preserved: ${entityPassCount}/${results.length} (${Math.round((entityPassCount / results.length) * 100)}%)`,
  );
  console.log(
    `  Action preserved: ${actionPassCount}/${results.length} (${Math.round((actionPassCount / results.length) * 100)}%)`,
  );

  // Quality score
  const qualityScore = Math.round(
    ((entityPassCount + actionPassCount) / (results.length * 2)) * 100,
  );
  console.log(`\n  Quality score:    ${qualityScore}% (entity + action preservation)`);
  console.log(
    `  Verdict:          ${qualityScore >= 80 ? "GOOD" : qualityScore >= 60 ? "ACCEPTABLE" : "NEEDS WORK"} — ${avgReduction}% avg compression at ${qualityScore}% quality`,
  );

  // Flag any problematic cases
  const problems = results.filter(
    (r) => !r.preservesEntities || !r.preservesActions,
  );
  if (problems.length > 0) {
    console.log(`\n  ⚠ Problem cases (${problems.length}):`);
    for (const p of problems) {
      const issues = [];
      if (!p.preservesEntities) issues.push("entities lost");
      if (!p.preservesActions) issues.push("actions lost");
      console.log(`    - ${p.id}: ${issues.join(", ")}`);
    }
  }
}

runEval().catch(console.error);
