import "dotenv/config";
import { argon2id, hash } from "argon2";
import {
  CoupleMemberStatus,
  CoupleStatus,
  Prisma,
  PrismaClient,
  UserStatus,
} from "@prisma/client";

const SEED_COUPLE_ID = "00000000-0000-4000-8000-000000000001";
const prisma = new PrismaClient();

class SeedRefusedError extends Error {}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new SeedRefusedError(`${name} is required`);
  return value;
}

function validateUsername(username: string, name: string): void {
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) {
    throw new SeedRefusedError(`${name} must be a valid lowercase username`);
  }
}

function parseDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new SeedRefusedError("SEED_START_DATE must use YYYY-MM-DD");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.valueOf()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new SeedRefusedError("SEED_START_DATE must be a real calendar date");
  }
  return date;
}

function validateTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
  } catch {
    throw new SeedRefusedError("SEED_TIMEZONE must be a valid IANA time zone");
  }
}

async function seed(): Promise<void> {
  const environment = process.env.NODE_ENV;
  if (environment !== "development" && environment !== "test") {
    throw new SeedRefusedError(
      "Seed is restricted to an explicit NODE_ENV=development or NODE_ENV=test",
    );
  }
  if (!process.argv.slice(2).includes("--confirm-development-seed")) {
    throw new SeedRefusedError(
      "Pass --confirm-development-seed explicitly (for Prisma: prisma db seed -- --confirm-development-seed)",
    );
  }

  const password = requiredEnvironment("SEED_PASSWORD");
  if (password.length < 12 || password.length > 256) {
    throw new SeedRefusedError(
      "SEED_PASSWORD must be between 12 and 256 characters",
    );
  }
  const usernameA = process.env.SEED_USERNAME_A?.trim() || "ming";
  const usernameB = process.env.SEED_USERNAME_B?.trim() || "tian";
  validateUsername(usernameA, "SEED_USERNAME_A");
  validateUsername(usernameB, "SEED_USERNAME_B");
  if (usernameA === usernameB)
    throw new SeedRefusedError("Seed usernames must be different");

  const displayNameA = process.env.SEED_DISPLAY_NAME_A?.trim() || "甲";
  const displayNameB = process.env.SEED_DISPLAY_NAME_B?.trim() || "乙";
  const coupleName = process.env.SEED_COUPLE_NAME?.trim() || "我们的明天";
  const startDate = parseDate(
    process.env.SEED_START_DATE?.trim() || "2024-01-01",
  );
  const timezone = process.env.SEED_TIMEZONE?.trim() || "Asia/Shanghai";
  validateTimeZone(timezone);

  const passwordHash = await hash(password, {
    type: argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  const result = await prisma.$transaction(
    async (transaction) => {
      const userA = await transaction.user.upsert({
        where: { username: usernameA },
        create: {
          username: usernameA,
          displayName: displayNameA,
          passwordHash,
          status: UserStatus.ACTIVE,
        },
        update: {
          displayName: displayNameA,
          passwordHash,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
        select: { id: true, username: true },
      });
      const userB = await transaction.user.upsert({
        where: { username: usernameB },
        create: {
          username: usernameB,
          displayName: displayNameB,
          passwordHash,
          status: UserStatus.ACTIVE,
        },
        update: {
          displayName: displayNameB,
          passwordHash,
          status: UserStatus.ACTIVE,
          deletedAt: null,
        },
        select: { id: true, username: true },
      });
      const couple = await transaction.couple.upsert({
        where: { id: SEED_COUPLE_ID },
        create: {
          id: SEED_COUPLE_ID,
          name: coupleName,
          startDate,
          timezone,
          status: CoupleStatus.ACTIVE,
        },
        update: {
          name: coupleName,
          startDate,
          timezone,
          status: CoupleStatus.ACTIVE,
          deletedAt: null,
        },
        select: { id: true, name: true },
      });
      for (const [index, user] of [userA, userB].entries()) {
        const slot = index + 1;
        await transaction.coupleMember.upsert({
          where: { coupleId_userId: { coupleId: couple.id, userId: user.id } },
          create: {
            coupleId: couple.id,
            userId: user.id,
            slot,
            status: CoupleMemberStatus.ACTIVE,
          },
          update: { slot, status: CoupleMemberStatus.ACTIVE, leftAt: null },
        });
      }
      return { couple, users: [userA.username, userB.username] };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  process.stdout.write(
    `Seeded development couple ${result.couple.name} (${result.couple.id}) with ${result.users.join(", ")}.\n`,
  );
}

seed()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Seed failed: ${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
