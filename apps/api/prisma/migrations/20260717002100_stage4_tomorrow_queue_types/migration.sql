-- PostgreSQL requires a newly-added enum value to commit before later
-- migrations can safely use it in predicates or data changes.
ALTER TYPE "ScheduledEventType" ADD VALUE IF NOT EXISTS 'PLAN_REMINDER' AFTER 'ANNIVERSARY_REMINDER';
