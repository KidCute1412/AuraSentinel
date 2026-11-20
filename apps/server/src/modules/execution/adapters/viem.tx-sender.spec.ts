import { decodeFunctionData, encodeErrorResult, keccak256, toHex, type Hex } from 'viem';
import { describe, expect, it, vi } from 'vitest';
import { POLICY_MODULE_ABI, SWAP_GAS } from '../../../core/chain/abis';
import type { SwapIntent } from '../../../core/types';
import { ViemTxSender } from './viem.tx-sender';

const AGENT = '0x2222222222222222222222222222222222222222';
const SAFE = '0x1111111111111111111111111111111111111111';
const MODULE = '0x5555555555555555555555555555555555555555';
const USDC = '0x3333333333333333333333333333333333333333';
const WAVAX = '0x4444444444444444444444444444444444444444';
/** Chain clock deliberately far from the host clock: the deadline must follow the chain. */
const CHAIN_NOW = 1_000_000n;
const ATTACKER = '0x9999999999999999999999999999999999999999';

const intent = (amountIn: bigint): SwapIntent => ({
  tokenIn: USDC,
  tokenOut: WAVAX,
  amountIn,
  minAmountOut: 1n,
  recipient: SAFE,
  origin: 'rebalancer',
});

/** Signed bytes are a deterministic function of the nonce, so the hash is predictable. */
const signedFor = (nonce: number): Hex => toHex(`signed-tx-${nonce}`);

interface Opts {
  pending?: number;
  status?: (nonce: number) => 'success' | 'reverted';
  sendRaw?: (signed: Hex, attempt: number) => Promise<Hex>;
  revertData?: Hex;
  /** The receipt watcher fails (lagging RPC); `lateReceipt` is what a direct lookup then returns. */
  waitFails?: boolean;
  lateReceipt?: boolean;
}

function setup(o: Opts = {}) {
  const events: string[] = [];
  const signed: { nonce: number; to: string; data: Hex; gas: bigint }[] = [];
  const byHash = new Map<string, number>();
  let attempts = 0;
  const wallet = {
    account: { address: AGENT },
    chain: { id: 43113 },
    signTransaction: vi.fn(async (req: { nonce: number; to: string; data: Hex; gas: bigint }) => {
      signed.push(req);
      const tx = signedFor(req.nonce);
      byHash.set(keccak256(tx), req.nonce);
      return tx;
    }),
  };
  const publicClient = {
    getTransactionCount: vi.fn(async () => o.pending ?? 7),
    getBlock: vi.fn(async () => ({ timestamp: CHAIN_NOW })),
    estimateFeesPerGas: vi.fn(async () => ({ maxFeePerGas: 30n, maxPriorityFeePerGas: 1n })),
    sendRawTransaction: vi.fn(async ({ serializedTransaction }: { serializedTransaction: Hex }) => {
      attempts++;
      if (o.sendRaw) return o.sendRaw(serializedTransaction, attempts);
      return keccak256(serializedTransaction);
    }),
    waitForTransactionReceipt: vi.fn(async ({ hash }: { hash: Hex }) => {
      const nonce = byHash.get(hash) ?? -1;
      if (o.waitFails) throw new Error('Timed out while waiting for transaction');
      events.push(`start ${nonce}`);
      await new Promise((r) => setTimeout(r, 10));
      events.push(`end ${nonce}`);
      return { status: o.status?.(nonce) ?? 'success', blockNumber: BigInt(100 + nonce) };
    }),
    getTransactionReceipt: vi.fn(async ({ hash }: { hash: Hex }) => {
      if (!o.lateReceipt) throw new Error('Transaction receipt could not be found');
      const nonce = byHash.get(hash) ?? -1;
      return { status: o.status?.(nonce) ?? 'success', blockNumber: BigInt(100 + nonce) };
    }),
    call: vi.fn(async () => {
      throw Object.assign(new Error('execution reverted'), { cause: { data: o.revertData } });
    }),
  };
  const sender = new ViemTxSender(wallet as never, publicClient as never, { retryBaseDelayMs: 1, pollingIntervalMs: 1 });
  return { sender, wallet, publicClient, signed, events };
}

describe('ViemTxSender', () => {
  it('exposes the session key address, never the key', () => {
    expect(setup().sender.address).toBe(AGENT);
  });

  it('runs two concurrent sends one after the other with consecutive nonces', async () => {
    const { sender, signed, events } = setup({ pending: 7 });
    const [a, b] = await Promise.all([
      sender.sendSwap(intent(100n), { safe: SAFE, module: MODULE }),
      sender.sendSwap(intent(200n), { safe: SAFE, module: MODULE }),
    ]);
    // Pending count stays 7 (receipts are mocked): the cached next nonce must win.
    expect(signed.map((s) => s.nonce)).toEqual([7, 8]);
    expect(events).toEqual(['start 7', 'end 7', 'start 8', 'end 8']);
    expect(a.txHash).toBe(keccak256(signedFor(7)));
    expect(b.txHash).toBe(keccak256(signedFor(8)));
    expect(a.txHash).not.toBe(b.txHash);
  });

  it('encodes executeGuardedSwap with manual gas, the module as `to`, and no recipient', async () => {
    const { sender, signed } = setup();
    await sender.sendSwap({ ...intent(500n), recipient: ATTACKER }, { safe: SAFE, module: MODULE });
    const [tx] = signed;
    expect(tx?.to).toBe(MODULE);
    expect(tx?.gas).toBe(SWAP_GAS);
    const { functionName, args } = decodeFunctionData({ abi: POLICY_MODULE_ABI, data: tx!.data });
    expect(functionName).toBe('executeGuardedSwap');
    const [tokenIn, tokenOut, amountIn, minOut, deadline] = args as readonly [string, string, bigint, bigint, bigint];
    expect([tokenIn, tokenOut, amountIn, minOut]).toEqual([USDC, WAVAX, 500n, 1n]);
    // Chain clock + 5 min, never the host clock (a skewed laptop would revert every swap).
    expect(deadline).toBe(CHAIN_NOW + 300n);
    expect(tx!.data.toLowerCase()).not.toContain(ATTACKER.slice(2));
  });

  it('returns a reverted tx with its hash and the decoded reason (a revert is a result, not an error)', async () => {
    const revertData = encodeErrorResult({ abi: POLICY_MODULE_ABI, errorName: 'ExceedsPerTxCap' });
    const { sender, publicClient } = setup({ status: () => 'reverted', revertData });
    const r = await sender.sendSwap(intent(2_000_000_000n), { safe: SAFE, module: MODULE });
    expect(r).toMatchObject({ status: 'reverted', revertReason: 'ExceedsPerTxCap', revertData, blockNumber: 107n });
    expect(r.txHash).toBe(keccak256(signedFor(7)));
    expect(publicClient.sendRawTransaction).toHaveBeenCalledTimes(1); // never retried
  });

  it('keeps a mined revert (hash + reason) when the receipt watcher times out but the receipt exists', async () => {
    const revertData = encodeErrorResult({ abi: POLICY_MODULE_ABI, errorName: 'ExceedsPerTxCap' });
    const { sender } = setup({ status: () => 'reverted', revertData, waitFails: true, lateReceipt: true });
    const r = await sender.sendSwap(intent(2_000_000_000n), { safe: SAFE, module: MODULE });
    expect(r).toMatchObject({ status: 'reverted', revertReason: 'ExceedsPerTxCap', blockNumber: 107n });
    expect(r.txHash).toBe(keccak256(signedFor(7)));
  });

  it('still throws when the receipt watcher times out and no receipt exists', async () => {
    const { sender } = setup({ waitFails: true });
    await expect(sender.sendSwap(intent(100n), { safe: SAFE, module: MODULE })).rejects.toThrow(/no receipt for/);
  });

  it('re-broadcasts the same signed bytes after a timeout and accepts "already known"', async () => {
    const { sender, wallet, publicClient } = setup({
      sendRaw: async (_signed, attempt) => {
        if (attempt === 1) throw new Error('The request took too long to respond. timeout');
        throw new Error('already known');
      },
    });
    const r = await sender.sendRaw({ to: MODULE, data: '0x', gas: 21_000n });
    expect(r.status).toBe('success');
    expect(wallet.signTransaction).toHaveBeenCalledTimes(1);
    const sent = publicClient.sendRawTransaction.mock.calls.map((c) => c[0].serializedTransaction);
    expect(sent).toEqual([signedFor(7), signedFor(7)]);
  });

  it('throws on a non-retryable broadcast error and re-reads the nonce next time', async () => {
    let fail = true;
    const { sender, signed } = setup({
      pending: 3,
      sendRaw: async (s) => {
        if (fail) {
          fail = false;
          throw new Error('insufficient funds for gas * price + value');
        }
        return keccak256(s);
      },
    });
    await expect(sender.sendRaw({ to: MODULE, data: '0x', gas: 21_000n })).rejects.toThrow('insufficient funds');
    await sender.sendRaw({ to: MODULE, data: '0x', gas: 21_000n });
    expect(signed.map((s) => s.nonce)).toEqual([3, 3]); // no gap left behind
  });

  it('refuses to send to an unconfigured module', () => {
    const { sender } = setup();
    expect(() => sender.sendSwap(intent(1n), { safe: SAFE, module: '0x0000000000000000000000000000000000000000' })).toThrow(
      'module address is not configured',
    );
  });
});

describe('ViemTxSender.callRaw (Hijacked Agent dry run)', () => {
  const call = { to: MODULE as Hex, data: '0x1234' as Hex, gas: 300_000n };
  const capData = encodeErrorResult({ abi: POLICY_MODULE_ABI, errorName: 'ExceedsPerTxCap' });

  it('reports a revert with its decoded reason, from the session key, without signing', async () => {
    const t = setup({ revertData: capData });
    await expect(t.sender.callRaw(call)).resolves.toEqual({ reverted: true, revertReason: 'ExceedsPerTxCap' });
    expect(t.publicClient.call).toHaveBeenCalledWith({ account: AGENT, ...call });
    expect(t.wallet.signTransaction).not.toHaveBeenCalled();
    expect(t.publicClient.sendRawTransaction).not.toHaveBeenCalled();
  });

  it('reports a call the chain would accept', async () => {
    const t = setup();
    t.publicClient.call.mockResolvedValueOnce({ data: '0x' } as never);
    await expect(t.sender.callRaw(call)).resolves.toEqual({ reverted: false });
  });

  it('throws an RPC failure instead of calling it a revert (the caller then sends nothing)', async () => {
    const t = setup();
    t.publicClient.call.mockRejectedValueOnce(new Error('fetch failed'));
    await expect(t.sender.callRaw(call)).rejects.toThrow('fetch failed');
  });
});
