export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type BridgeConfig = {
  host: string;
  port: number;
 autoPort: boolean;
 allowedHosts: string[];
 allowedRoots: string[];
  bridgeToken?: string;
  opencodeBaseUrl?: string;
  opencodeBin: string;
  opencodeHost: string;
  opencodePortStart: number;
  opencodeUsername: string;
  opencodePassword?: string;
  opencodeServiceConfigPath: string;
  stateDir: string;
  tunnel: "none" | "cloudflare" | "tailscale";
 tailscaleBin: string;
  cloudflaredBin: string;
};

export type BridgeSession = {
  bridgeSessionId: string;
  opencodeSessionId: string;
  repoPath: string;
  baseUrl: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
};

export type OpencodeMessagePart = {
  id?: string;
  type?: string;
  text?: string;
  [key: string]: unknown;
};

export type OpencodeMessage = Record<string, unknown> & {
  id?: string;
  type?: string;
  agent?: string;
  model?: { id?: string; providerID?: string; variant?: string };
  content?: OpencodeMessagePart[];
  text?: string;
};

export type OpencodeSession = Record<string, unknown> & {
  id?: string;
  title?: string;
  location?: { directory?: string };
  projectId?: string;
};

export type OpencodeDiff = Record<string, unknown> & {
  path?: string;
  oldPath?: string;
  newPath?: string;
  status?: string;
  diff?: string;
  patch?: string;
};

export type OpencodeStatus = Record<string, unknown>;

export type ToolResult<T extends JsonValue = JsonValue> = {
  structuredContent: T;
  content: Array<{ type: "text"; text: string }>;
};
