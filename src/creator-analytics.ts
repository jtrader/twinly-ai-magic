export type CreatorAnalyticsParams = {
  creatorId?: string;
  packId?: string;
  startDate: string;
  endDate: string;
};

export type PackAnalytics = {
  packId: string;
  generationVolume: number;
  pendingGenerations: number;
  reviewedGenerations: number;
  approvedGenerations: number;
  rejectedGenerations: number;
  approvalRate: number | null;
  engagementEvents: number;
  views: number;
  opens: number;
  likes: number;
  shares: number;
  saves: number;
  clicks: number;
  purchases: number;
  engagementScore: number;
};

export type CreatorAnalyticsSummary = {
  generationVolume: number;
  pendingGenerations: number;
  reviewedGenerations: number;
  approvedGenerations: number;
  rejectedGenerations: number;
  approvalRate: number | null;
  engagementEvents: number;
  engagementScore: number;
  packs: PackAnalytics[];
};

export type SqlQuery = {
  text: string;
  values: Array<string>;
};

const metricColumns = `
  SUM(generation_volume)::int AS "generationVolume",
  SUM(pending_generations)::int AS "pendingGenerations",
  SUM(reviewed_generations)::int AS "reviewedGenerations",
  SUM(approved_generations)::int AS "approvedGenerations",
  SUM(rejected_generations)::int AS "rejectedGenerations",
  CASE
    WHEN SUM(reviewed_generations) = 0 THEN NULL
    ELSE SUM(approved_generations)::decimal / SUM(reviewed_generations)
  END AS "approvalRate",
  SUM(engagement_events)::int AS "engagementEvents",
  SUM(views)::int AS views,
  SUM(opens)::int AS opens,
  SUM(likes)::int AS likes,
  SUM(shares)::int AS shares,
  SUM(saves)::int AS saves,
  SUM(clicks)::int AS clicks,
  SUM(purchases)::int AS purchases,
  SUM(engagement_score)::int AS "engagementScore"
`;

function buildWhereClause(params: CreatorAnalyticsParams) {
  const values: string[] = [params.startDate, params.endDate];
  const filters = ["metric_date >= $1::date", "metric_date < $2::date"];

  if (params.creatorId) {
    values.push(params.creatorId);
    filters.push(`creator_id = $${values.length}::uuid`);
  }

  if (params.packId) {
    values.push(params.packId);
    filters.push(`pack_id = $${values.length}::uuid`);
  }

  return {
    whereSql: filters.join(" AND "),
    values,
  };
}

export function buildCreatorAnalyticsSummaryQuery(
  params: CreatorAnalyticsParams,
): SqlQuery {
  const { whereSql, values } = buildWhereClause(params);

  return {
    text: `
      SELECT
        COALESCE(SUM(generation_volume), 0)::int AS "generationVolume",
        COALESCE(SUM(pending_generations), 0)::int AS "pendingGenerations",
        COALESCE(SUM(reviewed_generations), 0)::int AS "reviewedGenerations",
        COALESCE(SUM(approved_generations), 0)::int AS "approvedGenerations",
        COALESCE(SUM(rejected_generations), 0)::int AS "rejectedGenerations",
        CASE
          WHEN COALESCE(SUM(reviewed_generations), 0) = 0 THEN NULL
          ELSE SUM(approved_generations)::decimal / SUM(reviewed_generations)
        END AS "approvalRate",
        COALESCE(SUM(engagement_events), 0)::int AS "engagementEvents",
        COALESCE(SUM(engagement_score), 0)::int AS "engagementScore"
      FROM creator_pack_analytics_daily
      WHERE ${whereSql};
    `,
    values,
  };
}

export function buildPackAnalyticsQuery(params: CreatorAnalyticsParams): SqlQuery {
  const { whereSql, values } = buildWhereClause(params);

  return {
    text: `
      SELECT
        pack_id::text AS "packId",
        ${metricColumns}
      FROM creator_pack_analytics_daily
      WHERE ${whereSql}
      GROUP BY pack_id
      ORDER BY "engagementScore" DESC, "generationVolume" DESC;
    `,
    values,
  };
}

export function hydrateCreatorAnalyticsSummary(
  summaryRow: Omit<CreatorAnalyticsSummary, "packs">,
  packRows: PackAnalytics[],
): CreatorAnalyticsSummary {
  return {
    ...summaryRow,
    packs: packRows,
  };
}

export function validateCreatorAnalyticsParams(
  params: CreatorAnalyticsParams,
): void {
  if (!params.startDate || !params.endDate) {
    throw new Error("Creator analytics requires both startDate and endDate.");
  }

  const startDate = new Date(params.startDate);
  const endDate = new Date(params.endDate);

  if (Number.isNaN(startDate.valueOf()) || Number.isNaN(endDate.valueOf())) {
    throw new Error("Creator analytics dates must be valid ISO date strings.");
  }

  if (startDate >= endDate) {
    throw new Error("Creator analytics startDate must be before endDate.");
  }
}
