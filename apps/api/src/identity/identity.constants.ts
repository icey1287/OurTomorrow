export const IDENTITY_ROLES = ["boy", "girl"] as const;

export type IdentityRole = (typeof IDENTITY_ROLES)[number];

export const FIXED_COUPLE_ID = "00000000-0000-4000-8000-000000000001";
export const FIXED_BOY_USER_ID = "00000000-0000-4000-8000-000000000101";
export const FIXED_GIRL_USER_ID = "00000000-0000-4000-8000-000000000102";
export const FIXED_BOY_MEMBER_ID = "00000000-0000-4000-8000-000000000201";
export const FIXED_GIRL_MEMBER_ID = "00000000-0000-4000-8000-000000000202";

export const FIXED_USER_IDS = [FIXED_BOY_USER_ID, FIXED_GIRL_USER_ID] as const;

export const DEFAULT_COUPLE = {
  name: "我们的明天",
  startDate: "2024-01-01",
  timezone: "Asia/Shanghai",
  signature: "今天也一起认真生活。",
} as const;

export const FIXED_IDENTITIES = {
  boy: {
    role: "boy",
    slot: 1,
    userId: FIXED_BOY_USER_ID,
    memberId: FIXED_BOY_MEMBER_ID,
    username: "boy",
    displayName: "甲",
  },
  girl: {
    role: "girl",
    slot: 2,
    userId: FIXED_GIRL_USER_ID,
    memberId: FIXED_GIRL_MEMBER_ID,
    username: "girl",
    displayName: "乙",
  },
} as const satisfies Record<
  IdentityRole,
  {
    role: IdentityRole;
    slot: 1 | 2;
    userId: string;
    memberId: string;
    username: string;
    displayName: string;
  }
>;

export function roleForSlot(slot: number): IdentityRole {
  return slot === 1 ? "boy" : "girl";
}
