/**
 * Server-side view of the shared contracts (@agentshield/shared is the source of truth).
 * Wire shapes (JSON, BullMQ, DB) carry money as base-unit strings; domain math uses bigint (invariant 4).
 */
import {
  intentToBigint,
  intentToWire,
  type Explanation,
  type JobStatus,
  type SimResult,
  type SwapIntent as SwapIntentWire,
  type SwapIntentBigint,
} from '@agentshield/shared';

export type { Explanation, JobStatus, SimResult, SwapIntentWire };

/** In-process intent with bigint amounts. */
export type SwapIntent = SwapIntentBigint;

export const intentFromWire = intentToBigint;
export { intentToWire };
