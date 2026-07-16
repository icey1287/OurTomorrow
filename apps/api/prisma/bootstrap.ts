import "dotenv/config";
import { createHash, timingSafeEqual } from "node:crypto";
import { argon2id, hash } from "argon2";
import { Prisma, PrismaClient, UserStatus } from "@prisma/client";

type BootstrapOptions = {
  token: string | undefined;
  username: string | undefined;
  displayName: string | undefined;
  passwordEnv: string | undefined;
  passwordStdin: boolean;
};

class BootstrapRefusedError extends Error {}

const prisma = new PrismaClient();

function takeValue(arguments_: string[], index: number, flag: string): string {
  const value = arguments_[index + 1];
  if (!value || value.startsWith("--")) {
    throw new BootstrapRefusedError(`${flag} requires a value`);
  }
  return value;
}

function parseArguments(arguments_: string[]): BootstrapOptions {
  const options: BootstrapOptions = {
    token: undefined,
    username: undefined,
    displayName: undefined,
    passwordEnv: undefined,
    passwordStdin: false,
  };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    switch (argument) {
      case "--":
        break;
      case "--token":
        options.token = takeValue(arguments_, index, argument);
        index += 1;
        break;
      case "--username":
        options.username = takeValue(arguments_, index, argument);
        index += 1;
        break;
      case "--display-name":
        options.displayName = takeValue(arguments_, index, argument);
        index += 1;
        break;
      case "--password-env":
        options.passwordEnv = takeValue(arguments_, index, argument);
        index += 1;
        break;
      case "--password-stdin":
        options.passwordStdin = true;
        break;
      case "--password":
        throw new BootstrapRefusedError(
          "Passwords must not be passed on the command line; use --password-env or --password-stdin",
        );
      default:
        throw new BootstrapRefusedError(`Unknown argument: ${argument ?? ""}`);
    }
  }

  return options;
}

function required(value: string | undefined, flag: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new BootstrapRefusedError(`${flag} is required`);
  return normalized;
}

function secretsEqual(actual: string, expected: string): boolean {
  const actualDigest = createHash("sha256").update(actual, "utf8").digest();
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

async function readPasswordFromStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new BootstrapRefusedError(
      "--password-stdin only accepts piped input so the password is not echoed by the terminal",
    );
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks)
    .toString("utf8")
    .replace(/[\r\n]+$/, "");
}

async function resolvePassword(options: BootstrapOptions): Promise<string> {
  if (options.passwordEnv && options.passwordStdin) {
    throw new BootstrapRefusedError(
      "Choose exactly one of --password-env or --password-stdin",
    );
  }
  if (options.passwordEnv) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(options.passwordEnv)) {
      throw new BootstrapRefusedError(
        "--password-env must name an uppercase environment variable",
      );
    }
    return required(process.env[options.passwordEnv], options.passwordEnv);
  }
  if (options.passwordStdin) return readPasswordFromStdin();
  throw new BootstrapRefusedError(
    "Use --password-env or --password-stdin to provide the password",
  );
}

function validateUsername(username: string): void {
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(username)) {
    throw new BootstrapRefusedError(
      "Username must be 3-64 lowercase characters using letters, numbers, dot, underscore, or hyphen",
    );
  }
}

function validatePassword(password: string): void {
  if (password.length < 12 || password.length > 256) {
    throw new BootstrapRefusedError(
      "Password must be between 12 and 256 characters",
    );
  }
}

async function bootstrap(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const expectedToken = required(
    process.env.BOOTSTRAP_TOKEN,
    "BOOTSTRAP_TOKEN environment variable",
  );
  if (expectedToken.length < 32) {
    throw new BootstrapRefusedError(
      "BOOTSTRAP_TOKEN must contain at least 32 characters",
    );
  }
  const suppliedToken = required(options.token, "--token");
  if (!secretsEqual(suppliedToken, expectedToken)) {
    throw new BootstrapRefusedError("Bootstrap authorization failed");
  }

  const username = required(options.username, "--username");
  const displayName = required(options.displayName, "--display-name");
  validateUsername(username);
  if (displayName.length > 100) {
    throw new BootstrapRefusedError(
      "Display name must not exceed 100 characters",
    );
  }

  let password = await resolvePassword(options);
  validatePassword(password);
  const passwordHash = await hash(password, {
    type: argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  password = "";

  const user = await prisma.$transaction(
    async (transaction) => {
      if ((await transaction.user.count()) !== 0) {
        throw new BootstrapRefusedError(
          "Bootstrap is disabled after the first account exists; use authenticated account management",
        );
      }
      return transaction.user.create({
        data: {
          username,
          displayName,
          passwordHash,
          status: UserStatus.ACTIVE,
        },
        select: { id: true, username: true },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  process.stdout.write(
    `Created initial account ${user.username} (${user.id}).\n`,
  );
}

bootstrap()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Bootstrap failed: ${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
