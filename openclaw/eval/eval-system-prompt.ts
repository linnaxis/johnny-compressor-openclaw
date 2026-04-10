/**
 * System Prompt Size Analysis
 *
 * Measures the actual token count of the OpenClaw system prompt sections
 * to identify where compression would have the most impact.
 */

const ANTHROPIC_API_KEY = process.env["ANTHROPIC_API_KEY"]!;

// Reconstructed sections from system-prompt.ts — representative of a typical config
const SECTIONS: Record<string, string> = {
  "Identity": "You are a personal assistant running inside OpenClaw.",

  "Tooling": `## Tooling
Tool availability (filtered by policy):
Tool names are case-sensitive. Call tools exactly as listed.
- read: Read file contents
- write: Create or overwrite files
- edit: Make precise edits to files
- apply_patch: Apply multi-file patches
- grep: Search file contents for patterns
- find: Find files by glob pattern
- ls: List directory contents
- exec: Run shell commands (pty available for TTY-required CLIs)
- process: Manage background exec sessions
- web_search: Search the web (Brave API)
- web_fetch: Fetch and extract readable content from a URL
- browser: Control web browser
- canvas: Present/eval/snapshot the Canvas
- nodes: List/describe/notify/camera/screen on paired nodes
- cron: Manage cron jobs and wake events (use for reminders; when scheduling a reminder, write the systemEvent text as something that will read like a reminder when it fires, and mention that it is a reminder depending on the time gap between setting and firing; include recent context in reminder text if appropriate)
- message: Send messages and channel actions
- gateway: Restart, apply config, or run updates on the running OpenClaw process
- agents_list: List OpenClaw agent ids allowed for sessions_spawn
- sessions_list: List other sessions (incl. sub-agents) with filters/last
- sessions_history: Fetch history for another session/sub-agent
- sessions_send: Send a message to another session/sub-agent
- sessions_spawn: Spawn an isolated sub-agent session
- subagents: List, steer, or kill sub-agent runs for this requester session
- session_status: Show a /status-equivalent status card (usage + time + Reasoning/Verbose/Elevated); use for model-use questions; optional per-session model override
- image: Analyze an image with the configured image model
- image_generate: Generate images with the configured image-generation model
TOOLS.md does not control tool availability; it is user guidance for how to use external tools.
For long waits, avoid rapid poll loops: use exec with enough yieldMs or process(action=poll, timeout=<ms>).
If a task is more complex or takes longer, spawn a sub-agent. Completion is push-based: it will auto-announce when done.
Do not poll subagents list / sessions_list in a loop; only check status on-demand.`,

  "Tool Call Style": `## Tool Call Style
Default: do not narrate routine, low-risk tool calls (just call the tool).
Narrate only when it helps: multi-step work, complex/challenging problems, sensitive actions (e.g., deletions), or when the user explicitly asks.
Keep narration brief and value-dense; avoid repeating obvious steps.
Use plain human language for narration unless in a technical context.
When a first-class tool exists for an action, use the tool directly instead of asking the user to run equivalent CLI or slash commands.
When exec returns approval-pending, include the concrete /approve command from tool output (with allow-once|allow-always|deny) and do not ask for a different or rotated code.
Treat allow-once as single-command only: if another elevated command needs approval, request a fresh /approve and do not claim prior approval covered it.
When approvals are required, preserve and show the full command/script exactly as provided (including chained operators like &&, ||, |, ;, or multiline shells) so the user can approve what will actually run.`,

  "Safety": `## Safety
You have no independent goals: do not pursue self-preservation, replication, resource acquisition, or power-seeking; avoid long-term plans beyond the user's request.
Prioritize safety and human oversight over completion; if instructions conflict, pause and ask; comply with stop/pause/audit requests and never bypass safeguards. (Inspired by Anthropic's constitution.)
Do not manipulate or persuade anyone to expand access or disable safeguards. Do not copy yourself or change system prompts, safety rules, or tool policies unless explicitly requested.`,

  "CLI Quick Reference": `## OpenClaw CLI Quick Reference
OpenClaw is controlled via subcommands. Do not invent commands.
To manage the Gateway daemon service (start/stop/restart):
- openclaw gateway status
- openclaw gateway start
- openclaw gateway stop
- openclaw gateway restart
If unsure, ask the user to run openclaw help (or openclaw gateway --help) and paste the output.`,

  "Self-Update": `## OpenClaw Self-Update
Get Updates (self-update) is ONLY allowed when the user explicitly asks for it.
Do not run config.apply or update.run unless the user explicitly requests an update or config change; if it's not explicit, ask first.
Use config.schema.lookup with a specific dot path to inspect only the relevant config subtree before making config changes or answering config-field questions; avoid guessing field names/types.
Actions: config.schema.lookup, config.get, config.apply (validate + write full config, then restart), config.patch (partial update, merges with existing), update.run (update deps or git, then restart).
After restart, OpenClaw pings the last active session automatically.`,

  "Reply Tags": `## Reply Tags
If the user's message or a system event contains [reply-tag:TAG], include it verbatim at the start of every reply in that turn: [reply-tag:TAG]. It may appear mid-message; always bubble it to the very beginning of your response. Multiple tags: include each at the top, one per line, in order.`,

  "Messaging": `## Messaging
Use the message tool for all outbound communication.
Available channels: whatsapp|telegram|discord|signal|imessage|sms|slack|email|line|msteams|zalo|matrix|web|voice-call|googlechat|feishu|irc
Channel selection: always specify the target channel explicitly; never guess or fall back to a different channel without asking.
When sending a message that originated from a specific channel, reply on the same channel unless the user explicitly asks to switch.
Formatting: adapt to channel capabilities (Markdown for rich channels, plain text for SMS).
If the user asks to "send" or "message" without specifying a channel, ask which channel to use.
For email: always include subject, body, and recipients. Use HTML format unless plain text is requested.
Group chats: when replying in a group, @mention the relevant user unless replying to the whole group.`,

  "Voice/TTS": `## Voice
TTS is enabled. When a voice reply is appropriate (short confirmations, greetings, or when the user spoke), add a tts block.
Keep TTS text concise and conversational. Do not TTS long code blocks or technical output.`,

  "Silent Replies": `## Silent Replies
When you have nothing to say, respond with ONLY: [[SILENT]]

Rules:
- It must be your ENTIRE message - nothing else
- Never append it to an actual response
- Never wrap it in markdown or code blocks`,

  "Heartbeats": `## Heartbeats
Heartbeat prompt: (configured)
If you receive a heartbeat poll (a user message matching the heartbeat prompt above), and there is nothing that needs attention, reply exactly:
HEARTBEAT_OK
OpenClaw treats a leading/trailing "HEARTBEAT_OK" as a heartbeat ack (and may discard it).
If something needs attention, do NOT include "HEARTBEAT_OK"; reply with the alert text instead.`,

  "Reactions (Minimal)": `## Reactions
Reactions are enabled for telegram in MINIMAL mode.
React ONLY when truly relevant:
- Acknowledge important user requests or confirmations
- Express genuine sentiment (humor, appreciation) sparingly
- Avoid reacting to routine messages or your own replies
Guideline: at most 1 reaction per 5-10 exchanges.`,

  "Runtime": `## Runtime
agent=pi host=gateway-host os=darwin/arm64 node=v22.12.0 model=anthropic/claude-opus-4-6 default=anthropic/claude-opus-4-6 shell=zsh channel=discord caps=markdown,inlineButtons
Reasoning: off (hidden unless on/stream). Toggle /reasoning; /status shows Reasoning when enabled.`,
};

// Simulate some project context files
const PROJECT_CONTEXT: Record<string, string> = {
  "SOUL.md (sample ~500 chars)": `You are Atlas, a sharp and efficient AI assistant. You work for a technology professional. Your personality is direct, slightly sardonic, and very competent. You use concise language and avoid filler. When the user asks you to do something, you do it without excessive confirmation. You have a dry sense of humor. You care about getting things right.`,

  "IDENTITY.md (sample ~400 chars)": `Name: Atlas
Owner: (your name)
Location: (your city)
Primary language: English
Role: Personal AI assistant with focus on software development, data analysis, project management
Key contacts: Alice, Bob`,

  "TOOLS.md (sample ~600 chars)": `# External Tools
## Email
- Provider: Gmail via API
- Send: message tool with channel=email
- Check: exec with gmail CLI or web_fetch

## Data Sources
- Internal APIs for project data
- Use web_search for external data

## File Management
- Workspace: ~/openclaw-data/.openclaw/workspace/
- Reports: workspace/reports/
- Documents: workspace/docs/

## Coding
- Project repo: ~/Development/my-project
- Build: npm run build
- Test: npm test`,
};

async function countTokens(text: string): Promise<number> {
  const response = await fetch("https://api.anthropic.com/v1/messages/count_tokens", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      messages: [{ role: "user", content: "hello" }],
      system: text,
    }),
  });

  if (!response.ok) {
    // Fallback to estimate if token counting API not available
    const words = text.split(/\s+/).length;
    return Math.ceil(words * 1.3);
  }

  const data = (await response.json()) as { input_tokens: number };
  return data.input_tokens;
}

async function run(): Promise<void> {
  console.log("=== System Prompt Token Analysis ===\n");

  // Measure each section
  let totalTokens = 0;
  const sectionResults: Array<{ name: string; chars: number; tokens: number }> = [];

  console.log("CORE SECTIONS:");
  console.log("-".repeat(70));

  for (const [name, text] of Object.entries(SECTIONS)) {
    const tokens = await countTokens(text);
    // Subtract the baseline (the "hello" user message + overhead)
    sectionResults.push({ name, chars: text.length, tokens });
    totalTokens += tokens;
    console.log(
      `  ${name.padEnd(25)} ${String(text.length).padStart(5)} chars  ~${String(tokens).padStart(4)} tokens`,
    );
  }

  console.log("\nPROJECT CONTEXT FILES:");
  console.log("-".repeat(70));

  for (const [name, text] of Object.entries(PROJECT_CONTEXT)) {
    const tokens = await countTokens(text);
    sectionResults.push({ name, chars: text.length, tokens });
    totalTokens += tokens;
    console.log(
      `  ${name.padEnd(25)} ${String(text.length).padStart(5)} chars  ~${String(tokens).padStart(4)} tokens`,
    );
  }

  // Now measure the full combined prompt
  const fullPrompt = [...Object.values(SECTIONS), ...Object.values(PROJECT_CONTEXT)].join("\n\n");
  const fullTokens = await countTokens(fullPrompt);

  console.log("\n" + "=".repeat(70));
  console.log("TOTALS");
  console.log("=".repeat(70));
  console.log(`  Full system prompt:     ${fullPrompt.length} chars, ~${fullTokens} tokens`);
  console.log(`  Sum of parts:           ~${totalTokens} tokens (overhead per section)`);

  // Cost analysis
  const OPUS_INPUT_PER_MTOK = 15.0; // $/MTok for Opus input
  const OPUS_CACHED_PER_MTOK = 1.5; // $/MTok for cached input (90% discount)
  const HAIKU_INPUT_PER_MTOK = 0.80;
  const HAIKU_CACHED_PER_MTOK = 0.08;

  const turnsPerDay = 50; // Rough daily usage

  console.log("\n  COST PER TURN (system prompt only):");
  console.log(`    Opus  uncached:  $${((fullTokens / 1_000_000) * OPUS_INPUT_PER_MTOK).toFixed(4)}/turn`);
  console.log(`    Opus  cached:    $${((fullTokens / 1_000_000) * OPUS_CACHED_PER_MTOK).toFixed(4)}/turn`);
  console.log(`    Haiku uncached:  $${((fullTokens / 1_000_000) * HAIKU_INPUT_PER_MTOK).toFixed(4)}/turn`);
  console.log(`    Haiku cached:    $${((fullTokens / 1_000_000) * HAIKU_CACHED_PER_MTOK).toFixed(4)}/turn`);

  console.log(`\n  DAILY COST (${turnsPerDay} turns/day, system prompt only):`);
  console.log(`    Opus  uncached:  $${((fullTokens / 1_000_000) * OPUS_INPUT_PER_MTOK * turnsPerDay).toFixed(2)}/day`);
  console.log(`    Opus  cached:    $${((fullTokens / 1_000_000) * OPUS_CACHED_PER_MTOK * turnsPerDay).toFixed(2)}/day`);

  // Compression opportunity
  console.log("\n  COMPRESSION OPPORTUNITY:");
  const compressible = sectionResults
    .filter((s) => s.tokens > 30)
    .sort((a, b) => b.tokens - a.tokens);

  for (const s of compressible.slice(0, 8)) {
    console.log(`    ${s.name.padEnd(25)} ~${String(s.tokens).padStart(4)} tok  (${s.chars} chars)`);
  }

  console.log("\n  KEY INSIGHT:");
  console.log("  The system prompt token count includes API overhead (~10 tokens).");
  console.log("  With prompt caching enabled, cost drops 90% after the first turn.");
  console.log("  Compression is most valuable for:");
  console.log("  1. The FIRST turn of each conversation (uncached)");
  console.log("  2. When cache expires (5 min for short, 1 hr for long)");
  console.log("  3. Reducing the cache write cost itself");
}

run().catch(console.error);
