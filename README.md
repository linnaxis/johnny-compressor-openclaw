# 🦞 Johnny

<p align="center">
  <img src="jonhnny.png" alt="Johnny" width="400">
</p>

Local prompt compression via [Ollama](https://ollama.com). Compresses verbose natural-language prompts into minimal shorthand tokens, reducing API input costs by 60-90%.

Named after the short story *Johnny Mnemonic* by William Gibson.

Works as a **standalone CLI tool with Claude Code** or as an **OpenClaw plugin** with auto-compression, health checks, and eval tooling.

## How It Works

A fine-tuned Ollama model (llama3 base) strips filler words, collapses verbose phrases into terse commands, and applies a shorthand codebook — while preserving all entities, actions, and intent.

```
Input:  "Hey, can you please check my email and if there is anything new,
         summarize the key points and send me a brief overview?"

Output: "chk @new | sum | snd"
```

### Shorthand Codebook

| Code | Meaning | Code | Meaning |
|------|---------|------|---------|
| `snd` | send | `chk` | check |
| `rsch` | research | `rpt` | report |
| `rd` | read | `wr` | write |
| `ed` | edit | `fmt` | format |
| `sum` | summarize | `run` | execute |
| `@` | email | `@new` | unread |
| `#` | file | `^` | last output |
| `\|` | pipe/then | `>` | into |
| `+v` | verbose | `+d` | draft |
| `!` | no confirm | `?` | info only |
| `.html` | HTML format | `.md` | Markdown |

## Quick Install

### Prerequisites

- [Ollama](https://ollama.com) installed and running
- Node.js 18+ (for OpenClaw plugin)
- [OpenClaw](https://github.com/openclaw/openclaw) (optional, for plugin integration)

### OpenClaw Plugin Install (no clone needed)

If you already have Ollama running with the johnny model, install the plugin directly:

```bash
openclaw plugins install @openclaw/johnny
```

Or install from GitHub:

```bash
openclaw plugins install github:linnaxis/johnny-compressor-openclaw
```

### Full Setup (Ollama + model + plugin)

```bash
git clone https://github.com/linnaxis/johnny-compressor-openclaw.git
cd johnny-compressor-openclaw
./setup.sh
```

The setup script will:
1. Verify Ollama is installed (start it if not running)
2. Create the `johnny` model from the Modelfile
3. Install the OpenClaw plugin (if `openclaw` CLI is available)

Flags:
- `--skip-model` — skip Ollama model creation
- `--skip-plugin` — skip OpenClaw plugin installation

Safe to re-run (idempotent).

### Manual Setup

```bash
# 1. Install Ollama
brew install ollama        # macOS
ollama serve               # start the server

# 2. Create the model
git clone https://github.com/linnaxis/johnny-compressor-openclaw.git
cd johnny-compressor-openclaw
ollama create johnny -f core/Modelfile

# 3. Install OpenClaw plugin (pick one)
openclaw plugins install @openclaw/johnny          # from npm
openclaw plugins install github:linnaxis/johnny-compressor-openclaw  # from GitHub
openclaw plugins install ./openclaw                # from local clone
```

## Usage

### CLI Script

```bash
# Basic compression
./core/compress "Can you check my email and summarize anything new?"

# Verbose mode (shows before/after with token estimates)
./core/compress -v "I need you to analyze our trading data for the last two weeks and prepare a report"

# Copy to clipboard (macOS)
./core/compress -c "Please research the latest news about dark pools in APAC"

# From stdin
echo "Write a detailed market report and send it as HTML" | ./core/compress
```

### Direct Ollama

```bash
echo "your verbose prompt" | ollama run johnny
```

### Shell Alias

```bash
# In ~/.bashrc or ~/.zshrc
alias cc='<path-to-johnny-compressor-openclaw>/core/compress -vc'
```

Then: `cc "your verbose prompt"` — compresses, shows comparison, copies to clipboard.

## OpenClaw Plugin

The `openclaw/` directory is an OpenClaw plugin that integrates Johnny into the agent pipeline.

### Install

```bash
# From npm
openclaw plugins install @openclaw/johnny

# From GitHub (no npm publish required)
openclaw plugins install github:linnaxis/johnny-compressor-openclaw

# From a local clone
openclaw plugins install ./openclaw
```

### Features

- **`johnny` tool** — on-demand compression the agent can invoke
- **`before_prompt_build` hook** — optional auto-compression of user messages
- **`/johnny` command** — health checks, guided setup, and test compression

### Plugin Configuration

```json
{
  "plugins": {
    "johnny": {
      "autoCompress": false,
      "minTokenThreshold": 50,
      "ollamaBaseUrl": "http://127.0.0.1:11434",
      "model": "johnny"
    }
  }
}
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `autoCompress` | boolean | `false` | Auto-compress user messages before sending to LLM |
| `minTokenThreshold` | number | `50` | Skip compression for short messages |
| `ollamaBaseUrl` | string | `http://127.0.0.1:11434` | Ollama API endpoint |
| `model` | string | `johnny` | Ollama model name |

### `/johnny` Command Reference

| Command | Description |
|---------|-------------|
| `/johnny` or `/johnny status` | Check Ollama connectivity and model availability |
| `/johnny setup` | Guided setup: check each prerequisite, show fix instructions |
| `/johnny test` | Compress a sample prompt, show before/after with token stats |

### Startup Health Check

On plugin load, Johnny checks Ollama reachability and model availability in the background. If either is missing, a warning is logged with actionable fix instructions. Compression silently falls back to the original text when Ollama is unavailable.

## Evaluation

Four eval scripts measure compression quality:

```bash
# Basic compression eval (Ollama only)
npm run eval

# Full eval with consistency check (3 attempts per prompt, Claude Haiku interpretation)
ANTHROPIC_API_KEY=... npm run eval:full

# Roundtrip eval (does Claude understand compressed = original?)
ANTHROPIC_API_KEY=... npm run eval:roundtrip

# System prompt token analysis
ANTHROPIC_API_KEY=... npm run eval:system-prompt
```

### Results (from real eval runs)

| Metric | Value |
|--------|-------|
| Average compression | 60-90% token reduction |
| Entity preservation | ~80% (names, numbers, terms) |
| Action preservation | ~85% (verbs, operations) |
| Ollama latency | 50-200ms per compression |
| Graceful degradation | Falls back to original if Ollama is down |

## Troubleshooting

**Ollama not found**
Install from https://ollama.com or `brew install ollama` on macOS.

**Ollama not responding**
Run `ollama serve` to start the Ollama server.

**Model not found**
Run `ollama create johnny -f core/Modelfile` from this directory.

**Compression returns original text**
Johnny silently falls back when Ollama is unreachable. Run `/johnny status` (OpenClaw) or check `ollama list` to verify the model exists.

**Docker / remote Ollama**
Set `ollamaBaseUrl` in plugin config. The plugin auto-resolves `host.docker.internal` when `OPENCLAW_DOCKER=1` is set.

## Project Structure

```
johnny-compressor-openclaw/
├── README.md
├── package.json
├── LICENSE
├── setup.sh                    # One-command bootstrap
├── core/
│   ├── Modelfile               # Ollama model definition (llama3 base)
│   └── compress                # CLI compression script (bash)
├── openclaw/                   # OpenClaw plugin
│   ├── index.ts                # Plugin entry point (health check + /johnny command)
│   ├── api.ts                  # Public API barrel
│   ├── package.json            # Plugin package.json
│   ├── openclaw.plugin.json    # Plugin manifest + config schema
│   ├── tsconfig.json           # TypeScript config
│   ├── index.test.ts           # Vitest unit tests
│   ├── src/
│   │   ├── compress.ts         # Core compression logic
│   │   ├── compress-tool.ts    # johnny tool definition
│   │   └── health.ts           # Health check module
│   └── eval/
│       ├── eval-compression.ts
│       ├── eval-full.ts
│       ├── eval-roundtrip.ts
│       └── eval-system-prompt.ts
└── prompts/
    ├── INSTALL_JOHNNY.md
    ├── INSTALL_OPENCLAW_PLUGIN.md
    └── INTEGRATE_BOTH_OPENCLAW.md
```

## License

MIT
