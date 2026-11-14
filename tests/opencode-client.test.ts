import { describe, expect, it, vi } from "vitest";
import { OpencodeClient } from "../src/opencode/client.js";

describe("OpencodeClient", () => {
  it("deletes a session through the OpenCode v2 session endpoint", async () => {
    let requestedUrl = "";
    let requestedMethod = "";
    const client = new OpencodeClient({
      baseUrl: "http://localhost:4096",
      fetchImpl: async (url, init = {}) => {
        requestedUrl = String(url);
        requestedMethod = init.method ?? "GET";
        return new Response(JSON.stringify({ data: true }), { status: 200 });
      }
    });
    await expect(client.deleteSession("ses_done")).resolves.toBe(true);
    expect(requestedUrl).toBe("http://localhost:4096/api/session/ses_done");
    expect(requestedMethod).toBe("DELETE");
  });
  it("sends basic auth and JSON payloads", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (url, init = {}) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: "ses_1" }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const client = new OpencodeClient({ baseUrl: "http://127.0.0.1:4096/", username: "u", password: "p", fetchImpl });
    await client.createSession("Title");

    expect(calls[0]?.url).toBe("http://127.0.0.1:4096/api/session");
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from("u:p").toString("base64")}`);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ title: "Title" });
  });

  it("uses prompt_async for async messages", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      calls.push(String(url));
      return new Response(null, { status: 204 });
    };

    const client = new OpencodeClient({ baseUrl: "http://localhost:4096", fetchImpl });
    await client.sendMessage({ sessionId: "abc", text: "hello", async: true });
    expect(calls[0]).toBe("http://localhost:4096/api/session/abc/prompt");
  });

  it("filters session listing by the selected project directory", async () => {
    let requestedUrl = "";
    const client = new OpencodeClient({
      baseUrl: "http://localhost:4096",
      directory: "/workspace/projects/my-project",
      fetchImpl: async (url) => {
        requestedUrl = String(url);
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
    });
    await client.listSessions();
    expect(requestedUrl).toBe("http://localhost:4096/api/session?directory=%2Fworkspace%2Fprojects%2Fmy-project");
  });

  it("encodes an optional find-files directory using the v2 location deepObject parameter", async () => {
    let requestedUrl = "";
    const client = new OpencodeClient({ baseUrl: "http://localhost:4096", fetchImpl: async (url) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }});
    await client.findFiles("client.ts", 12, "src/opencode");
    expect(requestedUrl).toBe("http://localhost:4096/api/fs/find?query=client.ts&limit=12&location%5Bdirectory%5D=src%2Fopencode");
  });

  it("lists providers and the v2 model catalog without calling removed endpoints", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (url) => {
      calls.push(String(url));
      const data = String(url).includes("/api/model?") || String(url).endsWith("/api/model")
        ? [{ id: "gpt-6-luna", modelID: "gpt-6-luna", providerID: "openai", name: "GPT 6 Luna", settings: { apiKey: "must-not-leak" } }]
        : [{ id: "openai", name: "OpenAI", settings: { apiKey: "must-not-leak" }, headers: { Authorization: "must-not-leak" } }];
      return new Response(JSON.stringify({ location: { directory: "/repo" }, data }), { status: 200 });
    };

    const client = new OpencodeClient({ baseUrl: "http://localhost:4096", directory: "/repo", fetchImpl });
    expect(await client.listProviders()).toEqual([{ id: "openai", integrationID: undefined, name: "OpenAI", activation: undefined, package: undefined }]);
    expect(await client.listModels()).toEqual([{ id: "gpt-6-luna", modelID: "gpt-6-luna", providerID: "openai", type: undefined, family: undefined, name: "GPT 6 Luna", status: undefined, enabled: undefined, limit: undefined, capabilities: undefined, variants: undefined, cost: undefined, compatibility: undefined }]);
    expect(calls).toEqual([
      "http://localhost:4096/api/provider?location%5Bdirectory%5D=%2Frepo",
      "http://localhost:4096/api/model?location%5Bdirectory%5D=%2Frepo"
    ]);
  });
});


  it("waits for the matching session.idle SSE event instead of polling", async () => {
    const calls: string[] = [];
    const newline = String.fromCharCode(10);
    const stream = [
      { id: "evt_other", type: "session.idle", properties: { sessionID: "ses_other" } },
      { id: "evt_done", type: "session.idle", data: { sessionID: "ses_1" } }
    ].map((event) => "data: " + JSON.stringify(event) + newline + newline).join("");
    const fetchImpl: typeof fetch = async (url) => {
      const path = String(url);
      calls.push(path);
      if (path.endsWith("/api/session/active")) {
        return new Response(JSON.stringify({ data: { ses_1: { type: "running" } } }), { status: 200 });
      }
      if (path.endsWith("/api/event")) {
        return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
      }
      throw new Error("Unexpected request: " + path);
    };
    const client = new OpencodeClient({ baseUrl: "http://localhost:4096", fetchImpl });

    await expect(client.waitForSessionIdle("ses_1", 1000)).resolves.toMatchObject({
      type: "session.idle",
      data: { sessionID: "ses_1" }
    });
    expect(calls.filter((url) => url.endsWith("/api/session/active"))).toHaveLength(2);
    expect(calls.some((url) => url.endsWith("/api/event"))).toBe(true);
  });

  it("returns immediately when the session completed before waiting began", async () => {
    const calls: string[] = [];
    const client = new OpencodeClient({ baseUrl: "http://localhost:4096", fetchImpl: async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ data: {} }), { status: 200 });
    }});

    await expect(client.waitForSessionIdle("ses_1", 1000)).resolves.toMatchObject({ type: "already_idle" });
    expect(calls).toEqual(["http://localhost:4096/api/session/active"]);
  });



  it("switches both agent and model on the existing session", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const client = new OpencodeClient({ baseUrl: "http://localhost:4096", fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), body: init.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(null, { status: 204 });
    }});

    await client.selectModelAgent("ses_1", {
      providerID: "kilo",
      modelID: "nvidia/nemotron-3.5-super-vl:free",
      variant: "high",
      agent: "build"
    });
    expect(calls).toEqual([
      { url: "http://localhost:4096/api/session/ses_1/agent", body: { agent: "build" } },
      { url: "http://localhost:4096/api/session/ses_1/model", body: { model: { providerID: "kilo", id: "nvidia/nemotron-3.5-super-vl:free", variant: "high" } } }
    ]);
  });



  it("reconnects the SSE stream when a connection closes before the session is idle", async () => {
    let eventConnections = 0;
    const newline = String.fromCharCode(10);
    const doneEvent = "data: " + JSON.stringify({ id: "evt_done", type: "session.idle", properties: { sessionID: "ses_1" } }) + newline + newline;
    const client = new OpencodeClient({ baseUrl: "http://localhost:4096", fetchImpl: async (url) => {
      const path = String(url);
      if (path.endsWith("/api/session/active")) {
        return new Response(JSON.stringify({ data: { ses_1: { type: "running" } } }), { status: 200 });
      }
      if (path.endsWith("/api/event")) {
        eventConnections += 1;
        return new Response(eventConnections === 1 ? "" : doneEvent, { status: 200, headers: { "content-type": "text/event-stream" } });
      }
      throw new Error("Unexpected request: " + path);
    }});

    await expect(client.waitForSessionIdle("ses_1", 1000)).resolves.toMatchObject({
      type: "session.idle",
      properties: { sessionID: "ses_1" }
    });
    expect(eventConnections).toBe(2);
  });



  it("preserves provider rate-limit status and Retry-After guidance", async () => {
    const client = new OpencodeClient({ baseUrl: "http://localhost:4096", fetchImpl: async () =>
      new Response(JSON.stringify({ error: "rate limit exceeded" }), {
        status: 429,
        statusText: "Too Many Requests",
        headers: { "content-type": "application/json", "retry-after": "45" }
      })
    });
    await expect(client.listModels()).rejects.toThrow("429 Too Many Requests");
    await expect(client.listModels()).rejects.toThrow("Retry-After: 45");
  });


describe("OpenCode v2 API contract", () => {
  it("uses /api/info and treats versioned info as healthy", async () => {
    const calls: string[] = [];
    const client = new OpencodeClient({ baseUrl: "http://localhost:4096", fetchImpl: async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ version: "2.2.5", pid: 123 }), { status: 200 });
    }});
    expect(await client.health()).toEqual({ healthy: true, version: "2.2.5" });
    expect(calls).toEqual(["http://localhost:4096/api/info"]);
  });

  it("unwraps v2 data envelopes for sessions and agents", async () => {
    const calls: string[] = [];
    const client = new OpencodeClient({ baseUrl: "http://localhost:4096", fetchImpl: async (url) => {
      calls.push(String(url));
      const data = String(url).endsWith("/api/agent") ? [{ name: "explore" }] : [{ id: "ses_1" }];
      return new Response(JSON.stringify({ data }), { status: 200 });
    }});
    expect(await client.listSessions()).toEqual([{ id: "ses_1" }]);
    expect(await client.listAgents()).toEqual([{ name: "explore" }]);
    expect(calls).toEqual(["http://localhost:4096/api/session", "http://localhost:4096/api/agent"]);
  });

  it("sends v2 slash commands using name and text fields", async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    const client = new OpencodeClient({ baseUrl: "http://localhost:4096", fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), body: init.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(null, { status: 204 });
    }});
    await client.runCommand("ses_1", "review", "current changes", "build");
    expect(calls).toEqual([
      { url: "http://localhost:4096/api/session/ses_1/agent", body: { agent: "build" } },
      { url: "http://localhost:4096/api/session/ses_1/command", body: { name: "review", text: "current changes" } }
    ]);
  });

  it("rejects unsupported per-message system overrides before making an API request", async () => {
    let calls = 0;
    const client = new OpencodeClient({ baseUrl: "http://localhost:4096", fetchImpl: async () => {
      calls += 1;
      return new Response(null, { status: 204 });
    }});
    await expect(client.sendMessage({ sessionId: "ses_1", text: "hello", system: "custom system" }))
      .rejects.toThrow("does not support per-message system overrides");
    expect(calls).toBe(0);
  });

  it("maps noReply to v2 resume=false instead of sending an unsupported field", async () => {
    let body: unknown;
    const client = new OpencodeClient({ baseUrl: "http://localhost:4096", fetchImpl: async (_url, init = {}) => {
      body = init.body ? JSON.parse(String(init.body)) : undefined;
      return new Response(JSON.stringify({ data: { id: "inbox_1" } }), { status: 200 });
    }});
    await client.sendMessage({ sessionId: "ses_1", text: "record only", noReply: true });
    expect(body).toEqual({ text: "record only", delivery: "steer", resume: false });
  });

  it("returns the actual interrupted flag from the v2 interrupt response", async () => {
    const calls: string[] = [];
    const client = new OpencodeClient({ baseUrl: "http://localhost:4096", fetchImpl: async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ data: { interrupted: false } }), { status: 200 });
    }});
    expect(await client.abortSession("ses_1")).toBe(false);
    expect(calls).toEqual(["http://localhost:4096/api/session/ses_1/interrupt"]);
  });

  it("waits for completion on the native SSE event stream when async=false", async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const newline = String.fromCharCode(10);
    const event = "data: " + JSON.stringify({ id: "evt_done", type: "session.idle", data: { sessionID: "ses_1" } }) + newline + newline;
    const client = new OpencodeClient({ baseUrl: "http://localhost:4096", fetchImpl: async (url, init = {}) => {
      const path = String(url);
      calls.push({ url: path, method: init.method ?? "GET" });
      if (path.endsWith("/prompt")) return new Response(JSON.stringify({ data: { id: "inbox_1" } }), { status: 200 });
      if (path.endsWith("/api/session/active")) return new Response(JSON.stringify({ data: { ses_1: { type: "running" } } }), { status: 200 });
      if (path.endsWith("/api/event")) return new Response(event, { status: 200, headers: { "content-type": "text/event-stream" } });
      if (path.endsWith("/message?limit=20")) return new Response(JSON.stringify({ data: [{ id: "msg_1", type: "assistant" }] }), { status: 200 });
      throw new Error("Unexpected request: " + path);
    }});
    const response = await client.sendMessage({ sessionId: "ses_1", text: "hello", async: false });
    expect((response as unknown as { type?: string })?.type).toBe("assistant");
    expect(calls).toEqual([
      { url: "http://localhost:4096/api/session/ses_1/prompt", method: "POST" },
      { url: "http://localhost:4096/api/session/active", method: "GET" },
      { url: "http://localhost:4096/api/event", method: "GET" },
      { url: "http://localhost:4096/api/session/active", method: "GET" },
      { url: "http://localhost:4096/api/session/ses_1/message?limit=20", method: "GET" }
    ]);
  });

  it("sets session agent and model before sending a v2 prompt", async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const client = new OpencodeClient({ baseUrl: "http://localhost:4096", fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }});
    await client.sendMessage({ sessionId: "ses_1", text: "hello", async: true, agent: "explore", providerID: "alibaba-cn", modelID: "qwen3-coder-flash" });
    expect(calls.map(x => x.url)).toEqual([
      "http://localhost:4096/api/session/ses_1/agent",
      "http://localhost:4096/api/session/ses_1/model",
      "http://localhost:4096/api/session/ses_1/prompt"
    ]);
    expect(calls[0]?.body).toEqual({ agent: "explore" });
    expect(calls[1]?.body).toEqual({ model: { providerID: "alibaba-cn", id: "qwen3-coder-flash" } });
    expect(calls[2]?.body).toMatchObject({ text: "hello", delivery: "steer" });
  });
});

describe("OpenCode project directory context", () => {
  it("sends the selected repo directory on every API request", async () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const client = new OpencodeClient({
      baseUrl: "http://localhost:4096",
      directory: "/workspace/projects/sample-project",
      fetchImpl: async (url, init = {}) => {
        calls.push({ url: String(url), headers: init.headers as Record<string, string> });
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
    });
    await client.listSessions();
    await client.getSessionStatus();
    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toBe("http://localhost:4096/api/session/active");
    for (const call of calls) {
      expect(call.headers["x-opencode-directory"]).toBe("/workspace/projects/sample-project");
    }
  });

  it("readFile returns raw Markdown content as string without JSON parsing", async () => {
    const markdown = "# gemini-bridge\n\nThis is a markdown file.";
    let requestedUrl = "";
    const client = new OpencodeClient({
      baseUrl: "http://localhost:4096",
      fetchImpl: async (url) => {
        requestedUrl = String(url);
        return new Response(markdown, { status: 200, headers: { "content-type": "text/plain" } });
      }
    });
    const result = await client.readFile("gemini-bridge/README.md");
    expect(result).toBe(markdown);
    expect(requestedUrl).toBe("http://localhost:4096/api/fs/read/gemini-bridge/README.md");
  });

  it("readFile returns JSON-looking content as literal string, not parsed object", async () => {
    const jsonLike = '{ "key": "value", "number": 42 }';
    const client = new OpencodeClient({
      baseUrl: "http://localhost:4096",
      fetchImpl: async () => {
        return new Response(jsonLike, { status: 200, headers: { "content-type": "text/plain" } });
      }
    });
    const result = await client.readFile("config.json");
    expect(result).toBe(jsonLike);
    expect(typeof result).toBe("string");
  });

  it("readFile preserves readable HTTP error for missing file", async () => {
    const client = new OpencodeClient({
      baseUrl: "http://localhost:4096",
      fetchImpl: async () => {
        return new Response("Not Found", { status: 404, statusText: "Not Found" });
      }
    });
    await expect(client.readFile("missing.md")).rejects.toThrow("404");
    await expect(client.readFile("missing.md")).rejects.toThrow("Not Found");
  });
});

describe("OpenCode v2 session create/move with location directory", () => {
  it("createSession sends location.directory in request body when directory is provided", async () => {
    let sentBody: unknown = undefined;
    const client = new OpencodeClient({
      baseUrl: "http://localhost:4096",
      fetchImpl: async (url, init = {}) => {
        sentBody = init.body ? JSON.parse(String(init.body)) : undefined;
        return new Response(JSON.stringify({ data: { id: "ses_new", location: { directory: "/workspace/projects/my-repo" } } }), { status: 200 });
      }
    });
    const result = await client.createSession("Title", undefined, "/workspace/projects/my-repo");
    expect(sentBody).toEqual({ title: "Title", location: { directory: "/workspace/projects/my-repo" } });
    expect(result).toMatchObject({ id: "ses_new", location: { directory: "/workspace/projects/my-repo" } });
  });

  it("createSession does not send location when directory is omitted", async () => {
    let sentBody: unknown = undefined;
    const client = new OpencodeClient({
      baseUrl: "http://localhost:4096",
      fetchImpl: async (url, init = {}) => {
        sentBody = init.body ? JSON.parse(String(init.body)) : undefined;
        return new Response(JSON.stringify({ data: { id: "ses_new", location: { directory: "/workspace/projects" } } }), { status: 200 });
      }
    });
    await client.createSession("Title");
    expect(sentBody).toEqual({ title: "Title" });
  });

  it("createSession with no arguments sends empty body", async () => {
    let sentBody: unknown = undefined;
    const client = new OpencodeClient({
      baseUrl: "http://localhost:4096",
      fetchImpl: async (url, init = {}) => {
        sentBody = init.body ? JSON.parse(String(init.body)) : undefined;
        return new Response(JSON.stringify({ data: { id: "ses_new", location: { directory: "/workspace/projects" } } }), { status: 200 });
      }
    });
    await client.createSession();
    expect(sentBody).toEqual({});
  });

  it("moveSession sends POST to /api/session/{id}/move with directory body", async () => {
    let sentUrl = "";
    let sentBody: unknown = undefined;
    let sentMethod = "";
    const client = new OpencodeClient({
      baseUrl: "http://localhost:4096",
      fetchImpl: async (url, init = {}) => {
        sentUrl = String(url);
        sentMethod = init.method ?? "GET";
        sentBody = init.body ? JSON.parse(String(init.body)) : undefined;
        return new Response(null, { status: 204 });
      }
    });
    await expect(client.moveSession("ses_1", "/workspace/projects/new-repo")).resolves.toBeUndefined();
    expect(sentUrl).toBe("http://localhost:4096/api/session/ses_1/move");
    expect(sentMethod).toBe("POST");
    expect(sentBody).toEqual({ directory: "/workspace/projects/new-repo" });
  });

  it("moveSession sends delivery when provided", async () => {
    let sentBody: unknown = undefined;
    const client = new OpencodeClient({
      baseUrl: "http://localhost:4096",
      fetchImpl: async (url, init = {}) => {
        sentBody = init.body ? JSON.parse(String(init.body)) : undefined;
        return new Response(null, { status: 204 });
      }
    });
    await expect(client.moveSession("ses_1", "/workspace/projects/new-repo", "queue")).resolves.toBeUndefined();
    expect(sentBody).toEqual({ directory: "/workspace/projects/new-repo", delivery: "queue" });
  });

  it("moveSession sends delivery steer when provided", async () => {
    let sentBody: unknown = undefined;
    const client = new OpencodeClient({
      baseUrl: "http://localhost:4096",
      fetchImpl: async (url, init = {}) => {
        sentBody = init.body ? JSON.parse(String(init.body)) : undefined;
        return new Response(null, { status: 204 });
      }
    });
    await expect(client.moveSession("ses_1", "/workspace/projects/new-repo", "steer")).resolves.toBeUndefined();
    expect(sentBody).toEqual({ directory: "/workspace/projects/new-repo", delivery: "steer" });
  });

  it("moveSession throws on HTTP error", async () => {
    const client = new OpencodeClient({
      baseUrl: "http://localhost:4096",
      fetchImpl: async () => {
        return new Response(JSON.stringify({ error: "Session not found" }), { status: 404, statusText: "Not Found" });
      }
    });
    await expect(client.moveSession("ses_missing", "/workspace/projects/new-repo")).rejects.toThrow("404");
  });

  it("getSession returns location.directory from nested location object", async () => {
    const client = new OpencodeClient({
      baseUrl: "http://localhost:4096",
      fetchImpl: async () => {
        return new Response(JSON.stringify({ data: { id: "ses_1", location: { directory: "/workspace/projects/deep" } } }), { status: 200 });
      }
    });
    const session = await client.getSession("ses_1");
    expect(session.location.directory).toBe("/workspace/projects/deep");
  });
});


describe("dynamic OpenCode service URL", () => {
  it("uses the current service.json URL for every request", async () => {
    const { mkdtemp, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "bridge-dynamic-url-"));
    const serviceFile = join(dir, "service.json");
    const urls: string[] = [];
    const authHeaders: string[] = [];
    try {
      await writeFile(serviceFile, JSON.stringify({ url: "http://127.0.0.1:49374", password: "p1" }));
      const client = new OpencodeClient({ baseUrl: "http://127.0.0.1:4096", passwordFilePath: serviceFile, baseUrlFilePath: serviceFile, fetchImpl: async (url, init = {}) => { urls.push(String(url)); authHeaders.push((init.headers as Record<string, string>).Authorization); return new Response(JSON.stringify({ data: [] }), { status: 200 }); } });
      await client.listSessions();
      await writeFile(serviceFile, JSON.stringify({ url: "http://127.0.0.1:51000", password: "p2" }));
      await client.listSessions();
      expect(urls).toEqual(["http://127.0.0.1:49374/api/session", "http://127.0.0.1:51000/api/session"]);
      expect(authHeaders).toEqual([`Basic ${Buffer.from("opencode:p1").toString("base64")}`, `Basic ${Buffer.from("opencode:p2").toString("base64")}`]);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
