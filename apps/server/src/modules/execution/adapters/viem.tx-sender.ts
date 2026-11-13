import { Logger } from '@nestjs/common';
import {
  keccak256,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from 'viem';
import { SWAP_GAS } from '../../../core/chain/abis';
import { encodeGuardedSwap, swapDeadline } from '../../../core/chain/swap-calldata';
import type { SwapIntent, VaultTarget } from '../../../core/types';
import type { AgentWallet } from '../agent-wallet';
import { Mutex } from '../../../core/mutex';
import { decodeRevert, extractRevertData } from '../revert-decoder';
import type { RawCall, TxResult, TxSenderPort } from '../tx-sender.port';

export interface ViemTxSenderOptions {
  /** Max wait for a receipt. Fuji finality is ~1.5 s, so this only trips on a stuck RPC. */
  receiptTimeoutMs?: number;
  /** Broadcast attempts for infra errors (timeouts, 5xx). Never for reverts. */
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  /** Receipt polling interval; small on Anvil, default on Fuji. */
  pollingIntervalMs?: number;
}

/** The node already has (or has mined) this exact signed tx: the earlier attempt went through. */
const ALREADY_SENT = /already known|known transaction|nonce too low|replacement transaction underpriced/i;
/** Infra errors worth another attempt with the same signed bytes. */
const RETRYABLE = /timeout|timed out|fetch failed|ECONNRESET|ECONNREFUSED|socket|network|429|50[234]|rate limit/i;

const errMessage = (e: unknown) => (e instanceof Error ? `${e.message} ${String((e as { details?: unknown }).details ?? '')}` : String(e));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Real TxSender (A4). One instance per process, shared by the swap and attack queues:
 * - a FIFO mutex wraps nonce -> sign -> broadcast -> receipt, so two concurrent calls run one
 *   after the other and nonces never collide or gap (P4);
 * - the nonce is max(pending count on chain, last nonce used + 1);
 * - the tx is signed once; retries re-broadcast the same bytes (same hash), so an RPC timeout
 *   can never turn into a double swap;
 * - gas is always manual, so a Shield 2 revert is mined and returned with its hash + reason.
 */
export class ViemTxSender implements TxSenderPort {
  private readonly log = new Logger(ViemTxSender.name);
  private readonly mutex = new Mutex();
  private nextNonce: number | undefined;
  private readonly opts: Required<ViemTxSenderOptions>;

  constructor(
    private readonly wallet: AgentWallet,
    private readonly publicClient: PublicClient,
    opts: ViemTxSenderOptions = {},
  ) {
    this.opts = {
      receiptTimeoutMs: opts.receiptTimeoutMs ?? 60_000,
      maxAttempts: opts.maxAttempts ?? 3,
      retryBaseDelayMs: opts.retryBaseDelayMs ?? 500,
      pollingIntervalMs: opts.pollingIntervalMs ?? 500,
    };
  }

  get address(): Address {
    return this.wallet.account.address;
  }

  sendSwap(intent: SwapIntent, target: VaultTarget): Promise<TxResult> {
    if (target.module === zeroAddress) throw new Error('ViemTxSender.sendSwap: module address is not configured');
    // Deadline from the chain clock, like the simulator: a host clock off by > 5 min would make
    // the router revert (deadline passed) or the module revert (DeadlineTooFar).
    return this.publicClient.getBlock({ blockTag: 'latest' }).then((block) =>
      this.sendRaw({ to: target.module, data: encodeGuardedSwap(intent, swapDeadline(block.timestamp)), gas: SWAP_GAS }),
    );
  }

  sendRaw(call: RawCall): Promise<TxResult> {
    return this.mutex.run(() => this.send(call));
  }

  private async send(call: RawCall): Promise<TxResult> {
    const { account, chain } = this.wallet;
    const pending = await this.publicClient.getTransactionCount({ address: account.address, blockTag: 'pending' });
    const nonce = Math.max(pending, this.nextNonce ?? 0);
    const fees = await this.publicClient.estimateFeesPerGas();
    const signed = await this.wallet.signTransaction({
      account,
      chain,
      to: call.to,
      data: call.data,
      value: 0n,
      gas: call.gas,
      nonce,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
    });
    const hash = keccak256(signed);

    try {
      await this.broadcast(signed, hash);
    } catch (e) {
      // Not in any mempool as far as we know: let the next send re-read the pending count.
      this.nextNonce = undefined;
      throw e;
    }
    this.nextNonce = nonce + 1;
    this.log.log(`sent ${hash} nonce=${nonce} to=${call.to}`);

    let receipt: TransactionReceipt;
    try {
      receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
        timeout: this.opts.receiptTimeoutMs,
        pollingInterval: this.opts.pollingIntervalMs,
      });
    } catch (e) {
      this.nextNonce = undefined;
      throw new Error(`no receipt for ${hash}: ${errMessage(e)}`, { cause: e });
    }

    if (receipt.status === 'success') {
      return { txHash: hash, status: 'success', blockNumber: receipt.blockNumber };
    }
    const revertData = await this.replayRevertData(call, receipt);
    const revertReason = decodeRevert(revertData);
    this.log.warn(`reverted ${hash} reason=${revertReason}`);
    return { txHash: hash, status: 'reverted', blockNumber: receipt.blockNumber, revertReason, revertData };
  }

  /** Sends the signed bytes; retries infra errors with backoff. Same bytes => same hash. */
  private async broadcast(signed: Hex, hash: Hash): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        const got = await this.publicClient.sendRawTransaction({ serializedTransaction: signed });
        if (got.toLowerCase() !== hash.toLowerCase()) throw new Error(`RPC returned ${got}, expected ${hash}`);
        return;
      } catch (e) {
        const msg = errMessage(e);
        // After a timed-out attempt the node may already hold our tx: that is success.
        if (attempt > 1 && ALREADY_SENT.test(msg)) return;
        if (attempt >= this.opts.maxAttempts || !RETRYABLE.test(msg)) throw e;
        this.log.warn(`broadcast ${hash} attempt ${attempt} failed (${msg.slice(0, 120)}), retrying`);
        await sleep(this.opts.retryBaseDelayMs * 2 ** (attempt - 1));
      }
    }
  }

  /**
   * Receipts carry no revert data. Replay the call on the state of the block that mined it to get
   * the custom error. Best effort: if the RPC cannot serve that block we report UNKNOWN_REVERT,
   * the tx hash is still the evidence.
   */
  private async replayRevertData(call: RawCall, receipt: TransactionReceipt): Promise<Hex | undefined> {
    try {
      await this.publicClient.call({
        account: this.wallet.account.address,
        to: call.to,
        data: call.data,
        gas: call.gas,
        blockNumber: receipt.blockNumber,
      });
      return undefined;
    } catch (e) {
      return extractRevertData(e);
    }
  }
}
