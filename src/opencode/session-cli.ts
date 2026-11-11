import { execFile as nodeExecFile } from "node:child_process";
import type { ExecFileOptions } from "node:child_process";
import type { OpencodeSession } from "../types.js";

export type SessionCliCommandOptions = {
  cwd: string;
  timeout: number;
  maxBuffer: number;
  windowsHide: boolean;
};

export type SessionCliCommandResult = { stdout: string; stderr: string };
export type SessionCliRunner = (
  file: string,
  args: string[],
  options: SessionCliCommandOptions
) => Promise<SessionCliCommandResult>;

const defaultRunner: SessionCliRunner = (file, args, options) =>
  new Promise((resolve, reject) => {
    nodeExecFile(file, args, options as ExecFileOptions, (error, stdout, stderr) => {
      if (error) {
        const detail = String(stderr || stdout || error.message).trim();
        reject(new Error(`OpenCode CLI ${args.join(" ")} failed: ${detail}`, { cause: error }));
        return;
      }
      resolve({ stdout: String(stdout), stderr: String(stderr) });
    });
  });

const COMMAND_OPTIONS = {
  timeout: 30_000,
  maxBuffer: 10 * 1024 * 1024,
  windowsHide: true
} as const;

export class OpencodeSessionCli {
  constructor(
    private readonly executable: string,
    private readonly run: SessionCliRunner = defaultRunner
  ) {}

  async listSessions(cwd: string): Promise<OpencodeSession[]> {
    const result = await this.run(
      this.executable,
      ["session", "list", "--max-count", "1000", "--format", "json"],
      { cwd, ...COMMAND_OPTIONS }
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
    } catch (error) {
      throw new Error("OpenCode session list did not return valid JSON", { cause: error });
    }
    if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item !== "object" || typeof item.id !== "string")) {
      throw new Error("OpenCode session list returned an invalid session array");
    }
    return parsed as OpencodeSession[];
  }

  async deleteSession(sessionId: string, cwd: string): Promise<{ output: string }> {
    const result = await this.run(
      this.executable,
      ["session", "delete", sessionId],
      { cwd, ...COMMAND_OPTIONS }
    );
    return { output: result.stdout.trim() || result.stderr.trim() };
  }
}
