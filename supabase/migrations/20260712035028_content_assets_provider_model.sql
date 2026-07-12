-- Venice's /video/retrieve polling endpoint requires the original model ID
-- alongside the queue_id (unlike HeyGen's status endpoint, which only needs
-- the video id) — persist it alongside the existing provider/provider_job_id
-- columns so the cron poller can reconstruct the exact retrieve request.
ALTER TABLE public.content_assets ADD COLUMN provider_model text;
