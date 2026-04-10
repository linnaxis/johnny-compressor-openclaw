# Integrate Dali + Johnny into OpenClaw

Paste this prompt into Claude Code to install both plugins into your OpenClaw instance in one go.

---

I want you to integrate two plugins into my OpenClaw instance:

1. **Dali Memory** — semantic vector memory (search + store + auto context injection)
2. **Johnny** — local prompt compression via Ollama (named after Johnny Mnemonic)

Both require Ollama running locally.

## Prerequisites

```bash
# Install Ollama
brew install ollama

# Pull embedding model (for Dali)
ollama pull nomic-embed-text

# Create compression model (for Johnny)
cd <path-to-johnny-compressor-openclaw>
ollama create johnny -f core/Modelfile

# Verify both
ollama list   # should show nomic-embed-text and johnny
```

## Step 1: Install Dali Memory Plugin

1. Copy the Dali plugin into OpenClaw:
   ```bash
   cp -r <path-to-dali-memory-openclaw>/openclaw/ <your-openclaw-repo>/extensions/dali-memory/
   ```

2. Create SDK subpath at `src/plugin-sdk/dali-memory.ts`:
   ```typescript
   export * from "../../extensions/dali-memory/api.js";
   ```

3. Add subpath export to root `package.json`

## Step 2: Install Johnny Plugin

1. Copy the Johnny plugin into OpenClaw:
   ```bash
   mkdir -p <your-openclaw-repo>/extensions/johnny/src
   cp <path-to-johnny-compressor-openclaw>/openclaw/index.ts <your-openclaw-repo>/extensions/johnny/
   cp <path-to-johnny-compressor-openclaw>/openclaw/api.ts <your-openclaw-repo>/extensions/johnny/
   cp <path-to-johnny-compressor-openclaw>/openclaw/package.json <your-openclaw-repo>/extensions/johnny/
   cp <path-to-johnny-compressor-openclaw>/openclaw/openclaw.plugin.json <your-openclaw-repo>/extensions/johnny/
   cp <path-to-johnny-compressor-openclaw>/openclaw/index.test.ts <your-openclaw-repo>/extensions/johnny/
   cp <path-to-johnny-compressor-openclaw>/openclaw/src/*.ts <your-openclaw-repo>/extensions/johnny/src/
   ```

2. Create SDK subpath at `src/plugin-sdk/johnny.ts`:
   ```typescript
   export * from "../../extensions/johnny/api.js";
   ```

3. Add subpath export to root `package.json`

## Step 3: Install Dependencies & Configure

1. Install:
   ```bash
   cd <your-openclaw-repo>
   pnpm install
   ```

2. Add both plugins to `openclaw.json`:
   ```json
   {
     "plugins": {
       "dali-memory": {
         "enabled": true,
         "dbPath": "~/.claude/dali/dali.db",
         "ollamaBaseUrl": "http://127.0.0.1:11434",
         "embeddingModel": "nomic-embed-text",
         "maxContextTokens": 400,
         "minRelevance": 0.35,
         "managedFiles": ["MEMORY.md", "TOOLS.md"]
       },
       "johnny": {
         "autoCompress": false,
         "minTokenThreshold": 50,
         "ollamaBaseUrl": "http://127.0.0.1:11434",
         "model": "johnny"
       }
     }
   }
   ```

## Step 4: Seed Dali & Verify

1. Index workspace files into Dali:
   ```bash
   npx tsx extensions/dali-memory/scripts/index-workspace.ts
   ```

2. Verify the build:
   ```bash
   pnpm tsgo
   ```
   Should show zero errors from both plugins.

## How They Work Together

```
User message arrives
    |
    v
[Johnny]                       (if autoCompress enabled)
    |  compress verbose text
    |  via Ollama johnny model
    v
[Dali Memory - context hook]   (before_prompt_build)
    |  embed message via Ollama nomic-embed-text
    |  KNN search for relevant memories
    |  inject top results into system prompt
    v
[LLM processes request]
    |
    v
[Agent can call:]
    - dali_search    (query memories)
    - dali_store     (save new memories)
    - johnny         (compress text on demand)
```

### Token Flow

| Stage | Tokens | Notes |
|-------|--------|-------|
| User message (verbose) | ~50-200 | Before compression |
| After Johnny | ~15-60 | 60-90% reduction (if autoCompress on) |
| Static workspace context | ~1,287 | MEMORY.md + TOOLS.md (before Dali) |
| Dali stub + injection | ~220-420 | Stubs + relevant memories only |
| **Net savings per turn** | **~900-1,200** | Combined effect |

### Ollama Models Required

| Model | Purpose | Size |
|-------|---------|------|
| `nomic-embed-text` | Vector embeddings for Dali | ~274 MB |
| `johnny` | Prompt compression (llama3 base) | ~4.7 GB |

Both run locally. No data leaves your machine.
