import { DEMO_NORMAL_TRADE, formatUnits, type CheckStatus, type PreflightCheck, type PreflightDto } from '@agentshield/shared';

/**
 * Demo Day preflight (admin console): is the stage ready, and if not, why. Pure and deterministic: every input is
 * read beforehand (chain, services, DB) and every verdict is a fixed rule here. No LLM, no I/O.
 */

/** A value read for the preflight, or why it could not be read (that source's check then fails, the rest still run). */
export type Read<T> = { ok: true; value: T } | { ok: false; error: string };

export interface DemoVaultReads {
  isActive: boolean;
  /** Policy expiry, unix seconds (0 = never). */
  expiry: number;
  /** USDC daily cap of the policy (base units); null when USDC has no limit. */
  dailyCap: bigint | null;
  spentToday: bigint;
  usdcBalance: bigint;
}

export interface PreflightInput {
  now: Date;
  /** anvil: the Fuji fork the simulation step runs on; without it every swap fails at Shield 1 (b). */
  services: Read<{ postgres: boolean; redis: boolean; rpc: boolean; worker: boolean; anvil: boolean }>;
  /** Agent balance (wei) and the current max fee per gas (wei), null if the fee could not be read. */
  gas: Read<{ balance: bigint; maxFeePerGas: bigint | null }>;
  minGasWei: bigint;
  gasUsedPerSwap: bigint;
  /** null: no demo vault configured (SAFE_ADDRESS unset). */
  demo: Read<DemoVaultReads> | null;
  indexer: Read<{ cursor: bigint | null; head: bigint }>;
  paused: Read<boolean>;
  geminiConfigured: boolean;
  blockedTxs: Read<number>;
  failedLastHour: Read<number>;
}

export const LOW_SWAPS = 50;
export const INDEXER_MAX_LAG = 50n;
const DAY_S = 86_400;
const RANK: Record<CheckStatus, number> = { ok: 0, warn: 1, fail: 2 };

/** en-US display of base units (bigint math): thousands separators, at most `maxFrac` decimals, rounded down. */
export function displayUnits(v: bigint, decimals: number, maxFrac: number): string {
  const [whole = '0', frac = ''] = formatUnits(v, decimals).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cut = frac.slice(0, maxFrac).replace(/0+$/, '');
  return cut ? `${grouped}.${cut}` : grouped;
}
const usdc = (v: bigint) => `${displayUnits(v, 6, 2)} USDC`;
const avax = (v: bigint) => `${displayUnits(v, 18, 4)} AVAX`;
const check = (id: string, label: string, status: CheckStatus, detail: string, fix: string | null = null): PreflightCheck => ({
  id,
  label,
  status,
  detail,
  fix: status === 'ok' ? null : fix,
});
const unread = (id: string, label: string, r: { error: string }) => check(id, label, 'fail', `Could not read: ${r.error}`, 'Check the server logs and /api/health.');

/** Swaps the balance still pays for at this fee (integer, rounded down), or null when the fee is unknown or zero. */
export function swapsLeft(balance: bigint, maxFeePerGas: bigint | null, gasUsedPerSwap: bigint): number | null {
  if (!maxFeePerGas || maxFeePerGas <= 0n || gasUsedPerSwap <= 0n) return null;
  const n = balance / (gasUsedPerSwap * maxFeePerGas);
  return n > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(n);
}

/** USDC the demo vault can still trade today, or null when the policy sets no USDC limit. */
export function budgetLeft(d: DemoVaultReads): bigint | null {
  if (d.dailyCap === null) return null;
  return d.dailyCap > d.spentToday ? d.dailyCap - d.spentToday : 0n;
}

export function evaluatePreflight(i: PreflightInput): PreflightDto {
  const checks: PreflightCheck[] = [];

  // Services
  if (!i.services.ok) checks.push(unread('services', 'Services', i.services));
  else {
    const down = Object.entries(i.services.value).flatMap(([name, up]) => (up ? [] : [name]));
    checks.push(
      down.length === 0
        ? check('services', 'Services', 'ok', 'Postgres, Redis, RPC, worker and the Anvil fork are up.')
        : check(
            'services',
            'Services',
            'fail',
            `Down: ${down.join(', ')}.${down.includes('anvil') ? ' Without the fork, swaps cannot be simulated and fail.' : ''}`,
            'Restart the stack (start.bat or docker compose) and check /api/health.',
          ),
    );
  }

  // Agent gas
  if (!i.gas.ok) checks.push(unread('agent-gas', 'Agent gas', i.gas));
  else {
    const { balance, maxFeePerGas } = i.gas.value;
    const left = swapsLeft(balance, maxFeePerGas, i.gasUsedPerSwap);
    const about = left === null ? avax(balance) : `${avax(balance)}, about ${left.toLocaleString('en-US')} swaps at the current fee`;
    const fix = 'Send Fuji AVAX to the agent address (faucet: core.app/tools/testnet-faucet).';
    if (balance < i.minGasWei) checks.push(check('agent-gas', 'Agent gas', 'fail', `${about}. Below the ${avax(i.minGasWei)} minimum: new jobs are refused.`, fix));
    else if (left !== null && left < LOW_SWAPS) checks.push(check('agent-gas', 'Agent gas', 'warn', `${about}.`, fix));
    else checks.push(check('agent-gas', 'Agent gas', 'ok', `${about}.`));
  }

  // Demo vault
  if (i.demo === null) {
    checks.push(check('demo-vault', 'Demo vault', 'fail', 'No demo vault configured (SAFE_ADDRESS).', 'Set SAFE_ADDRESS, or keep the default from packages/shared.'));
  } else if (!i.demo.ok) {
    checks.push(unread('demo-vault', 'Demo vault', i.demo));
  } else {
    const d = i.demo.value;
    checks.push(
      d.isActive
        ? check('demo-active', 'Demo vault armed', 'ok', 'The agent is allowed to trade.')
        : check('demo-active', 'Demo vault armed', 'fail', 'The Kill-Switch is on: every trade reverts.', 'The demo vault owner re-enables the agent from the dashboard (signed in their wallet).'),
    );

    const nowS = Math.floor(i.now.getTime() / 1000);
    if (d.expiry === 0) checks.push(check('demo-expiry', 'Policy expiry', 'ok', 'The policy never expires.'));
    else if (d.expiry <= nowS) checks.push(check('demo-expiry', 'Policy expiry', 'fail', 'The policy has expired: every trade reverts.', 'The owner sets a new policy with a later expiry.'));
    else {
      const hours = Math.floor((d.expiry - nowS) / 3600);
      const when = hours >= 48 ? `in ${Math.floor(hours / 24)} days` : `in ${hours} h`;
      checks.push(
        d.expiry - nowS < DAY_S
          ? check('demo-expiry', 'Policy expiry', 'warn', `Expires ${when}.`, 'The owner sets a new policy with a later expiry before the demo.')
          : check('demo-expiry', 'Policy expiry', 'ok', `Expires ${when}.`),
      );
    }

    const left = budgetLeft(d);
    if (left === null) checks.push(check('demo-budget', 'Daily budget', 'warn', 'The policy sets no USDC limit.', 'Set a USDC limit so the "too much" attack has something to hit.'));
    else {
      const detail = `${usdc(left)} of ${usdc(d.dailyCap!)} left today.`;
      checks.push(
        left >= DEMO_NORMAL_TRADE
          ? check('demo-budget', 'Daily budget', 'ok', detail)
          : check('demo-budget', 'Daily budget', 'warn', `${detail} The normal trade (${usdc(DEMO_NORMAL_TRADE)}) will shrink or be blocked.`, 'Wait for the daily reset (00:00 UTC), or present on a fresh vault.'),
      );
    }

    checks.push(
      d.usdcBalance >= DEMO_NORMAL_TRADE
        ? check('demo-balance', 'Vault balance', 'ok', `${usdc(d.usdcBalance)} in the vault.`)
        : check('demo-balance', 'Vault balance', 'fail', `${usdc(d.usdcBalance)} in the vault, less than the ${usdc(DEMO_NORMAL_TRADE)} normal trade.`, 'The owner deposits USDC into the demo vault.'),
    );
  }

  // Indexer
  if (!i.indexer.ok) checks.push(unread('indexer', 'Indexer', i.indexer));
  else if (i.indexer.value.cursor === null) checks.push(check('indexer', 'Indexer', 'warn', 'Has not indexed any block yet.', 'Check that the worker is running.'));
  else {
    const { cursor, head } = i.indexer.value;
    const lag = head > cursor ? head - cursor : 0n;
    checks.push(
      lag <= INDEXER_MAX_LAG
        ? check('indexer', 'Indexer', 'ok', lag === 0n ? 'Up to date with the chain head.' : `${lag} block${lag === 1n ? '' : 's'} behind the chain head.`)
        : check('indexer', 'Indexer', 'warn', `${lag.toLocaleString('en-US')} blocks behind: new vaults and events show up late.`, 'Check the worker logs; a dedicated RPC indexes faster.'),
    );
  }

  // Demo mode
  if (!i.paused.ok) checks.push(unread('demo-mode', 'Demo mode', i.paused));
  else {
    checks.push(
      i.paused.value
        ? check('demo-mode', 'Demo mode', 'ok', 'Rebalancer paused: only buttons you press move the vaults.')
        : check('demo-mode', 'Demo mode', 'warn', 'The rebalancer is trading on its own.', 'Pause it (section 02) before presenting.'),
    );
  }

  // Explainer
  checks.push(
    i.geminiConfigured
      ? check('explainer', 'AI explanations', 'ok', 'Gemini key set; falls back to templates when slow or rate-limited.')
      : check('explainer', 'AI explanations', 'warn', 'No GEMINI_API_KEY: explanations use templates.', 'Add GEMINI_API_KEY to the server env. Verdicts do not depend on it.'),
  );

  // On-chain proof
  if (!i.blockedTxs.ok) checks.push(unread('onchain-proof', 'On-chain proof', i.blockedTxs));
  else {
    const n = i.blockedTxs.value;
    checks.push(
      n > 0
        ? check('onchain-proof', 'On-chain proof', 'ok', `${n} attack transaction${n === 1 ? '' : 's'} reverted by the module, listed on /proof.`)
        : check('onchain-proof', 'On-chain proof', 'warn', 'No reverted attack on record: /proof shows an empty list.', 'Run "Bypass the website" once on the demo vault.'),
    );
  }

  // Recent failures
  if (!i.failedLastHour.ok) checks.push(unread('recent-failures', 'Recent failures', i.failedLastHour));
  else {
    const n = i.failedLastHour.value;
    checks.push(
      n === 0
        ? check('recent-failures', 'Recent failures', 'ok', 'No job failed on infrastructure in the last hour.')
        : check('recent-failures', 'Recent failures', 'warn', `${n} job${n === 1 ? '' : 's'} failed on infrastructure (RPC, gas, nonce) in the last hour.`, 'Open the Failed tab in section 03 for the reasons.'),
    );
  }

  const status = checks.reduce<CheckStatus>((worst, c) => (RANK[c.status] > RANK[worst] ? c.status : worst), 'ok');
  const demoBudget =
    i.demo?.ok && i.demo.value.dailyCap !== null ? { left: String(budgetLeft(i.demo.value) ?? 0n), cap: String(i.demo.value.dailyCap) } : null;
  return { status, checkedAt: i.now.toISOString(), checks, demoBudget };
}
