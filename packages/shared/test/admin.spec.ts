import { describe, expect, it } from 'vitest';
import { RebalancerStatusDto, UpdateRebalancerRequest } from '../src';

describe('admin schemas (api.md #15, #16)', () => {
  it('parses the rebalancer status', () => {
    const s = {
      paused: true,
      intervalMs: 15000,
      lastTickAt: null,
      agent: { address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', avaxBalance: '5000000000000000000', lowGas: false },
    };
    // Fields added later (lastTick, agent.swapsLeft) default to null, so an older server still parses.
    expect(RebalancerStatusDto.parse(s)).toEqual({ ...s, lastTick: null, agent: { ...s.agent, swapsLeft: null } });
  });

  it('PATCH takes exactly { paused }', () => {
    expect(UpdateRebalancerRequest.safeParse({ paused: false }).success).toBe(true);
    expect(UpdateRebalancerRequest.safeParse({ paused: 'no' }).success).toBe(false);
    expect(UpdateRebalancerRequest.safeParse({ paused: true, intervalMs: 1 }).success).toBe(false);
  });
});
