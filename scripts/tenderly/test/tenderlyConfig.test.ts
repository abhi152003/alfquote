import { describe, expect, it } from "vitest";
import {
  ALFQUOTE_TENDERLY_FROM_ENV_VAR,
  TENDERLY_ADMIN_RPC_URL_ENV_VAR,
  TENDERLY_CHAIN_ID_ENV_VAR,
  TENDERLY_FORK_BLOCK_ENV_VAR,
  TENDERLY_PUBLIC_RPC_URL_ENV_VAR,
  TenderlyConfigError,
  loadTenderlyConfig,
  maskTenderlyUrl,
  sameHost,
} from "../config.js";

const VALID: Record<string, string> = {
  [TENDERLY_PUBLIC_RPC_URL_ENV_VAR]: "https://virtual.mainnet.rpc.tenderly.co/pub-abc123",
  [TENDERLY_ADMIN_RPC_URL_ENV_VAR]: "https://virtual.mainnet.rpc.tenderly.co/adm-xyz789",
  [TENDERLY_FORK_BLOCK_ENV_VAR]: "25926196",
  [TENDERLY_CHAIN_ID_ENV_VAR]: "73571",
  [ALFQUOTE_TENDERLY_FROM_ENV_VAR]: "0x1234567890abcdef1234567890abcdef12345678",
};

describe("loadTenderlyConfig", () => {
  it("parses a valid environment", () => {
    const config = loadTenderlyConfig(VALID);
    expect(config.forkBlock).toBe(25926196n);
    expect(config.chainId).toBe(73571);
    expect(config.from).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it("fails closed naming each missing variable", () => {
    for (const key of Object.keys(VALID)) {
      const env = { ...VALID };
      delete env[key];
      expect(() => loadTenderlyConfig(env), key).toThrow(TenderlyConfigError);
      expect(() => loadTenderlyConfig(env), key).toThrow(new RegExp(key));
    }
  });

  it("rejects chain id 1 so the fork is never confusable with mainnet", () => {
    expect(() => loadTenderlyConfig({ ...VALID, [TENDERLY_CHAIN_ID_ENV_VAR]: "1" })).toThrow(
      /must not be 1/,
    );
  });

  it("rejects non-http(s) endpoints, bad blocks, and bad addresses", () => {
    expect(() =>
      loadTenderlyConfig({ ...VALID, [TENDERLY_PUBLIC_RPC_URL_ENV_VAR]: "ftp://example.invalid/x" }),
    ).toThrow(TenderlyConfigError);
    expect(() => loadTenderlyConfig({ ...VALID, [TENDERLY_FORK_BLOCK_ENV_VAR]: "latest" })).toThrow(
      TenderlyConfigError,
    );
    expect(() =>
      loadTenderlyConfig({ ...VALID, [ALFQUOTE_TENDERLY_FROM_ENV_VAR]: "0xdeadbeef" }),
    ).toThrow(TenderlyConfigError);
  });

  it("never embeds a raw endpoint URL in an error message", () => {
    const secretUrl = "virtual.mainnet.eu.rpc.tenderly.co/rpc-admin/A1b2C3d4E5f6G7h8I9j0";
    const cases: Record<string, string> = {
      [TENDERLY_ADMIN_RPC_URL_ENV_VAR]: secretUrl, // unparseable: no scheme — the common paste error
      [TENDERLY_PUBLIC_RPC_URL_ENV_VAR]: `http://${secretUrl}`, // wrong protocol prints masked form
    };
    for (const [key, value] of Object.entries(cases)) {
      let message = "";
      try {
        loadTenderlyConfig({ ...VALID, [key]: value });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).not.toContain(secretUrl);
      expect(message).not.toContain("A1b2C3d4E5f6G7h8I9j0");
    }
  });
});

describe("endpoint masking", () => {
  it("keeps only scheme and host; the path can carry an access key", () => {
    expect(maskTenderlyUrl("https://virtual.mainnet.rpc.tenderly.co/pub-abc123")).toBe(
      "https://virtual.mainnet.rpc.tenderly.co/***",
    );
    expect(maskTenderlyUrl("not a url")).toBe("<unparseable>");
  });

  it("detects shared hosts", () => {
    expect(sameHost("https://a.example/x", "https://a.example/y")).toBe(true);
    expect(sameHost("https://a.example/x", "https://b.example/x")).toBe(false);
  });
});
