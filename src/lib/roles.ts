export const ADMIN_ROLE = "admin";
export const USER_ROLE = "user";
export const USER_ROLES = [ADMIN_ROLE, USER_ROLE] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function hasAdminRole(role: string | null | undefined): role is "admin" {
  return role === ADMIN_ROLE;
}
