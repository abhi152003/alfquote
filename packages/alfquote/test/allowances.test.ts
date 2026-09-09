import { describe, expect, it } from "vitest";
import { allowanceBlockers, type AllowanceSnapshot } from "../src/allowances.js";
import { USDC } from "../src/addresses.js";

const base: AllowanceSnapshot = {
  token: USDC,
  sender: "0x0000000000000000000000000000000000000001",
  balance: 100n,
  erc20ToPermit2: 100n,
  permit2ToRouter: { amount: 100n, expiration: 2_000_000_000n, nonce: 0n },
};

describe("allowanceBlockers", () => {
  it("returns no blockers when funded and approved", () => {
    expect(allowanceBlockers(base, 100n, 1_700_000_000n)).toEqual([]);
  });

  it("flags low balance", () => {
    expect(allowanceBlockers({ ...base, balance: 1n }, 100n, 1n)[0]).toMatch(/balance/);
    expect(allowanceBlockers({ ...base, balance: 1n }, 100n, 1n)[0]).toContain(USDC);
  });

  it("labels the balance blocker with the actual token, not a hardcoded symbol", () => {
    const wsteth = "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0" as typeof USDC;
    const blockers = allowanceBlockers({ ...base, token: wsteth, balance: 1n }, 100n, 1n);
    expect(blockers[0]).toContain(wsteth);
    expect(blockers[0]).not.toContain("USDC");
  });

  it("flags ERC-20 to Permit2", () => {
    expect(allowanceBlockers({ ...base, erc20ToPermit2: 0n }, 100n, 1n)[0]).toMatch(/Permit2/);
  });

  it("flags Permit2 amount and expiration 0", () => {
    const blockers = allowanceBlockers(
      { ...base, permit2ToRouter: { amount: 0n, expiration: 0n, nonce: 0n } },
      100n,
      1n,
    );
    expect(blockers.some((b) => b.includes("Permit2 allowance to Universal Router"))).toBe(true);
    expect(blockers.some((b) => b.includes("expired"))).toBe(true);
  });
});
