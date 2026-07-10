
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'subscription_started';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'subscription_changed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'subscription_ending';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'subscription_reactivated';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_subscriber';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'subscriber_changed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'tip_sent';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'tip_received';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'unlock_purchased';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'content_unlocked';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'twinly_plus_active';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'twinly_plus_ended';
