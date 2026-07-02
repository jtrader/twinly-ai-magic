import type {
  GeneratedProviderAsset,
  GenerationCostEstimate,
  GenerationOutputType,
  GenerationProviderAdapter,
  GenerationProviderInput,
  GenerationProviderResult,
} from "../types";

const OUTPUT_COST_CENTS: Record<GenerationOutputType, number> = {
  image: 10,
  audio: 8,
  video: 25,
  talking_head: 20,
  promo_banner: 5,
};

const PLACEHOLDER_MIME_TYPES: Record<GenerationOutputType, string> = {
  image: "image/png",
  audio: "audio/mpeg",
  video: "video/mp4",
  talking_head: "video/mp4",
  promo_banner: "image/png",
};

const createId = (prefix: string) => {
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

  return `${prefix}_${randomId}`;
};

const createPlaceholderAsset = (input: GenerationProviderInput, index: number): GeneratedProviderAsset => {
  const assetNumber = index + 1;
  const titleBase = input.persona?.display_name ?? input.contentPack?.name ?? "Twinly Asset";

  return {
    id: createId("mock_asset"),
    outputType: input.outputType,
    title: `${titleBase} ${input.outputType.replace("_", " ")} draft ${assetNumber}`,
    previewUrl: `/placeholder.svg?mock=${input.outputType}&asset=${assetNumber}`,
    storagePath: `mock/${input.creatorId}/${input.generationRequestId}/${input.outputType}-${assetNumber}`,
    mimeType: PLACEHOLDER_MIME_TYPES[input.outputType],
    durationMs: input.outputType === "audio" || input.outputType === "video" || input.outputType === "talking_head" ? 15000 : undefined,
    metadata: {
      mock: true,
      stylePreset: input.stylePreset ?? null,
      promptNotes: input.promptNotes,
      referenceAssetCount: input.referenceAssets.length,
      contentPackAssetCount: input.contentPackAssets.length,
      aiDisclosureRequired: input.safetyRules.aiDisclosureRequired,
    },
  };
};

export const MockGenerationProvider: GenerationProviderAdapter = {
  providerKey: "mock",
  displayName: "Mock Provider",
  supportedOutputTypes: ["image", "audio", "video", "talking_head", "promo_banner"],

  supports(outputType) {
    return this.supportedOutputTypes.includes(outputType);
  },

  async estimateCost(input): Promise<GenerationCostEstimate> {
    const unitCost = OUTPUT_COST_CENTS[input.outputType];

    return {
      estimatedCostCents: unitCost * input.quantity,
      currency: "USD",
      units: input.quantity,
      unitType: input.outputType,
    };
  },

  async submitJob(input): Promise<GenerationProviderResult> {
    if (!this.supports(input.outputType)) {
      return {
        providerKey: this.providerKey,
        providerJobId: createId("mock_failed_job"),
        status: "failed",
        assets: [],
        errorMessage: `Mock provider does not support ${input.outputType}.`,
        rawResponse: { mock: true, unsupportedOutputType: input.outputType },
      };
    }

    const quantity = Math.max(1, Math.min(input.quantity, 10));
    const assets = Array.from({ length: quantity }, (_, index) => createPlaceholderAsset(input, index));

    return {
      providerKey: this.providerKey,
      providerJobId: createId("mock_job"),
      status: "completed",
      assets,
      rawResponse: {
        mock: true,
        generatedAt: new Date().toISOString(),
        generationRequestId: input.generationRequestId,
      },
    };
  },
};
