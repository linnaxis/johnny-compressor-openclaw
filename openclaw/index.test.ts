import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { compressPrompt, estimateTokens, resolveOllamaUrl } from "./src/compress.js";
import { createCompressTool } from "./src/compress-tool.js";

describe("estimateTokens", () => {
  it("estimates tokens as ceil(words * 1.3)", () => {
    expect(estimateTokens("hello world")).toBe(3); // 2 * 1.3 = 2.6 → 3
    expect(estimateTokens("one two three four five")).toBe(7); // 5 * 1.3 = 6.5 → 7
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("   ")).toBe(0);
  });
});

describe("resolveOllamaUrl", () => {
  const originalEnv = process.env["OPENCLAW_DOCKER"];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env["OPENCLAW_DOCKER"];
    } else {
      process.env["OPENCLAW_DOCKER"] = originalEnv;
    }
  });

  it("returns URL unchanged outside Docker", () => {
    delete process.env["OPENCLAW_DOCKER"];
    expect(resolveOllamaUrl("http://127.0.0.1:11434")).toBe(
      "http://127.0.0.1:11434",
    );
  });

  it("replaces localhost with host.docker.internal in Docker", () => {
    process.env["OPENCLAW_DOCKER"] = "1";
    expect(resolveOllamaUrl("http://127.0.0.1:11434")).toBe(
      "http://host.docker.internal:11434",
    );
    expect(resolveOllamaUrl("http://localhost:11434")).toBe(
      "http://host.docker.internal:11434",
    );
  });
});

describe("compressPrompt", () => {
  const defaultOptions = {
    ollamaBaseUrl: "http://127.0.0.1:11434",
    model: "johnny",
    minTokenThreshold: 50,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("skips compression below minTokenThreshold", async () => {
    const result = await compressPrompt("short msg", defaultOptions);
    expect(result.skipped).toBe(true);
    expect(result.compressed).toBe("short msg");
    expect(result.reductionPercent).toBe(0);
  });

  it("compresses via Ollama on success", async () => {
    const longText =
      "Hey, can you please research the latest news about renewable energy subsidies in the EU and send a nicely formatted HTML summary email to Alice and also make sure to include any relevant market data from today";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ response: "rsch EU renewable energy subsidies | sum | snd Alice .html +market-data" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await compressPrompt(longText, defaultOptions);
    expect(result.skipped).toBe(false);
    expect(result.compressed).toBe("rsch EU renewable energy subsidies | sum | snd Alice .html +market-data");
    expect(result.reductionPercent).toBeGreaterThan(0);
    expect(result.originalTokenEstimate).toBeGreaterThan(result.compressedTokenEstimate);
    expect(fetchSpy).toHaveBeenCalledOnce();

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:11434/api/generate");
    expect(JSON.parse(init!.body as string)).toEqual({
      model: "johnny",
      prompt: longText,
      stream: false,
    });
  });

  it("falls back to original text on fetch error", async () => {
    const longText = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection refused"));

    const result = await compressPrompt(longText, defaultOptions);
    expect(result.skipped).toBe(true);
    expect(result.compressed).toBe(longText);
  });

  it("falls back on non-200 response", async () => {
    const longText = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not found", { status: 404 }),
    );

    const result = await compressPrompt(longText, defaultOptions);
    expect(result.skipped).toBe(true);
    expect(result.compressed).toBe(longText);
  });

  it("falls back on empty response", async () => {
    const longText = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ response: "" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await compressPrompt(longText, defaultOptions);
    expect(result.skipped).toBe(true);
    expect(result.compressed).toBe(longText);
  });
});

describe("createCompressTool", () => {
  const options = {
    ollamaBaseUrl: "http://127.0.0.1:11434",
    model: "johnny",
    minTokenThreshold: 50,
  };

  it("returns a tool with the expected shape", () => {
    const tool = createCompressTool(options);
    expect(tool.name).toBe("johnny");
    expect(tool.parameters).toBeDefined();
    expect(typeof tool.execute).toBe("function");
  });

  it("executes and returns compressed text", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ response: "chk @new | sum" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const tool = createCompressTool(options);
    const longText = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ");
    const result = await tool.execute("call-1", { text: longText });

    expect(result.content[0]!.text).toBe("chk @new | sum");
  });

  it("returns verbose output when requested", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ response: "chk @new | sum" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const tool = createCompressTool(options);
    const longText = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ");
    const result = await tool.execute("call-2", {
      text: longText,
      verbose: true,
    });

    const text = result.content[0]!.text;
    expect(text).toContain("ORIGINAL");
    expect(text).toContain("COMPRESSED");
    expect(text).toContain("reduction");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
});
