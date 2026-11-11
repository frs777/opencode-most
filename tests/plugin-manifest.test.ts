import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const PLUGIN_ROOT = join(__dirname, "..", "plugin-source", "opencode-bridge");
const MANIFEST_PATH = join(PLUGIN_ROOT, ".codex-plugin", "plugin.json");
const APP_TEMPLATE_PATH = join(PLUGIN_ROOT, ".app.json.example");
const SKILLS_DIR = join(PLUGIN_ROOT, "skills");

const EXPECTED_CHATGPT_TOOLS = [
  "bridge_health",
  "list_projects",
  "opencode_start",
  "opencode_stop",
  "opencode_create_session",
  "opencode_list_sessions",
  "opencode_attach_session",
  "opencode_get_active_session",
  "opencode_set_active_session",
  "opencode_get_session_status",
  "opencode_delete_session",
  "opencode_send_message",
  "opencode_wait_for_completion",
  "opencode_get_messages",
  "opencode_get_diff",
  "opencode_abort",
  "opencode_respond_permission",
  "opencode_read_file",
  "opencode_find_files",
  "opencode_vcs_status",
  "opencode_capabilities",
  "opencode_select_model_agent"
];

function isStrictSemver(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/.test(value);
}

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, "utf8"));
}

describe("ChatGPT plugin manifest", () => {
  it("uses the installed ChatGPT app manifest format", async () => {
    const manifest = await readJson(MANIFEST_PATH);
    expect(manifest.apps).toBe("./.app.json");
    expect(manifest.author.name).toBe("App developer");
    expect(manifest.interface.displayName).toBe("opencode-bridge");
    expect(manifest.interface.category).toBe("Other");
    expect(Array.isArray(manifest.interface.capabilities)).toBe(true);
    expect(manifest.interface.defaultPrompt).toBeNull();
  });

  it("has a valid portable name, description, and version", async () => {
    const manifest = await readJson(MANIFEST_PATH);
    expect(manifest.name).toBe("opencode-bridge");
    expect(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(manifest.name)).toBe(true);
    expect(typeof manifest.description).toBe("string");
    expect(manifest.description.length).toBeGreaterThan(0);
    expect(isStrictSemver(manifest.version)).toBe(true);
  });

  it("keeps the private ChatGPT App ID as a placeholder in the public template", async () => {
    const app = await readJson(APP_TEMPLATE_PATH);
    expect(app.apps["opencode-bridge"].id).toBe("REPLACE_WITH_PRIVATE_CHATGPT_APP_ID");
    expect(JSON.stringify(app)).not.toMatch(/asdk_app_[a-f0-9]{20,}/);
  });

  it("documents the exact 22 actions exposed by the installed ChatGPT app", async () => {
    const catalog = await readFile(join(PLUGIN_ROOT, "CHATGPT-TOOLS.md"), "utf8");
    const documented = [...catalog.matchAll(/^\|\s*([a-z][a-z0-9_]*)\s*\|/gm)].map((match) => match[1]);
    expect(documented).toEqual(EXPECTED_CHATGPT_TOOLS);
    expect(documented).toHaveLength(22);
    expect(new Set(documented).size).toBe(22);
    expect(documented).not.toContain("opencode_delete_session_by_locator");
  });

  it("validates every skill frontmatter and matches its directory name", async () => {
    const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory());
    expect(directories.length).toBe(5);

    for (const directory of directories) {
      const content = await readFile(join(SKILLS_DIR, directory.name, "SKILL.md"), "utf8");
      const frontmatter = content.match(/^---\n([\s\S]*?)\n---\n/);
      expect(frontmatter, directory.name).not.toBeNull();

      const name = frontmatter![1].match(/^name:\s*([a-z0-9-]+)\s*$/m)?.[1];
      const description = frontmatter![1].match(/^description:\s*\|\n((?:[ \t]+.*\n?)+)/m)?.[1]?.trim();
      expect(name, directory.name).toBe(directory.name);
      expect(description, directory.name).toBeTruthy();
      expect(description!.startsWith("Use when "), directory.name).toBe(true);
    }
  });
});

describe("SemVer 2.0.0 validation", () => {
  it.each(["1.0.0", "1.0.0-alpha.1", "1.0.0+build.5", "1.0.0-alpha.1+build.5", "0.0.0"])(
    "accepts valid semver: %s",
    (version) => expect(isStrictSemver(version)).toBe(true)
  );

  it.each(["01.0.0", "1.0", "1.0.0-01", "1.0.0-alpha.01", "v1.0.0", "1.0.0.0", "1..0", ""])(
    "rejects invalid semver: %s",
    (version) => expect(isStrictSemver(version)).toBe(false)
  );
});
