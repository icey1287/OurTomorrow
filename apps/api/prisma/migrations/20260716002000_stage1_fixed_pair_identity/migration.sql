-- This deployment is a private two-person application. Identity is a local
-- boy/girl choice rather than an account, password, invitation, or session.
DROP TABLE "invite_codes";
DROP TABLE "sessions";

ALTER TABLE "users"
DROP COLUMN "password_hash";

DROP TYPE "InviteCodeStatus";
DROP TYPE "SessionStatus";
