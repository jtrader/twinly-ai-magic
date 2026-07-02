# Rate Limits + Cost Estimation UI

## Goal

Give creators immediate feedback before launching an AI generation run:

- Whether the requested generation volume fits within rate limits.
- How much the run is expected to cost.
- Whether the run fits within the creator or workspace budget.
- Which inputs are driving cost and rate-limit pressure.

This prevents creators from starting jobs that will fail, stall, or unexpectedly exceed budget.

## Core user experience

The UI should appear anywhere a creator configures a generation run, especially pack creation and bulk generation flows.

### Summary cards

Show four cards at the top:

1. **Estimated cost** — total projected cost for the current generation request.
2. **Rate-limit status** — clear state: `Ready`, `Near limit`, or `Blocked`.
3. **Remaining budget** — budget available after this projected run.
4. **Estimated throughput** — how many generations can be submitted now without throttling.

### Request controls

Expose controls for:

- Model
- Number of generations
- Average input tokens per generation
- Average output tokens per generation
- Image count per generation, if applicable
- Quality tier or generation type

Changes should recalculate immediately.

### Rate-limit panel

Show rate limits by window:

- Per minute
- Per hour
- Per day

For each window show:

- Current usage
- Requested additional usage
- Limit
- Remaining after request
- Status

### Cost breakdown panel

Break total cost into:

- Input token cost
- Output token cost
- Image generation cost
- Fixed per-generation fees, if used
- Total run cost
- Average cost per generation

### Blocking and warning states

Use plain-language messages:

- **Blocked:** This run exceeds your daily generation limit by 125 generations.
- **Warning:** This run will use 82% of your hourly limit.
- **Budget warning:** This run leaves only $3.20 in your monthly budget.
- **Ready:** This run fits within current limits and budget.

## Calculation rules

### Cost estimate

```text
total_cost = input_cost + output_cost + image_cost + fixed_generation_cost
```

Where:

```text
input_cost = input_tokens * input_token_price_per_1k / 1000
output_cost = output_tokens * output_token_price_per_1k / 1000
image_cost = image_count * image_price
fixed_generation_cost = generation_count * fixed_price_per_generation
```

### Approval-safe disclaimer

Cost shown in the UI should be labeled as an estimate. Actual cost may vary if retries, moderation, prompt expansion, tool calls, or model-side token usage differ from estimates.

### Rate-limit evaluation

A requested run is blocked when any rate-limit window would exceed its configured limit.

```text
projected_usage = current_usage + requested_units
remaining_after_request = limit - projected_usage
```

Status rules:

- `blocked` when `projected_usage > limit`
- `warning` when `projected_usage / limit >= warning_threshold`
- `ok` otherwise

Default warning threshold: `0.8`.

## Recommended data model

```ts
type RateLimitWindow = "minute" | "hour" | "day";

type RateLimit = {
  window: RateLimitWindow;
  limit: number;
  used: number;
};

type ModelPricing = {
  modelId: string;
  displayName: string;
  inputTokenPricePer1k: number;
  outputTokenPricePer1k: number;
  imagePrice: number;
  fixedPricePerGeneration: number;
};

type GenerationEstimateRequest = {
  modelId: string;
  generationCount: number;
  averageInputTokens: number;
  averageOutputTokens: number;
  imagesPerGeneration: number;
};
```

## Edge cases

- If pricing is missing, show `Pricing unavailable` and disable submission.
- If rate-limit data is stale, show `Limits may be outdated` and refresh before submission.
- If no budget is configured, omit the budget card rather than showing zero budget.
- If a request is blocked by more than one window, show the strictest window first.
- If usage resets soon, show reset time next to the blocked or warning state.

## Acceptance criteria

- UI estimates total run cost and cost per generation.
- UI breaks down token, image, and fixed generation costs.
- UI evaluates minute, hourly, and daily rate limits.
- UI clearly marks requests as ready, warning, or blocked.
- UI shows budget impact when a budget is provided.
- The submission action can be disabled when pricing is missing, budget is exceeded, or limits are exceeded.
- Estimation logic is separate from rendering so it can be unit tested.
