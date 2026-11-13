import { Inject, Injectable } from '@nestjs/common';
import { BaseError, ContractFunctionRevertedError, type Address, type PublicClient } from 'viem';
import { ROUTER_ABI } from '../../core/chain/abis';
import { PUBLIC_CLIENT } from '../../core/chain/chain.module';

/** Router quotes for pricing (D8). Reads only. The router address comes from policy(), never from a client. */
@Injectable()
export class RouterQuoteService {
  constructor(@Inject(PUBLIC_CLIENT) private readonly client: PublicClient) {}

  /**
   * getAmountsOut(amountIn, [tokenIn, tokenOut]) on the router the module will swap through.
   * A router revert (no pool, no liquidity) quotes 0; an RPC failure throws.
   */
  async amountOut(router: Address, tokenIn: Address, tokenOut: Address, amountIn: bigint): Promise<bigint> {
    try {
      const amounts = await this.client.readContract({
        address: router,
        abi: ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [amountIn, [tokenIn, tokenOut]],
      });
      return amounts.at(-1) ?? 0n;
    } catch (e) {
      const reverted = e instanceof BaseError && e.walk((x) => x instanceof ContractFunctionRevertedError);
      if (reverted) return 0n;
      throw e;
    }
  }
}
