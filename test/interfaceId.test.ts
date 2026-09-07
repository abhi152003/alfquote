import { describe, expect, it } from "vitest";
import type { Abi } from "viem";
import { interfaceIdOf } from "../src/interfaceId.js";
import { IALFHOOK_INTERFACE_ID, IHOOKSTATS_INTERFACE_ID } from "../src/addresses.js";
import erc165Json from "../src/abi/IERC165.json" with { type: "json" };
import alfHookJson from "../src/abi/IALFHook.json" with { type: "json" };
import hookStatsJson from "../src/abi/IHookStats.json" with { type: "json" };
import factoryJson from "../src/abi/IAllowlistedFactory.json" with { type: "json" };
import hookViewsJson from "../src/abi/DualPoolHookViews.json" with { type: "json" };
import poolManagerJson from "../src/abi/IPoolManager.json" with { type: "json" };

const asAbi = (json: unknown) => json as Abi;

describe("interfaceIdOf", () => {
  it("reproduces the standard ERC-165 interface id as a known-answer test", () => {
    // Published ERC-165 constant; validates the XOR-fold method itself.
    expect(interfaceIdOf(asAbi(erc165Json))).toBe("0x01ffc9a7");
  });

  it("pins IALFHook and IHookStats interface ids", () => {
    expect(interfaceIdOf(asAbi(alfHookJson))).toBe(IALFHOOK_INTERFACE_ID);
    expect(interfaceIdOf(asAbi(hookStatsJson))).toBe(IHOOKSTATS_INTERFACE_ID);
    expect(IALFHOOK_INTERFACE_ID).toBe("0x7adbfbb8");
    expect(IHOOKSTATS_INTERFACE_ID).toBe("0x601b90d3");
  });
});

describe("pinned ABIs expose the required surface", () => {
  const names = (abi: Abi) =>
    abi.flatMap((item) => (item.type === "function" || item.type === "event" ? [item.name] : []));

  it("IALFHook has the four own functions", () => {
    expect(names(asAbi(alfHookJson))).toEqual(
      expect.arrayContaining(["getIndicativeQuote", "isLive", "maxGas", "swapToPrice"]),
    );
  });

  it("IHookStats has the reserve views", () => {
    expect(names(asAbi(hookStatsJson))).toEqual(
      expect.arrayContaining(["getReserves", "getEffectiveLiquidity"]),
    );
  });

  it("IAllowlistedFactory has discovery surface + Deployed event", () => {
    expect(names(asAbi(factoryJson))).toEqual(
      expect.arrayContaining([
        "Deployed",
        "allDeployments",
        "allDeploymentsLength",
        "isFromFactory",
        "creationCodeHashOf",
      ]),
    );
  });

  it("DualPoolHookViews has factory() and livePools()", () => {
    expect(names(asAbi(hookViewsJson))).toEqual(
      expect.arrayContaining(["factory", "livePools"]),
    );
  });

  it("IPoolManager has the Initialize event and extsload", () => {
    expect(names(asAbi(poolManagerJson))).toEqual(["Initialize", "extsload"]);
  });
});
