import type { OpencodeDiff, OpencodeMessage, OpencodeSession, OpencodeStatus } from "../types.js";
import { readFileSync } from "node:fs";

export type OpencodeClientOptions = { baseUrl: string; username?: string; password?: string; passwordFilePath?: string; baseUrlFilePath?: string; directory?: string; fetchImpl?: typeof fetch };
export type SendMessageInput = { sessionId: string; text: string; providerID?: string; modelID?: string; variant?: string; agent?: string; system?: string; noReply?: boolean; tools?: Record<string, boolean>; async?: boolean };
type Envelope<T> = T | { data: T };

export class OpencodeClient {
  private readonly baseUrl: string;
  private readonly username?: string;
  private readonly password?: string;
  private readonly passwordFilePath?: string;
  private readonly baseUrlFilePath?: string;
  private readonly directory?: string;
  private readonly fetchImpl: typeof fetch;
  constructor(options: OpencodeClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, ""); this.username = options.username; this.password = options.password; this.passwordFilePath = options.passwordFilePath; this.baseUrlFilePath = options.baseUrlFilePath; this.directory = options.directory; this.fetchImpl = options.fetchImpl ?? fetch;
  }
  private currentBaseUrl(): string {
    if (!this.baseUrlFilePath) return this.baseUrl;
    let raw: string;
    try { raw = readFileSync(this.baseUrlFilePath, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return this.baseUrl;
      throw new Error("Unable to read OpenCode service URL");
    }
    try {
      const config = JSON.parse(raw) as { url?: unknown };
      if (config.url === undefined) return this.baseUrl;
      if (typeof config.url !== "string" || !config.url.trim()) throw new Error();
      const url = new URL(config.url);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error();
      return url.toString().replace(/\/$/, "");
    } catch { throw new Error("Invalid OpenCode service URL configuration"); }
  }
  get url(): string { return this.currentBaseUrl(); }
  private currentPassword(): string | undefined {
    if (!this.passwordFilePath) return this.password;
    let raw: string;
    try { raw = readFileSync(this.passwordFilePath, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw new Error("Unable to read OpenCode service credentials");
    }
    try {
      const config = JSON.parse(raw) as { password?: unknown };
      if (config.password !== undefined && typeof config.password !== "string") throw new Error();
      return typeof config.password === "string" && config.password.length > 0 ? config.password : undefined;
    } catch { throw new Error("Invalid OpenCode service credentials configuration"); }
  }
  private headers(extra?: HeadersInit): HeadersInit {
    const headers: Record<string, string> = { Accept: "application/json", ...(extra as Record<string, string> | undefined) };
    const password = this.currentPassword();
    if (password) headers.Authorization = `Basic ${Buffer.from(`${this.username ?? "opencode"}:${password}`).toString("base64")}`;
    if (this.directory) headers["x-opencode-directory"] = this.directory;
    return headers;
  }
  private async fetchRaw(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await this.fetchImpl(`${this.currentBaseUrl()}${path}`, { ...init, headers: this.headers(init.headers) });
    if (!res.ok) { const body = await res.text().catch(() => ""); const retryAfter = res.headers.get("retry-after"); throw new Error(`opencode ${init.method ?? "GET"} ${path} failed: ${res.status} ${res.statusText}${retryAfter ? ` - Retry-After: ${retryAfter}` : ""}${body ? ` - ${body}` : ""}`); }
    return res;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetchRaw(path, init);
    if (res.status === 204) return undefined as T;
    const body = await res.text(); return body ? JSON.parse(body) as T : undefined as T;
  }
  private data<T>(value: Envelope<T>): T { return value && typeof value === "object" && "data" in value ? (value as {data:T}).data : value as T; }
  private async get<T>(path: string): Promise<T> { return this.data(await this.request<Envelope<T>>(path)); }
  private async post<T>(path: string, body?: unknown): Promise<T> { return this.data(await this.request<Envelope<T>>(path, { method:"POST", headers:{"Content-Type":"application/json"}, body: body === undefined ? undefined : JSON.stringify(body) })); }
  async health(): Promise<{healthy:boolean; version?:string}> { const info = await this.request<{version?:string;pid?:number}>("/api/info"); return {healthy: Boolean(info.version), version: info.version}; }
  async listSessions(): Promise<OpencodeSession[]> { const query=this.directory?`?directory=${encodeURIComponent(this.directory)}`:""; return this.get(`/api/session${query}`); }
  async createSession(title?: string, parentID?: string, directory?: string): Promise<OpencodeSession> {
    const body: Record<string, unknown> = {};
    if (title) body.title = title;
    if (parentID) body.parentID = parentID;
    if (directory) body.location = { directory };
    return this.post("/api/session", body);
  }
  async moveSession(sessionId: string, directory: string, delivery?: "steer" | "queue"): Promise<void> {
    const body: Record<string, unknown> = { directory };
    if (delivery) body.delivery = delivery;
    await this.post<void>(`/api/session/${encodeURIComponent(sessionId)}/move`, body);
  }
  async getSession(id:string):Promise<OpencodeSession>{return this.get(`/api/session/${encodeURIComponent(id)}`);}
  async deleteSession(id:string):Promise<boolean>{return this.data(await this.request<Envelope<boolean>>(`/api/session/${encodeURIComponent(id)}`,{method:"DELETE"}));}
  async getSessionStatus():Promise<Record<string,OpencodeStatus>>{return this.get("/api/session/active");}
  async setSessionAgent(sessionId: string, agent: string): Promise<void> {
    await this.post<void>(`/api/session/${encodeURIComponent(sessionId)}/agent`, { agent });
  }
  async setSessionModel(sessionId: string, model: { providerID: string; modelID: string; variant?: string }): Promise<void> {
    await this.post<void>(`/api/session/${encodeURIComponent(sessionId)}/model`, {
      model: { providerID: model.providerID, id: model.modelID, ...(model.variant ? { variant: model.variant } : {}) }
    });
  }
  async selectModelAgent(sessionId: string, selection: { providerID: string; modelID: string; variant?: string; agent: string }): Promise<void> {
    await this.setSessionAgent(sessionId, selection.agent);
    await this.setSessionModel(sessionId, selection);
  }
  async waitForSessionIdle(id: string, timeoutMs = 120_000): Promise<Record<string, unknown>> {
    const isIdle = async () => {
      const active = await this.getSessionStatus();
      return !active[id] || active[id]?.type === "idle";
    };
    if (await isIdle()) return { type: "already_idle", properties: { sessionID: id } };

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.max(1, deadline - Date.now()));
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        const response = await this.fetchImpl(this.currentBaseUrl() + "/api/event", {
          headers: this.headers({ Accept: "text/event-stream" }),
          signal: controller.signal
        });
        if (!response.ok) throw new Error("OpenCode event stream failed: " + response.status + " " + response.statusText);
        if (!response.body) throw new Error("OpenCode event stream returned no response body");

        reader = response.body.getReader();
        if (await isIdle()) return { type: "already_idle", properties: { sessionID: id } };

        const decoder = new TextDecoder();
        let buffer = "";
        while (Date.now() < deadline) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, "\n");
          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const data = frame.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
            if (data) {
              let event: Record<string, unknown> | undefined;
              try { event = JSON.parse(data) as Record<string, unknown>; } catch { /* Ignore malformed keepalive frames. */ }
              if (event) {
                const properties = (event.properties ?? event.data ?? {}) as Record<string, unknown>;
                const eventSessionId = properties.sessionID;
                const status = properties.status as Record<string, unknown> | undefined;
                const terminal = event.type === "session.idle"
                  || (event.type === "session.status" && status?.type === "idle")
                  || ["session.execution.succeeded", "session.execution.failed", "session.execution.interrupted"].includes(String(event.type));
                if (terminal && eventSessionId === id) return event;
              }
            }
            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch (error) {
        if (controller.signal.aborted && Date.now() >= deadline) break;
        if (error instanceof Error && error.message.startsWith("OpenCode event stream failed:")) throw error;
      } finally {
        clearTimeout(timeout);
        await reader?.cancel().catch(() => undefined);
      }

      if (await isIdle()) return { type: "already_idle", properties: { sessionID: id } };
      await new Promise((resolve) => setTimeout(resolve, Math.min(150, Math.max(0, deadline - Date.now()))));
    }
    throw new Error("Timed out waiting for OpenCode session " + id + " to become idle");
  }
  async abortSession(id:string):Promise<boolean>{const result=await this.post<{interrupted:boolean}>(`/api/session/${encodeURIComponent(id)}/interrupt`);return result.interrupted;}
  async getMessages(id:string,limit?:number):Promise<OpencodeMessage[]>{const q=limit?`?limit=${encodeURIComponent(String(limit))}`:"";return this.get(`/api/session/${encodeURIComponent(id)}/message${q}`);}
  async sendMessage(input:SendMessageInput):Promise<OpencodeMessage|undefined>{
    if(input.system) throw new Error("OpenCode v2 session.prompt does not support per-message system overrides");
    if(input.tools) throw new Error("OpenCode v2 session.prompt does not support per-message tool overrides");
    const id=encodeURIComponent(input.sessionId);
    if(input.agent) await this.setSessionAgent(input.sessionId, input.agent);
    if(input.providerID && input.modelID) await this.setSessionModel(input.sessionId, { providerID: input.providerID, modelID: input.modelID, variant: input.variant });
    const admitted=await this.post<unknown>(`/api/session/${id}/prompt`,{text:input.text,delivery:"steer",...(input.noReply?{resume:false}:{})});
    if(input.async===false && !input.noReply){
      await this.waitForSessionIdle(input.sessionId);
      const messages=await this.getMessages(input.sessionId,20);
      return messages.find(message=>message.type==="assistant");
    }
    return admitted as OpencodeMessage|undefined;
  }
  async runCommand(sessionId:string,command:string,args?:string,agent?:string,modelID?:string):Promise<void>{const id=encodeURIComponent(sessionId);if(agent)await this.post(`/api/session/${id}/agent`,{agent});if(modelID)throw new Error("runCommand model selection requires providerID; use opencode_send_message to select a model");await this.post<void>(`/api/session/${id}/command`,{name:command,text:args??""});}
  async getDiff(id:string,messageID?:string):Promise<OpencodeDiff[]>{const q=messageID?`?messageID=${encodeURIComponent(messageID)}`:"";return this.get(`/api/session/${encodeURIComponent(id)}/diff${q}`);}
  async respondPermission(id:string,pid:string,response:"allow"|"deny"|"once"|"always",remember=false):Promise<boolean>{const decision=response==="allow"?"once":response==="deny"?"reject":response;await this.post(`/api/session/${encodeURIComponent(id)}/permission/${encodeURIComponent(pid)}/reply`,{decision:remember&&decision==="once"?"always":decision});return true;}
  async readFile(path:string):Promise<string>{const res = await this.fetchRaw(`/api/fs/read/${path.split("/").map(encodeURIComponent).join("/")}`);return await res.text();}
  async findFiles(query:string,limit=50,directory?:string):Promise<string[]>{const p=new URLSearchParams({query,limit:String(limit)});if(directory)p.set("location[directory]",directory);return this.get(`/api/fs/find?${p}`);}
  async fileStatus():Promise<unknown[]>{return this.get("/api/vcs/status");}
  async vcs():Promise<unknown>{return this.get("/api/vcs");}
  private locationQuery(): string {
    return this.directory ? `?location%5Bdirectory%5D=${encodeURIComponent(this.directory)}` : "";
  }
  async listAgents():Promise<unknown[]>{
    const agents = await this.get<Array<Record<string, unknown>>>(`/api/agent${this.locationQuery()}`);
    return agents.map(({id, name, model, description, mode, hidden, steps}) => ({
      id, name, model, description, mode, hidden, steps
    }));
  }
  async listCommands():Promise<unknown[]>{return this.get("/api/command");}
  async listProviders():Promise<unknown[]>{
    const providers = await this.get<Array<Record<string, unknown>>>(`/api/provider${this.locationQuery()}`);
    return providers.map(({id, integrationID, name, activation, package: providerPackage}) => ({
      id, integrationID, name, activation, package: providerPackage
    }));
  }
  async listModels():Promise<unknown[]>{
    const models = await this.get<Array<Record<string, unknown>>>(`/api/model${this.locationQuery()}`);
    return models.map(({id, modelID, providerID, type, family, name, status, enabled, limit, capabilities, variants, cost, compatibility}) => ({
      id, modelID, providerID, type, family, name, status, enabled, limit, capabilities, variants, cost, compatibility
    }));
  }
}
