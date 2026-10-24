/**
 * Stored account roles. A guest is simply an unauthenticated visitor.
 * Free vs. paid is a subscription tier on a USER, not a separate role.
 */
export const Role = {
  USER: 'USER',
  DOCTOR: 'DOCTOR',
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const SubscriptionTier = {
  FREE: 'FREE',
  PAID: 'PAID',
} as const;
export type SubscriptionTier = (typeof SubscriptionTier)[keyof typeof SubscriptionTier];

export const AccountStatus = {
  ACTIVE: 'ACTIVE',
  DEACTIVATED: 'DEACTIVATED',
} as const;
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

/** Where each role lands after login. */
export const DASHBOARD_BY_ROLE: Record<Role, string> = {
  USER: '/dashboard',
  DOCTOR: '/doctor',
  ADMIN: '/admin',
};

/** Roles a visitor may pick when self-registering. Admins are seeded. */
export const SELF_REGISTER_ROLES = [Role.USER, Role.DOCTOR] as const;
