import type { Enums, Json, Tables } from "@/integrations/supabase/types";

export type GenerationOutputType = Enums<"generation_output_type">;
export type GenerationRequestStatus = Enums<"generation_request_status">;
export type ModerationStatus = Enums<"moderation_status">;

export type ContentAsset = Tables<"content_assets">;
export type ContentPack = Tables<"content_packs">;
export type DigitalTwinConsent = Tables<"digital_twin_consent">;
export type GenerationRequest = Tables<"generation_requests">;
export type Persona = Tables<"personas">;
export type TwinReferenceAsset = Tables<"twin_reference_assets">;

export type GenerationProviderStatus = "submitted" | "completed" | "failed";
export type GenerationJobStatus = "queued" | "submitted" | "polling" | "completed" | "failed" | "cancelled";
export type GenerationCheckStage = "pre_generation" | "provider_input" | "post_generation" | "pre_publish";
export type GenerationCheckType = "prompt" | "image" | "audio" | "video" | "metadata";
export type GenerationCheckStatus = "clean" | "flagged" | "blocked" | "needs_review";
export type GenerationSeverity = "low" | "medium" | "high" | "critical";

export type GenerationSafetyRules = {
  aiDisclosureRequired: boolean;
  requireCreatorApproval: boolean;
  blockedTerms?: string[];
  boundaryRules?: Json;
  allowedUses?: Json;
  forbiddenUses?: Json;
};

export type GenerationCostEstimate = {
  estimatedCostCents: number;
  currency: string;
  units: number;
  unitType: string;
};

export type GeneratedProviderAsset = {
  id: string;
  outputType: GenerationOutputType;
  title: string;
  previewUrl?: string;
  storagePath?: string;
  mimeType?: string;
  durationMs?: number;
  metadata?: Json;
};

export type GenerationProviderInput = {
  generationRequestId: string;
  creatorId: string;
  personaId: string | null;
  packId: string | null;
  outputType: GenerationOutputType;
  promptNotes: string;
  quantity: number;
  stylePreset?: string | null;
  referenceAssets: TwinReferenceAsset[];
  contentPackAssets: ContentAsset[];
  digitalTwinConsent: DigitalTwinConsent;
  persona?: Persona | null;
  contentPack?: ContentPack | null;
  safetyRules: GenerationSafetyRules;
};

export type GenerationProviderResult = {
  providerKey: string;
  providerJobId: string;
  status: GenerationProviderStatus;
  assets: GeneratedProviderAsset[];
  rawResponse?: Json;
  errorMessage?: string;
};

export type GenerationProviderAdapter = {
  providerKey: string;
  displayName: string;
  supportedOutputTypes: GenerationOutputType[];
  supports: (outputType: GenerationOutputType) => boolean;
  estimateCost: (input: GenerationProviderInput) => Promise<GenerationCostEstimate>;
  submitJob: (input: GenerationProviderInput) => Promise<GenerationProviderResult>;
  pollJob?: (providerJobId: string) => Promise<GenerationProviderResult>;
  normalizeWebhook?: (payload: unknown) => Promise<GenerationProviderResult>;
};

export type ProviderSelectionInput = {
  outputType: GenerationOutputType;
  preferredProviderKey?: string | null;
};

export type ModerationCheckResult = {
  stage: GenerationCheckStage;
  type: GenerationCheckType;
  status: GenerationCheckStatus;
  severity: GenerationSeverity;
  categories: string[];
  result: Json;
};

export type GenerationQualityScore = {
  identityScore?: number | null;
  styleScore?: number | null;
  voiceScore?: number | null;
  personaAlignmentScore?: number | null;
  artifactScore?: number | null;
  overallScore?: number | null;
  result?: Json;
};

export type GenerationOrchestratorResult = {
  generationRequestId: string;
  providerKey: string;
  providerJobId: string;
  status: GenerationProviderStatus;
  costEstimate: GenerationCostEstimate;
  moderation: ModerationCheckResult[];
  qualityScores: GenerationQualityScore[];
  assets: GeneratedProviderAsset[];
};
