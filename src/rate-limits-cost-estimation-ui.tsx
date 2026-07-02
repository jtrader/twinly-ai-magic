import type { CSSProperties } from "react";
import {
  Budget,
  GenerationEstimateRequest,
  ModelPricing,
  RateLimit,
  RateLimitEvaluation,
  estimateGenerationRun,
  formatMoney,
  formatPercent,
} from "./rate-limits-cost-estimation";

export type RateLimitsCostEstimationPanelProps = {
  request: GenerationEstimateRequest;
  pricingOptions: ModelPricing[];
  rateLimits: RateLimit[];
  budget?: Budget;
  warningThreshold?: number;
  onRequestChange?: (request: GenerationEstimateRequest) => void;
  onSubmit?: (request: GenerationEstimateRequest) => void;
};

const statusLabels = {
  ok: "Ready",
  warning: "Near limit",
  blocked: "Blocked",
};

export function RateLimitsCostEstimationPanel({
  request,
  pricingOptions,
  rateLimits,
  budget,
  warningThreshold,
  onRequestChange,
  onSubmit,
}: RateLimitsCostEstimationPanelProps) {
  const pricing = pricingOptions.find((option) => option.modelId === request.modelId);
  const estimate = estimateGenerationRun({
    request,
    pricing,
    rateLimits,
    budget,
    warningThreshold,
  });

  const currency = estimate.cost?.currency ?? budget?.currency ?? "USD";
  const remainingBudget = estimate.budget?.remainingAfterRequest;
  const safeGenerationsNow = estimate.rateLimits.length === 0
    ? 0
    : Math.max(0, Math.min(...estimate.rateLimits.map((limit) => limit.limit - limit.used)));

  const updateRequest = (patch: Partial<GenerationEstimateRequest>) => {
    onRequestChange?.({
      ...request,
      ...patch,
    });
  };

  return (
    <section aria-label="Rate limits and cost estimation" style={styles.panel}>
      <header style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Pre-flight check</p>
          <h2 style={styles.title}>Rate limits + cost estimate</h2>
        </div>
        <span style={{ ...styles.statusPill, ...statusStyle(estimate.status) }}>
          {statusLabels[estimate.status]}
        </span>
      </header>

      <div style={styles.cardGrid}>
        <MetricCard
          label="Estimated cost"
          value={estimate.cost ? formatMoney(estimate.cost.totalCost, currency) : "Unavailable"}
          detail={estimate.cost ? `${formatMoney(estimate.cost.averageCostPerGeneration, currency)} / generation` : "Add pricing for this model"}
        />
        <MetricCard
          label="Rate-limit status"
          value={statusLabels[estimate.status]}
          detail={`${safeGenerationsNow} generations available now`}
        />
        <MetricCard
          label="Remaining budget"
          value={remainingBudget === undefined ? "Not configured" : formatMoney(remainingBudget, currency)}
          detail={budget ? `${formatMoney(budget.used, currency)} used of ${formatMoney(budget.limit, currency)}` : "No budget cap set"}
        />
        <MetricCard
          label="Run size"
          value={`${request.generationCount}`}
          detail="requested generations"
        />
      </div>

      <div style={styles.messages} role={estimate.status === "blocked" ? "alert" : "status"}>
        {estimate.messages.map((message) => (
          <p key={message} style={styles.message}>{message}</p>
        ))}
        <p style={styles.disclaimer}>Cost is an estimate. Retries, tool calls, prompt expansion, moderation, or model-side token usage can change the final cost.</p>
      </div>

      <div style={styles.twoColumnGrid}>
        <section style={styles.sectionCard}>
          <h3 style={styles.sectionTitle}>Generation request</h3>
          <label style={styles.label}>
            Model
            <select
              value={request.modelId}
              onChange={(event) => updateRequest({ modelId: event.target.value })}
              style={styles.input}
            >
              {pricingOptions.map((option) => (
                <option key={option.modelId} value={option.modelId}>{option.displayName}</option>
              ))}
            </select>
          </label>
          <NumberInput label="Generations" value={request.generationCount} min={1} onChange={(value) => updateRequest({ generationCount: value })} />
          <NumberInput label="Avg input tokens" value={request.averageInputTokens} min={0} onChange={(value) => updateRequest({ averageInputTokens: value })} />
          <NumberInput label="Avg output tokens" value={request.averageOutputTokens} min={0} onChange={(value) => updateRequest({ averageOutputTokens: value })} />
          <NumberInput label="Images per generation" value={request.imagesPerGeneration} min={0} onChange={(value) => updateRequest({ imagesPerGeneration: value })} />
        </section>

        <section style={styles.sectionCard}>
          <h3 style={styles.sectionTitle}>Cost breakdown</h3>
          {estimate.cost ? (
            <dl style={styles.definitionList}>
              <BreakdownRow label="Input tokens" value={formatMoney(estimate.cost.inputTokenCost, currency)} />
              <BreakdownRow label="Output tokens" value={formatMoney(estimate.cost.outputTokenCost, currency)} />
              <BreakdownRow label="Images" value={formatMoney(estimate.cost.imageCost, currency)} />
              <BreakdownRow label="Fixed generation fees" value={formatMoney(estimate.cost.fixedGenerationCost, currency)} />
              <BreakdownRow label="Total" value={formatMoney(estimate.cost.totalCost, currency)} strong />
            </dl>
          ) : (
            <p style={styles.emptyState}>Pricing is not available for the selected model.</p>
          )}
        </section>
      </div>

      <section style={styles.sectionCard}>
        <h3 style={styles.sectionTitle}>Rate limits</h3>
        <div style={styles.limitGrid}>
          {estimate.rateLimits.map((limit) => (
            <RateLimitRow key={limit.window} limit={limit} />
          ))}
        </div>
      </section>

      {onSubmit && (
        <footer style={styles.footer}>
          <button
            type="button"
            disabled={!estimate.canSubmit}
            onClick={() => onSubmit(request)}
            style={{
              ...styles.submitButton,
              opacity: estimate.canSubmit ? 1 : 0.5,
              cursor: estimate.canSubmit ? "pointer" : "not-allowed",
            }}
          >
            Start generation run
          </button>
        </footer>
      )}
    </section>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article style={styles.metricCard}>
      <p style={styles.metricLabel}>{label}</p>
      <strong style={styles.metricValue}>{value}</strong>
      <p style={styles.metricDetail}>{detail}</p>
    </article>
  );
}

function NumberInput({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  return (
    <label style={styles.label}>
      {label}
      <input
        type="number"
        value={value}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        style={styles.input}
      />
    </label>
  );
}

function BreakdownRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ ...styles.breakdownRow, ...(strong ? styles.breakdownTotal : {}) }}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function RateLimitRow({ limit }: { limit: RateLimitEvaluation }) {
  const usageRatio = Math.min(1, Math.max(0, limit.usageRatioAfterRequest));

  return (
    <article style={styles.limitCard}>
      <div style={styles.limitHeader}>
        <strong style={styles.limitWindow}>{limit.window}</strong>
        <span style={{ ...styles.statusPill, ...statusStyle(limit.status) }}>{statusLabels[limit.status]}</span>
      </div>
      <div style={styles.progressTrack} aria-label={`${limit.window} usage`}>
        <div style={{ ...styles.progressFill, width: `${usageRatio * 100}%` }} />
      </div>
      <dl style={styles.compactDefinitionList}>
        <BreakdownRow label="Used" value={`${limit.used}`} />
        <BreakdownRow label="Requested" value={`${limit.requested}`} />
        <BreakdownRow label="Limit" value={`${limit.limit}`} />
        <BreakdownRow label="Projected" value={`${limit.projectedUsage} (${formatPercent(limit.usageRatioAfterRequest)})`} />
      </dl>
      {limit.resetAt && <p style={styles.metricDetail}>Resets {new Date(limit.resetAt).toLocaleString()}</p>}
    </article>
  );
}

function statusStyle(status: "ok" | "warning" | "blocked") {
  if (status === "blocked") {
    return styles.blockedStatus;
  }

  if (status === "warning") {
    return styles.warningStatus;
  }

  return styles.okStatus;
}

const styles: Record<string, CSSProperties> = {
  panel: {
    border: "1px solid #d7dde8",
    borderRadius: 16,
    padding: 24,
    background: "#fff",
    color: "#172033",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 20,
  },
  eyebrow: {
    margin: 0,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "#5f6f89",
  },
  title: {
    margin: "4px 0 0",
    fontSize: 24,
    lineHeight: 1.2,
  },
  cardGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    border: "1px solid #e3e8f1",
    borderRadius: 12,
    padding: 16,
    background: "#f8fafc",
  },
  metricLabel: {
    margin: 0,
    color: "#64748b",
    fontSize: 13,
  },
  metricValue: {
    display: "block",
    marginTop: 6,
    fontSize: 24,
  },
  metricDetail: {
    margin: "6px 0 0",
    color: "#64748b",
    fontSize: 13,
  },
  messages: {
    borderRadius: 12,
    background: "#f8fafc",
    padding: 14,
    marginBottom: 16,
  },
  message: {
    margin: "0 0 6px",
    fontWeight: 600,
  },
  disclaimer: {
    margin: 0,
    color: "#64748b",
    fontSize: 13,
  },
  twoColumnGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 16,
    marginBottom: 16,
  },
  sectionCard: {
    border: "1px solid #e3e8f1",
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    margin: "0 0 12px",
    fontSize: 18,
  },
  label: {
    display: "grid",
    gap: 6,
    marginBottom: 12,
    fontSize: 14,
    fontWeight: 600,
  },
  input: {
    border: "1px solid #cbd5e1",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 14,
  },
  definitionList: {
    margin: 0,
  },
  compactDefinitionList: {
    margin: "10px 0 0",
  },
  breakdownRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    padding: "8px 0",
    borderBottom: "1px solid #eef2f7",
  },
  breakdownTotal: {
    fontWeight: 800,
    borderBottom: "none",
  },
  emptyState: {
    margin: 0,
    color: "#64748b",
  },
  limitGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
  },
  limitCard: {
    border: "1px solid #e3e8f1",
    borderRadius: 12,
    padding: 14,
    background: "#ffffff",
  },
  limitHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  limitWindow: {
    textTransform: "capitalize",
  },
  statusPill: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: 999,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 800,
  },
  okStatus: {
    background: "#dcfce7",
    color: "#166534",
  },
  warningStatus: {
    background: "#fef3c7",
    color: "#92400e",
  },
  blockedStatus: {
    background: "#fee2e2",
    color: "#991b1b",
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    background: "#e2e8f0",
    marginTop: 12,
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    background: "currentColor",
  },
  footer: {
    marginTop: 16,
    display: "flex",
    justifyContent: "flex-end",
  },
  submitButton: {
    border: "none",
    borderRadius: 12,
    padding: "12px 16px",
    fontWeight: 800,
    background: "#172033",
    color: "#ffffff",
  },
};
