import { agentPolicyModuleAbi } from "@agentshield/shared";
import { ContractFunctionExecutionError, ContractFunctionRevertedError, encodeErrorResult } from "viem";
import { describe, expect, it } from "vitest";
import { ChainRevert, revertReason } from "./moduleChain";

const reverted = (errorName: "NotOwner" | "InvalidPolicy") =>
  new ContractFunctionExecutionError(
    new ContractFunctionRevertedError({ abi: agentPolicyModuleAbi, functionName: "revoke", data: encodeErrorResult({ abi: agentPolicyModuleAbi, errorName }) }),
    { abi: agentPolicyModuleAbi, functionName: "revoke", contractAddress: "0x6666666666666666666666666666666666666666" },
  );

describe("revertReason", () => {
  it("reads the module's custom error name out of a viem revert", () => {
    expect(revertReason(reverted("NotOwner"))).toBe("NotOwner");
    expect(revertReason(reverted("InvalidPolicy"))).toBe("InvalidPolicy");
  });
  it("returns null for anything that is not a revert (RPC down, user rejection)", () => {
    expect(revertReason(new Error("fetch failed"))).toBeNull();
    expect(revertReason(null)).toBeNull();
  });
  it("ChainRevert carries the code the UI maps to copy", () => {
    expect(new ChainRevert("NotOwner").reason).toBe("NotOwner");
  });
});
