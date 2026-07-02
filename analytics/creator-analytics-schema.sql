-- Creator analytics event schema and reporting views.
-- Designed for PostgreSQL-compatible databases.

CREATE TABLE IF NOT EXISTS creator_generation_events (
  id UUID PRIMARY KEY,
  creator_id UUID NOT NULL,
  pack_id UUID NOT NULL,
  asset_id UUID NOT NULL,
  model TEXT NOT NULL,
  prompt_template_id UUID,
  generation_type TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_generation_events_creator_created_at
  ON creator_generation_events (creator_id, created_at);

CREATE INDEX IF NOT EXISTS idx_creator_generation_events_pack_created_at
  ON creator_generation_events (pack_id, created_at);

CREATE TABLE IF NOT EXISTS creator_review_events (
  id UUID PRIMARY KEY,
  generation_id UUID NOT NULL REFERENCES creator_generation_events(id) ON DELETE CASCADE,
  review_status TEXT NOT NULL CHECK (review_status IN ('approved', 'rejected')),
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_creator_review_events_generation_latest
  ON creator_review_events (generation_id, reviewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_creator_review_events_status_reviewed_at
  ON creator_review_events (review_status, reviewed_at);

CREATE TABLE IF NOT EXISTS creator_pack_engagement_events (
  id UUID PRIMARY KEY,
  creator_id UUID NOT NULL,
  pack_id UUID NOT NULL,
  asset_id UUID,
  user_id UUID,
  session_id TEXT,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('view', 'open', 'like', 'share', 'save', 'click', 'purchase')
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creator_pack_engagement_events_creator_occurred_at
  ON creator_pack_engagement_events (creator_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_creator_pack_engagement_events_pack_occurred_at
  ON creator_pack_engagement_events (pack_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_creator_pack_engagement_events_event_type
  ON creator_pack_engagement_events (event_type);

CREATE OR REPLACE VIEW creator_generation_review_status AS
WITH latest_reviews AS (
  SELECT DISTINCT ON (generation_id)
    generation_id,
    review_status,
    reviewed_at
  FROM creator_review_events
  ORDER BY generation_id, reviewed_at DESC
)
SELECT
  g.id AS generation_id,
  g.creator_id,
  g.pack_id,
  g.asset_id,
  g.model,
  g.created_at,
  COALESCE(r.review_status, 'pending') AS review_status,
  r.reviewed_at
FROM creator_generation_events g
LEFT JOIN latest_reviews r ON r.generation_id = g.id;

CREATE OR REPLACE VIEW creator_pack_analytics_daily AS
WITH generation_rollup AS (
  SELECT
    date_trunc('day', created_at)::date AS metric_date,
    creator_id,
    pack_id,
    COUNT(*) AS generation_volume,
    COUNT(*) FILTER (WHERE review_status = 'pending') AS pending_generations,
    COUNT(*) FILTER (WHERE review_status IN ('approved', 'rejected')) AS reviewed_generations,
    COUNT(*) FILTER (WHERE review_status = 'approved') AS approved_generations,
    COUNT(*) FILTER (WHERE review_status = 'rejected') AS rejected_generations
  FROM creator_generation_review_status
  GROUP BY 1, 2, 3
),
engagement_rollup AS (
  SELECT
    date_trunc('day', occurred_at)::date AS metric_date,
    creator_id,
    pack_id,
    COUNT(*) AS engagement_events,
    COUNT(*) FILTER (WHERE event_type = 'view') AS views,
    COUNT(*) FILTER (WHERE event_type = 'open') AS opens,
    COUNT(*) FILTER (WHERE event_type = 'like') AS likes,
    COUNT(*) FILTER (WHERE event_type = 'share') AS shares,
    COUNT(*) FILTER (WHERE event_type = 'save') AS saves,
    COUNT(*) FILTER (WHERE event_type = 'click') AS clicks,
    COUNT(*) FILTER (WHERE event_type = 'purchase') AS purchases,
    SUM(
      CASE event_type
        WHEN 'view' THEN 1
        WHEN 'open' THEN 2
        WHEN 'like' THEN 3
        WHEN 'save' THEN 4
        WHEN 'share' THEN 5
        WHEN 'click' THEN 5
        WHEN 'purchase' THEN 10
        ELSE 0
      END
    ) AS engagement_score
  FROM creator_pack_engagement_events
  GROUP BY 1, 2, 3
)
SELECT
  COALESCE(g.metric_date, e.metric_date) AS metric_date,
  COALESCE(g.creator_id, e.creator_id) AS creator_id,
  COALESCE(g.pack_id, e.pack_id) AS pack_id,
  COALESCE(g.generation_volume, 0) AS generation_volume,
  COALESCE(g.pending_generations, 0) AS pending_generations,
  COALESCE(g.reviewed_generations, 0) AS reviewed_generations,
  COALESCE(g.approved_generations, 0) AS approved_generations,
  COALESCE(g.rejected_generations, 0) AS rejected_generations,
  CASE
    WHEN COALESCE(g.reviewed_generations, 0) = 0 THEN NULL
    ELSE COALESCE(g.approved_generations, 0)::decimal / g.reviewed_generations
  END AS approval_rate,
  COALESCE(e.engagement_events, 0) AS engagement_events,
  COALESCE(e.views, 0) AS views,
  COALESCE(e.opens, 0) AS opens,
  COALESCE(e.likes, 0) AS likes,
  COALESCE(e.shares, 0) AS shares,
  COALESCE(e.saves, 0) AS saves,
  COALESCE(e.clicks, 0) AS clicks,
  COALESCE(e.purchases, 0) AS purchases,
  COALESCE(e.engagement_score, 0) AS engagement_score
FROM generation_rollup g
FULL OUTER JOIN engagement_rollup e
  ON e.metric_date = g.metric_date
 AND e.creator_id = g.creator_id
 AND e.pack_id = g.pack_id;
