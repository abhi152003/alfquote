import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadTenderlyConfig, TENDERLY_CHAIN_ID_ENV_VAR } from "../config.js";
import { connectTenderlyAdmin, TenderlyAdminError, type RpcRequest } from "../adminClient.js";

const VALID: Record<string, string> = {
  TENDERLY_PUBLIC_RPC_URL: "https://virtual.mainnet.rpc.tenderly.co/pub-abc123",
  TENDERLY_ADMIN_RPC_URL: "https://virtual.mainnet.rpc.tenderly.co/adm-xyz789",
  TENDERLY_FORK_BLOCK: "25926196",
  [TENDERLY_CHAIN_ID_ENV_VAR]: "73571",
  ALFQUOTE_TENDERLY_FROM: "0x1234567890abcdef1234567890abcdef12345678",
};

/** Mainnet-path source files: the product packages and the read-only evidence scripts. */
function mainnetPathFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => !file.includes("node_modules") && !file.includes("/dist/"));
}

const MAINNET_TREES = [
  join(process.cwd(), "packages", "alfquote", "src"),
  join(process.cwd(), "packages", "cli", "src"),
  join(process.cwd(), "scripts", "phase1"),
  join(process.cwd(), "scripts", "lib"),
];

describe("mainnet read-only boundary", () => {
  it("mainnet-path files never reference Tenderly, so mutation helpers are unreachable there", () => {
    const files = MAINNET_TREES.flatMap((tree) => mainnetPathFiles(tree));
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((file) => /tenderly/i.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the public library barrel does not reference the controlled-fork subtree", () => {
    const index = readFileSync(join(process.cwd(), "packages", "alfquote", "src", "index.ts"), "utf8");
    expect(/tenderly/i.test(index)).toBe(false);
  });
});

describe("connectTenderlyAdmin", () => {
  it("fails closed when the endpoint is not a Tenderly Virtual Environment", async () => {
    const notTenderly: RpcRequest = async (method) => {
      if (method === "evm_getLatest") throw new Error("method not found");
      throw new Error("unexpected call");
    };
    await expect(connectTenderlyAdmin(loadTenderlyConfig(VALID), notTenderly)).rejects.toThrow(
      TenderlyAdminError,
    );
  });

  it("fails closed on chain-id mismatch between admin endpoint and config", async () => {
    const wrongChain: RpcRequest = async (method) => {
      if (method === "evm_getLatest") return { number: "0x1" };
      if (method === "eth_chainId") return "0x1";
      throw new Error(`unexpected ${method}`);
    };
    await expect(connectTenderlyAdmin(loadTenderlyConfig(VALID), wrongChain)).rejects.toThrow(
      /chain id 1 does not match/,
    );
  });

  it("after verification, cheatcode and unsigned-send calls carry documented params", async () => {
    const calls: Array<{ method: string; params?: readonly unknown[] }> = [];
    const request: RpcRequest = async (method, params) => {
      calls.push({ method, params });
      if (method === "evm_getLatest") return { number: "0x18bb0e7", hash: "0xabc" };
      if (method === "eth_chainId") return "0x11f63"; // 73571
      if (method === "eth_sendTransaction") return "0x" + "ab".repeat(32);
      return "0x" + "cd".repeat(32);
    };
    const config = loadTenderlyConfig(VALID);
    const admin = await connectTenderlyAdmin(config, request);

    await admin.setBalance(config.from, 10n ** 18n);
    await admin.addErc20Balance("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", config.from, 5n);
    await admin.sendUnsignedTransaction({
      from: config.from,
      to: "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af",
      data: "0x12345678",
    });

    expect(calls.map((call) => call.method)).toEqual([
      "evm_getLatest",
      "eth_chainId",
      "tenderly_setBalance",
      "tenderly_addErc20Balance",
      "eth_sendTransaction",
    ]);
    expect(calls[2]?.params).toEqual([[config.from], "0xde0b6b3a7640000"]);
    expect(calls[4]?.params).toEqual([
      {
        from: config.from,
        to: "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af",
        data: "0x12345678",
      },
    ]);
  });
});
