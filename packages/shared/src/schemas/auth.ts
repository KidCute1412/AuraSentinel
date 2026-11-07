import { z } from 'zod';
import { Address } from '../chain';

export const Role = z.enum(['user', 'owner', 'admin']);
export type Role = z.infer<typeof Role>;

export const NonceResponse = z.object({ nonce: z.string().min(8), expiresAt: z.string().datetime() });
export type NonceResponse = z.infer<typeof NonceResponse>;

export const CreateSessionRequest = z.object({
  message: z.string().min(1),
  signature: z.custom<`0x${string}`>((v) => typeof v === 'string' && /^0x[0-9a-fA-F]+$/.test(v), 'invalid signature'),
});
export type CreateSessionRequest = z.infer<typeof CreateSessionRequest>;

export const SessionDto = z.object({
  address: Address,
  role: Role,
  ownedVaults: z.array(Address),
  expiresAt: z.string().datetime().optional(),
});
export type SessionDto = z.infer<typeof SessionDto>;

/** GET /auth/session when signed out. */
export const AnonymousSessionDto = z.object({ address: z.null(), role: z.null() });
export type AnonymousSessionDto = z.infer<typeof AnonymousSessionDto>;

export const GetSessionResponse = z.union([SessionDto, AnonymousSessionDto]);
export type GetSessionResponse = z.infer<typeof GetSessionResponse>;
