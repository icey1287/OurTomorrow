-- PostgreSQL requires newly-added enum values to commit before a later
-- migration can reference them in predicates or data changes.
ALTER TYPE "OutboxEventStatus" ADD VALUE IF NOT EXISTS 'RUNNING' AFTER 'PENDING';
ALTER TYPE "OutboxEventStatus" ADD VALUE IF NOT EXISTS 'RETRYING' AFTER 'RUNNING';
