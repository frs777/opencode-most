import { describe, expect, it } from "vitest";
import { validateModelAgentSelection } from "../src/opencode/selection.js";

const base = () => ({
  models: [{
    id: "nemotron",
    modelID: "nemotron",
    providerID: "kilo",
    status: "active",
    enabled: true,
    capabilities: { tools: true, input: ["text"], output: ["text"] },
    variants: [{ id: "high" }],
    limit: { context: 65536, output: 8192 },
    cost: [{ input: 0, output: 0 }]
  }],
  providers: [{ id: "kilo", name: "Kilo", activation: "enabled" }],
  agents: [{ id: "build", name: "Build", mode: "primary", hidden: false }]
});

describe("model and agent selection", () => {
  it("accepts an enabled tool-capable model with a visible primary agent", () => {
    const input = base();
    expect(validateModelAgentSelection({ ...input, providerID: "kilo", modelID: "nemotron", agentID: "build" }))
      .toMatchObject({ model: { id: "nemotron" }, provider: { id: "kilo" }, agent: { id: "build" } });
  });

  it("rejects disabled or inactive models", () => {
    const input = base();
    input.models[0]!.enabled = false;
    expect(() => validateModelAgentSelection({ ...input, providerID: "kilo", modelID: "nemotron", agentID: "build" }))
      .toThrow("not selectable");
  });

  it("rejects models without tool-calling capability", () => {
    const input = base();
    input.models[0]!.capabilities.tools = false;
    expect(() => validateModelAgentSelection({ ...input, providerID: "kilo", modelID: "nemotron", agentID: "build" }))
      .toThrow("does not advertise tool calling");
  });

  it("rejects a provider disabled in OpenCode", () => {
    const input = base();
    input.providers[0]!.activation = "disabled";
    expect(() => validateModelAgentSelection({ ...input, providerID: "kilo", modelID: "nemotron", agentID: "build" }))
      .toThrow("Provider kilo is not active");
  });

  it("rejects an agent that pins a different model", () => {
    const input = base();
    input.agents[0]!.model = { providerID: "openai", id: "other-model" };
    expect(() => validateModelAgentSelection({ ...input, providerID: "kilo", modelID: "nemotron", agentID: "build" }))
      .toThrow("pins model openai/other-model");
  });

  it("rejects unavailable model variants", () => {
    const input = base();
    expect(() => validateModelAgentSelection({ ...input, providerID: "kilo", modelID: "nemotron", agentID: "build", variant: "max" }))
      .toThrow("Variant max is not available");
  });

  it("rejects hidden and subagent-only agents for a primary session", () => {
    const input = base();
    input.agents[0]!.mode = "subagent";
    expect(() => validateModelAgentSelection({ ...input, providerID: "kilo", modelID: "nemotron", agentID: "build" }))
      .toThrow("not available as a visible primary session agent");
  });
});
