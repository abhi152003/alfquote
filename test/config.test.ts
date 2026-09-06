import { describe, expect, it } from "vitest";
import { RPC_URL_ENV_VAR, SpikeConfigError, loadSpikeConfig } from "../src/index.js";

describe("loadSpikeConfig", () => {
  it("fails closed when the RPC URL variable is missing", () => {
    expect(() => loadSpikeConfig({})).toThrow(SpikeConfigError);
    expect(() => loadSpikeConfig({})).toThrow(RPC_URL_ENV_VAR);
    expect(() => loadSpikeConfig({})).toThrow(/\.env\.example/);
  });

  it("fails closed when the RPC URL variable is empty or whitespace", () => {
    expect(() => loadSpikeConfig({ [RPC_URL_ENV_VAR]: "" })).toThrow(SpikeConfigError);
    expect(() => loadSpikeConfig({ [RPC_URL_ENV_VAR]: "   " })).toThrow(SpikeConfigError);
  });

  it("rejects values that are not parseable URLs", () => {
    expect(() => loadSpikeConfig({ [RPC_URL_ENV_VAR]: "not-a-url" })).toThrow(SpikeConfigError);
    expect(() => loadSpikeConfig({ [RPC_URL_ENV_VAR]: "not-a-url" })).toThrow(
      /not a valid URL/,
    );
  });

  it("rejects unsupported protocols and lists the accepted ones", () => {
    expect(() => loadSpikeConfig({ [RPC_URL_ENV_VAR]: "ftp://example.invalid" })).toThrow(
      SpikeConfigError,
    );
    expect(() => loadSpikeConfig({ [RPC_URL_ENV_VAR]: "ftp://example.invalid" })).toThrow(
      /http, https, ws, or wss/,
    );
  });

  it("accepts https and wss endpoints and passes the URL through", () => {
    const httpsUrl = "https://eth-mainnet.g.alchemy.com/v2/some-key";
    expect(loadSpikeConfig({ [RPC_URL_ENV_VAR]: httpsUrl })).toEqual({
      rpcUrl: httpsUrl,
      chainId: 1,
    });

    const wssUrl = "wss://eth-mainnet.g.alchemy.com/v2/some-key";
    expect(loadSpikeConfig({ [RPC_URL_ENV_VAR]: wssUrl })).toEqual({
      rpcUrl: wssUrl,
      chainId: 1,
    });
  });

  it("trims surrounding whitespace before validating", () => {
    const config = loadSpikeConfig({ [RPC_URL_ENV_VAR]: "  https://rpc.example.invalid  " });
    expect(config.rpcUrl).toBe("https://rpc.example.invalid");
  });
});
