-- New notification categories for the polls feature (creator on new
-- response, supporter when a poll they voted in closes). ADD VALUE runs
-- outside a transaction block by design — kept as its own migration file.
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'poll_response';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'poll_closed';
