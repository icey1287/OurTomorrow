export const IDENTITY_ROLES = ["boy", "girl"] as const;

export type IdentityRole = (typeof IDENTITY_ROLES)[number];

export const FIXED_COUPLE_ID = "00000000-0000-4000-8000-000000000001";
export const FIXED_BOY_USER_ID = "00000000-0000-4000-8000-000000000101";
export const FIXED_GIRL_USER_ID = "00000000-0000-4000-8000-000000000102";
export const FIXED_BOY_MEMBER_ID = "00000000-0000-4000-8000-000000000201";
export const FIXED_GIRL_MEMBER_ID = "00000000-0000-4000-8000-000000000202";

export const FIXED_USER_IDS = [FIXED_BOY_USER_ID, FIXED_GIRL_USER_ID] as const;

export function roleForSlot(slot: number): IdentityRole {
  return slot === 1 ? "boy" : "girl";
}
