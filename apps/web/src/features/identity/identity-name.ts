import type { IdentityRole } from "@our-tomorrow/contracts";

const ROLE_BY_NAME: Readonly<Record<string, IdentityRole>> = {
  示例用户乙: "girl",
  示例用户甲: "boy",
};

export function resolveIdentityRoleFromName(
  input: string,
): IdentityRole | null {
  const normalizedName = input.trim().normalize("NFKC");
  return ROLE_BY_NAME[normalizedName] ?? null;
}
