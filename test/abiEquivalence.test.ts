import { describe, expect, it } from "vitest";
import { toFunctionSelector, toEventSelector } from "viem";
import type { Abi } from "viem";
import {
  erc165Abi,
  hookStatsAbi,
  alfHookAbi,
  factoryAbi,
  dualPoolHookViewsAbi,
  poolManagerAbi,
  erc20MetadataAbi,
} from "../src/abis.js";
import erc165Json from "../src/abi/IERC165.json" with { type: "json" };
import hookStatsJson from "../src/abi/IHookStats.json" with { type: "json" };
import alfHookJson from "../src/abi/IALFHook.json" with { type: "json" };
import factoryJson from "../src/abi/IAllowlistedFactory.json" with { type: "json" };
import hookViewsJson from "../src/abi/DualPoolHookViews.json" with { type: "json" };
import poolManagerJson from "../src/abi/IPoolManager.json" with { type: "json" };
import erc20Json from "../src/abi/IERC20Metadata.json" with { type: "json" };

/**
 * The JSON files are the canonical ABI pins; src/abis.ts is the typed runtime
 * view. This suite fails if the two forms drift apart, because a signature
 * change alters its selector.
 */
const pairs: Array<[name: string, typed: Abi, json: unknown]> = [
  ["IERC165", erc165Abi, erc165Json],
  ["IHookStats", hookStatsAbi, hookStatsJson],
  ["IALFHook", alfHookAbi, alfHookJson],
  ["IAllowlistedFactory", factoryAbi, factoryJson],
  ["DualPoolHookViews", dualPoolHookViewsAbi, hookViewsJson],
  ["IPoolManager", poolManagerAbi, poolManagerJson],
  ["IERC20Metadata", erc20MetadataAbi, erc20Json],
];

describe("JSON pins match the typed runtime ABIs", () => {
  for (const [name, typed, json] of pairs) {
    it(`${name}: every function and event selector is identical`, () => {
      const typedFunctions = new Map(
        typed
          .filter((e) => e.type === "function")
          .map((e) => [e.name, toFunctionSelector(e as never)]),
      );
      const jsonFunctions = new Map(
        (json as Abi)
          .filter((e) => e.type === "function")
          .map((e) => [e.name, toFunctionSelector(e as never)]),
      );
      expect([...jsonFunctions.keys()].sort()).toEqual([...typedFunctions.keys()].sort());
      for (const [fn, selector] of typedFunctions) {
        expect(jsonFunctions.get(fn)).toBe(selector);
      }

      const typedEvents = new Map(
        typed.filter((e) => e.type === "event").map((e) => [e.name, toEventSelector(e as never)]),
      );
      const jsonEvents = new Map(
        (json as Abi)
          .filter((e) => e.type === "event")
          .map((e) => [e.name, toEventSelector(e as never)]),
      );
      expect([...jsonEvents.keys()].sort()).toEqual([...typedEvents.keys()].sort());
      for (const [ev, topic0] of typedEvents) {
        expect(jsonEvents.get(ev)).toBe(topic0);
      }
    });
  }
});
