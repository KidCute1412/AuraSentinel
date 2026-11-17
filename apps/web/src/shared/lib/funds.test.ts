import { decodeFunctionData, erc20Abi, size, slice, zeroAddress } from "viem";
import { describe, expect, it } from "vitest";
import { approvedHashSignature, faucetAvailableAt, fundsBlocker, withdrawArgs } from "./funds";

const OWNER = "0x12E341ef08aBDeF1f94A20fF38FA4Ee2Ef608199";
const USDC = "0x99b583DC1f12668e1274261B952acD9398f3835F";

describe("approvedHashSignature", () => {
  it("is r = owner, s = 0, v = 1 (65 bytes)", () => {
    const sig = approvedHashSignature(OWNER);
    expect(size(sig)).toBe(65);
    expect(slice(sig, 12, 32).toLowerCase()).toBe(OWNER.toLowerCase());
    expect(slice(sig, 32, 64)).toBe(`0x${"00".repeat(32)}`);
    expect(slice(sig, 64)).toBe("0x01");
  });
});

describe("withdrawArgs", () => {
  it("is a plain CALL of token.transfer(owner, amount) with no gas refund, signed by the owner", () => {
    const [to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures] = withdrawArgs(USDC, OWNER, 25_000_000n);
    expect(to).toBe(USDC);
    expect(value).toBe(0n);
    expect(operation).toBe(0); // never DELEGATECALL
    expect([safeTxGas, baseGas, gasPrice]).toEqual([0n, 0n, 0n]);
    expect([gasToken, refundReceiver]).toEqual([zeroAddress, zeroAddress]);
    expect(decodeFunctionData({ abi: erc20Abi, data })).toEqual({ functionName: "transfer", args: [OWNER, 25_000_000n] });
    expect(signatures).toBe(approvedHashSignature(OWNER));
  });

  it("refuses zero or negative amounts", () => {
    expect(() => withdrawArgs(USDC, OWNER, 0n)).toThrow();
  });
});

describe("faucetAvailableAt", () => {
  it("first drip is free; afterwards waits out the cooldown", () => {
    expect(faucetAvailableAt(0n, 3_600n, 1_000)).toBe(0);
    expect(faucetAvailableAt(1_000n, 3_600n, 2_000)).toBe(4_600);
    expect(faucetAvailableAt(1_000n, 3_600n, 4_600)).toBe(0);
  });
});

describe("fundsBlocker", () => {
  it("lets a 1-of-1 owner act and explains every other case in English", () => {
    expect(fundsBlocker(OWNER, [OWNER], 1n)).toBeNull();
    expect(fundsBlocker(OWNER.toLowerCase() as `0x${string}`, [OWNER], 1n)).toBeNull();
    expect(fundsBlocker(null, [OWNER], 1n)).toMatch(/Connect the owner wallet/);
    expect(fundsBlocker("0x0000000000000000000000000000000000000bad", [OWNER], 1n)).toMatch(/Only an owner/);
    expect(fundsBlocker(OWNER, [OWNER], 2n)).toMatch(/2 owner signatures/);
    expect(fundsBlocker(OWNER, null, null)).toBeNull(); // still loading: say nothing yet
  });
});
