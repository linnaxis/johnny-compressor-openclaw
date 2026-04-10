# Install Johnny

Paste this prompt into Claude Code to set up Johnny:

---

I want you to set up Johnny, a local Ollama model that compresses verbose prompts into minimal shorthand tokens to save API costs. Named after Johnny Mnemonic.

## Prerequisites

1. **Ollama** must be installed and running:
   ```bash
   brew install ollama   # macOS
   ollama serve          # start the server
   ```

## Steps

1. Clone/locate the `johnny-compressor-openclaw` repository

2. Create the Ollama model from the Modelfile:
   ```bash
   cd <path-to-johnny-compressor-openclaw>
   ollama create johnny -f core/Modelfile
   ```

3. Verify the model works:
   ```bash
   echo "Can you please check my email and if there is anything new, summarize the key points and send me a brief overview?" | ollama run johnny
   ```
   Should output something like: `chk @new | sum | snd`

4. Try the CLI script:
   ```bash
   ./core/compress -v "Can you check my email and if there's anything new from Gordon, please summarize it and send the summary to me"
   ```

Johnny is now ready. It can be used:
- **Standalone**: via the `core/compress` CLI script
- **In OpenClaw**: via the plugin adapter (see INSTALL_OPENCLAW_PLUGIN.md)
