import { PrismaClient } from "@prisma/client";

const SAFE_DATABASE_NAME = /(test|integration|stage1)/i;

export function integrationDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!value) {
    throw new Error(
      "TEST_DATABASE_URL (or DATABASE_URL) is required for PostgreSQL integration tests",
    );
  }

  const url = new URL(value);
  if (!["postgresql:", "postgres:"].includes(url.protocol)) {
    throw new Error("Integration tests require PostgreSQL");
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!SAFE_DATABASE_NAME.test(databaseName)) {
    throw new Error(
      `Refusing to reset database '${databaseName}'; its name must contain test, integration, or stage1`,
    );
  }

  return value;
}

export function createTestPrisma(databaseUrl: string): PrismaClient {
  process.env.DATABASE_URL = databaseUrl;
  return new PrismaClient();
}

export async function resetTestDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  `;

  if (tables.length === 0) {
    throw new Error(
      "The integration database has no application tables; apply Prisma migrations first",
    );
  }

  const quotedTables = tables
    .map(({ tablename }) => `"${tablename.replaceAll('"', '""')}"`)
    .join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`,
  );
}
