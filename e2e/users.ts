/** Users seeded by `scripts/e2e-prepare.ts`; specs reuse their saved storage states. */
export const ADMIN = {
  username: "admin",
  password: "admin-password-1",
  storageState: "e2e/.auth/admin.json",
} as const;

export const TESTER = {
  username: "tester",
  name: "Tina Tester",
  password: "tester-password-1",
  storageState: "e2e/.auth/tester.json",
} as const;
