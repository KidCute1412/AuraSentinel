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

type Address = SwapIntentWire['recipient'];

/**
 * Which vault a transaction or simulation acts on. Comes from the vault registry (or env until
 * A3/A6 serve it per vault), never from the intent: `recipient` is attacker-controllable.
 */
export interface VaultTarget {
  safe: Address;
  module: Address;
}
