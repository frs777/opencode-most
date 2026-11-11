type CatalogItem = Record<string, unknown>;

export type ModelAgentSelectionInput = {
  models: CatalogItem[];
  providers: CatalogItem[];
  agents: CatalogItem[];
  providerID: string;
  modelID: string;
  agentID: string;
  variant?: string;
};

export function validateModelAgentSelection(input: ModelAgentSelectionInput): {
  model: CatalogItem;
  provider: CatalogItem;
  agent: CatalogItem;
} {
  const model = input.models.find((candidate) =>
    candidate.providerID === input.providerID &&
    (candidate.id === input.modelID || candidate.modelID === input.modelID)
  );
  if (!model) {
    throw new Error(`Model ${input.providerID}/${input.modelID} is not present in the active OpenCode model catalog for this project`);
  }
  if (model.enabled !== true || model.status !== "active") {
    throw new Error(`Model ${input.providerID}/${input.modelID} is not selectable (enabled=${String(model.enabled)}, status=${String(model.status)})`);
  }

  const provider = input.providers.find((candidate) => candidate.id === input.providerID);
  if (!provider || provider.activation === "disabled") {
    throw new Error(`Provider ${input.providerID} is not active (activation=${String(provider?.activation ?? "missing")})`);
  }

  const agent = input.agents.find((candidate) => candidate.id === input.agentID);
  if (!agent || agent.hidden === true || !["primary", "all"].includes(String(agent.mode))) {
    throw new Error(`Agent ${input.agentID} is not available as a visible primary session agent`);
  }

  const capabilities = (model.capabilities ?? {}) as Record<string, unknown>;
  if (capabilities.tools !== true) {
    throw new Error(`Model ${input.providerID}/${input.modelID} does not advertise tool calling and cannot operate the selected coding agent`);
  }

  const pinnedModel = agent.model as Record<string, unknown> | undefined;
  if (pinnedModel && (pinnedModel.providerID !== input.providerID || pinnedModel.id !== input.modelID)) {
    throw new Error(`Agent ${input.agentID} pins model ${String(pinnedModel.providerID)}/${String(pinnedModel.id)}; choose that model or another agent`);
  }

  const variants = Array.isArray(model.variants) ? model.variants as CatalogItem[] : [];
  if (input.variant && !variants.some((candidate) => candidate.id === input.variant)) {
    throw new Error(`Variant ${input.variant} is not available for model ${input.providerID}/${input.modelID}`);
  }

  return { model, provider, agent };
}
