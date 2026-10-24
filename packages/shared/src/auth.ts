import { z } from 'zod';
import { AccountStatus, Role, SELF_REGISTER_ROLES, SubscriptionTier } from './roles.js';

export const passwordSchema = z
  .string()
  .min(8, { error: 'Password must be at least 8 characters' })
  .max(72, { error: 'Password must be at most 72 characters' })
  .regex(/[A-Za-z]/, { error: 'Password must contain a letter' })
  .regex(/[0-9]/, { error: 'Password must contain a number' });

export const registerSchema = z.object({
  name: z.string().trim().min(2, { error: 'Name is required' }).max(100),
  email: z.email({ error: 'Enter a valid email' }).trim().toLowerCase(),
  password: passwordSchema,
  role: z.enum(SELF_REGISTER_ROLES).default(Role.USER),
  consent: z.literal(true, { error: 'You must accept the privacy policy' }),
});
export type RegisterInput = z.input<typeof registerSchema>;
export type RegisterDto = z.output<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.email({ error: 'Enter a valid email' }).trim().toLowerCase(),
  password: z.string().min(1, { error: 'Password is required' }),
});
export type LoginDto = z.infer<typeof loginSchema>;

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: AccountStatus;
  emailVerified: boolean;
  /** Only meaningful for USER accounts. */
  tier: SubscriptionTier;
}

/** Claims carried by the access token. */
export interface JwtPayload {
  sub: string;
  role: Role;
  tier: SubscriptionTier;
}

export interface ApiErrorBody {
  statusCode: number;
  message: string;
  /** Machine-readable reason, e.g. CHAT_LIMIT_REACHED. */
  code?: string;
  errors?: Record<string, string[]>;
}
