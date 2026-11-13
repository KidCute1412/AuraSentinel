// Uptime + alerting for the laptop demo (A10, D14). No dependency: Node 22 built-ins only.
// Every WATCH_INTERVAL_MS: GET HEALTH_URL, and the agent's AVAX balance over RPC. Telegram on
// every state CHANGE (2 bad checks in a row before alerting, so one slow RPC call stays quiet),
// and again on recovery. Without TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID it only logs.
//
// It reads public data only: the health JSON and a public address. It never sees a key.

const env = process.env;
const HEALTH_URL = env.HEALTH_URL ?? 'http://api:4000/api/health';
const RPC_URL = (env.FUJI_RPC_URLS ?? '').split(',')[0]?.trim();
const AGENT = env.AGENT_ADDRESS?.trim();
const INTERVAL_MS = Number(env.WATCH_INTERVAL_MS ?? 30_000);
/** Below this the agent cannot pay for many swaps (wei). Default 0.1 AVAX. */
const LOW_GAS_WEI = BigInt(env.AGENT_LOW_GAS_WEI ?? '100000000000000000');
const CONFIRM = 2;

const TG_TOKEN = env.TELEGRAM_BOT_TOKEN?.trim();
const TG_CHAT = env.TELEGRAM_CHAT_ID?.trim();

/** One check -> a list of problems (empty = healthy). */
export async function check({ fetchImpl = fetch } = {}) {
  const problems = [];
  try {
    const res = await fetchImpl(HEALTH_URL, { signal: AbortSignal.timeout(5_000) });
    const h = await res.json();
    if (res.status >= 500 || h.status === 'down') problems.push(`API down (postgres ${h.postgres}, redis ${h.redis})`);
    else {
      if (h.rpc !== 'up') problems.push('Fuji RPC unreachable from the server');
      if (h.worker !== 'up') problems.push('Worker not running (no swaps, no indexer)');
    }
  } catch (e) {
    problems.push(`API unreachable: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (RPC_URL && AGENT) {
    try {
      const res = await fetchImpl(RPC_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [AGENT, 'latest'] }),
        signal: AbortSignal.timeout(5_000),
      });
      const wei = BigInt((await res.json()).result);
      if (wei < LOW_GAS_WEI) problems.push(`Agent gas low: ${formatAvax(wei)} AVAX left`);
    } catch {
      /* RPC trouble is already reported through health */
    }
  }
  return problems;
}

/**
 * Pure state machine: alert when the set of problems has been stable for CONFIRM checks and
 * differs from what was last announced.
 */
export function next(state, problems) {
  const key = problems.slice().sort().join(' | ');
  const streak = key === state.pendingKey ? state.streak + 1 : 1;
  const s = { announcedKey: state.announcedKey, pendingKey: key, streak };
  if (streak >= CONFIRM && key !== state.announcedKey) {
    s.announcedKey = key;
    return { state: s, alert: key === '' ? '✅ AgentShield recovered: all checks pass' : `🚨 AgentShield: ${problems.join('; ')}` };
  }
  return { state: s, alert: null };
}

export const INITIAL = { announcedKey: '', pendingKey: '', streak: 0 };

function formatAvax(wei) {
  const whole = wei / 10n ** 18n;
  const frac = ((wei % 10n ** 18n) / 10n ** 15n).toString().padStart(3, '0');
  return `${whole}.${frac}`;
}

async function notify(text) {
  console.log(`[watchdog] ${new Date().toISOString()} ${text}`);
  if (!TG_TOKEN || !TG_CHAT) return;
  try {
    await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    console.error(`[watchdog] telegram failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

async function main() {
  console.log(`[watchdog] watching ${HEALTH_URL} every ${INTERVAL_MS} ms; telegram ${TG_TOKEN && TG_CHAT ? 'on' : 'off (log only)'}`);
  let state = INITIAL;
  for (;;) {
    const r = next(state, await check());
    state = r.state;
    if (r.alert) await notify(r.alert);
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
}

// Run only as a program (node watchdog.mjs), not when imported by the test.
if (process.argv[1]?.endsWith('watchdog.mjs')) void main();
