export type RateLimitWindow = "minute" | "hour" | "day";

export type RateLimitStatus = "ok" | "warning" | "blocked";

export type RateLimit = {
  window: RateLimitWindow;
  limit: number;
  used: number;
  resetAt?: string;
};

export type ModelPricing = {
  modelId: string;
  displayName: string;
  currency: string;
  inputTokenPricePer1k: number;
  outputTokenPricePer1k: number;
  imagePrice: number;
  fixedPricePerGeneration: number;
};

export type GenerationEstimateRequest = {
  modelId: string;
  generationCount: number;
  averageInputTokens: number;
  averageOutputTokens: number;
  imagesPerGeneration: number;
};

export type Budget = {
  currency: string;
  limit: number;
  used: number;
};

export type CostBreakdown = {
  currency: string;
  inputTokenCost: number;
  outputTokenCost: number;
  imageCost: number;
  fixedGenerationCost: number;
  totalCost: number;
  averageCostPerGeneration: number;
};

export type RateLimitEvaluation = RateLimit & {
  requested: number;
  projectedUsage: number;
  remainingAfterRequest: number;
  usageRatioAfterRequest: number;
  status: RateLimitStatus;
};

export type BudgetEvaluation = Budget & {
  projectedUsage: number;
  remainingAfterRequest: number;
  status: RateLimitStatus;
};

export type GenerationRunEstimate = {
  request: GenerationEstimateRequest;
  pricing?: ModelPricing;
  cost?: CostBreakdown;
  budget?: BudgetEvaluation;
  rateLimits: RateLimitEvaluation[];
  status: RateLimitStatus;
  canSubmit: boolean;
  messages: string[];
};

const statusRank: Record<RateLimitStatus, number> = {
  ok: 0,
  warning: 1,
  blocked: 2,
};

export function getStrictestStatus(statuses: RateLimitStatus[]): RateLimitStatus {
  return statuses.reduce<RateLimitStatus>((strictest, status) => {
    return statusRank[status] > statusRank[strictest] ? status : strictest;
  }, "ok");
}

export function estimateGenerationCost(
  request: GenerationEstimateRequest,
  pricing: ModelPricing,
): CostBreakdown {
  const inputTokens = request.averageInputTokens * request.generationCount;
  const outputTokens = request.averageOutputTokens * request.generationCount;
  const imageCount = request.imagesPerGeneration * request.generationCount;

  const inputTokenCost = (inputTokens * pricing.inputTokenPricePer1k) / 1000;
  const outputTokenCost = (outputTokens * pricing.outputTokenPricePer1k) / 1000;
  const imageCost = imageCount * pricing.imagePrice;
  const fixedGenerationCost = request.generationCount * pricing.fixedPricePerGeneration;
  const totalCost = inputTokenCost + outputTokenCost + imageCost + fixedGenerationCost;

  return {
    currency: pricing.currency,
    inputTokenCost,
    outputTokenCost,
    imageCost,
    fixedGenerationCost,
    totalCost,
    averageCostPerGeneration:
      request.generationCount === 0 ? 0 : totalCost / request.generationCount,
  };
}

export function evaluateRateLimit(
  rateLimit: RateLimit,
  requestedUnits: number,
  warningThreshold = 0.8,
): RateLimitEvaluation {
  const projectedUsage = rateLimit.used + requestedUnits;
  const remainingAfterRequest = rateLimit.limit - projectedUsage;
  const usageRatioAfterRequest =
    rateLimit.limit <= 0 ? Number.POSITIVE_INFINITY : projectedUsage / rateLimit.limit;

  const status: RateLimitStatus =
    projectedUsage > rateLimit.limit
      ? "blocked"
      : usageRatioAfterRequest >= warningThreshold
        ? "warning"
        : "ok";

  return {
    ...rateLimit,
    requested: requestedUnits,
    projectedUsage,
    remainingAfterRequest,
    usageRatioAfterRequest,
    status,
  };
}

export function evaluateBudget(
  budget: Budget,
  estimatedCost: number,
  warningThreshold = 0.8,
): BudgetEvaluation {
  const projectedUsage = budget.used + estimatedCost;
  const remainingAfterRequest = budget.limit - projectedUsage;
  const usageRatioAfterRequest = budget.limit <= 0 ? Number.POSITIVE_INFINITY : projectedUsage / budget.limit;

  const status: RateLimitStatus =
    projectedUsage > budget.limit
      ? "blocked"
      : usageRatioAfterRequest >= warningThreshold
        ? "warning"
        : "ok";

  return {
    ...budget,
    projectedUsage,
    remainingAfterRequest,
    status,
  };
}

export function estimateGenerationRun(options: {
  request: GenerationEstimateRequest;
  pricing?: ModelPricing;
  rateLimits: RateLimit[];
  budget?: Budget;
  warningThreshold?: number;
}): GenerationRunEstimate {
  const warningThreshold = options.warningThreshold ?? 0.8;
  const rateLimits = options.rateLimits.map((rateLimit) =>
    evaluateRateLimit(rateLimit, options.request.generationCount, warningThreshold),
  );

  const cost = options.pricing
    ? estimateGenerationCost(options.request, options.pricing)
    : undefined;

  const budget = options.budget && cost
    ? evaluateBudget(options.budget, cost.totalCost, warningThreshold)
    : undefined;

  const statuses = [
    ...rateLimits.map((rateLimit) => rateLimit.status),
    ...(budget ? [budget.status] : []),
    ...(options.pricing ? [] : ["blocked" as RateLimitStatus]),
  ];

  const status = getStrictestStatus(statuses);
  const messages = buildEstimateMessages({
    pricing: options.pricing,
    cost,
    budget,
    rateLimits,
  });

  return {
    request: options.request,
    pricing: options.pricing,
    cost,
    budget,
    rateLimits,
    status,
    canSubmit: status !== "blocked",
    messages,
  };
}

function buildEstimateMessages(options: {
  pricing?: ModelPricing;
  cost?: CostBreakdown;
  budget?: BudgetEvaluation;
  rateLimits: RateLimitEvaluation[];
}): string[] {
  const messages: string[] = [];

  if (!options.pricing) {
    messages.push("Pricing is unavailable for the selected model.");
  }

  const blockedRateLimit = [...options.rateLimits]
    .filter((rateLimit) => rateLimit.status === "blocked")
    .sort((a, b) => a.remainingAfterRequest - b.remainingAfterRequest)[0];

  if (blockedRateLimit) {
    messages.push(
      `This run exceeds the ${blockedRateLimit.window} limit by ${Math.abs(
        blockedRateLimit.remainingAfterRequest,
      )} generations.`,
    );
  }

  const warningRateLimit = [...options.rateLimits]
    .filter((rateLimit) => rateLimit.status === "warning")
    .sort((a, b) => b.usageRatioAfterRequest - a.usageRatioAfterRequest)[0];

  if (!blockedRateLimit && warningRateLimit) {
    messages.push(
      `This run will use ${Math.round(
        warningRateLimit.usageRatioAfterRequest * 100,
      )}% of the ${warningRateLimit.window} limit.`,
    );
  }

  if (options.budget?.status === "blocked") {
    messages.push("This run exceeds the configured budget.");
  } else if (options.budget?.status === "warning") {
    messages.push("This run leaves limited budget remaining.");
  }

  if (messages.length === 0 && options.cost) {
    messages.push("This run fits within current limits and budget.");
  }

  return messages;
}

export function formatMoney(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 1 ? 2 : 4,
  }).format(value);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
}
