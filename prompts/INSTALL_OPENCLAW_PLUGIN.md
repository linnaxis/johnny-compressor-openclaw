# Install Johnny OpenClaw Plugin

Paste this prompt into Claude Code to wire the Johnny plugin into your OpenClaw instance:

---

I want you to integrate the Johnny plugin into my OpenClaw instance. The plugin source is in the `openclaw/` directory of the `johnny-compressor-openclaw` repo.

## Steps

1. Copy the plugin files into OpenClaw:
   ```bash
   mkdir -p <your-openclaw-repo>/extensions/johnny/src
   cp <path-to-johnny-compressor-openclaw>/openclaw/index.ts <your-openclaw-repo>/extensions/johnny/
   cp <path-to-johnny-compressor-openclaw>/openclaw/api.ts <your-openclaw-repo>/extensions/johnny/
   cp <path-to-johnny-compressor-openclaw>/openclaw/package.json <your-openclaw-repo>/extensions/johnny/
   cp <path-to-johnny-compressor-openclaw>/openclaw/openclaw.plugin.json <your-openclaw-repo>/extensions/johnny/
   cp <path-to-johnny-compressor-openclaw>/openclaw/index.test.ts <your-openclaw-repo>/extensions/johnny/
   cp <path-to-johnny-compressor-openclaw>/openclaw/src/*.ts <your-openclaw-repo>/extensions/johnny/src/
   ```

2. Create the plugin SDK subpath at `src/plugin-sdk/johnny.ts`:
   ```typescript
   export * from "../../extensions/johnny/api.js";
   ```

3. Add a subpath export to the root `package.json`

4. Install dependencies:
   ```bash
   cd <your-openclaw-repo>
   pnpm install
   ```

5. Add the plugin config to `openclaw.json`:
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

6. Verify the build:
   ```bash
   pnpm tsgo
   ```

## Config Options

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `autoCompress` | boolean | `false` | Auto-compress user messages before sending to LLM |
| `minTokenThreshold` | number | `50` | Skip compression for messages under this token count |
| `ollamaBaseUrl` | string | `http://127.0.0.1:11434` | Ollama API endpoint |
| `model` | string | `johnny` | Ollama model name |
