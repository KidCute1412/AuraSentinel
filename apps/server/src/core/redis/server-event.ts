import { z } from 'zod';

/**
 * PLACEHOLDER: the canonical ServerEvent union belongs in packages/shared/src/events.ts.
 * Move this there once the package exists and import it from `@agentshield/shared`.
 */
export const serverEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('job.updated'),
    jobId: z.string(),
    status: z.string(),
    patch: z.record(z.unknown()).optional(),
  }),
  z.object({
    type: z.literal('chain.event'),
    name: z.string(),
    txHash: z.string(),
    args: z.record(z.unknown()),
  }),
]);

export type ServerEvent = z.infer<typeof serverEventSchema>;
