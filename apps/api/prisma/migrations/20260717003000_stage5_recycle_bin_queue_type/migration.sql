-- Keep enum expansion in its own migration so PostgreSQL can commit the new
-- value before workers begin persisting recycle-bin purge events.
ALTER TYPE "ScheduledEventType" ADD VALUE IF NOT EXISTS 'RECYCLE_BIN_PURGE' AFTER 'OUTBOX_RETRY';
