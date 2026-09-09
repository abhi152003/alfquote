/** Config tests: RPC/chain validation with masked errors only. */
import { describe, expect, it } from "vitest";
import { CliConfigError, RPC_URL_ENV_VAR, loadCliConfig } from "../src/config.js";

describe("loadCliConfig", () => {
  it("resolves the RPC url from --rpc over the environment", () => {
    expect(loadCliConfig({ [RPC_URL_ENV_VAR]: "https://env.example/x" }, { rpc: "https://flag.example/y", chain: 1 })).toEqual({
      rpcUrl: "https://flag.example/y",
      chainId: 1,
    });
    expect(loadCliConfig({ [RPC_URL_ENV_VAR]: "https://env.example/x" }, { chain: 1 }).rpcUrl).toBe("https://env.example/x");
  });

  it("fails closed on a missing endpoint", () => {
    expect(() => loadCliConfig({}, { chain: 1 })).toThrow(/missing RPC endpoint/);
  });

  it("rejects non-http(s)/ws(s) schemes with the URL masked", () => {
    try {
      loadCliConfig({}, { rpc: "ftp://user:secret@host/v2/KEY12345678", chain: 1 });
      throw new Error("expected CliConfigError");
    } catch (error) {
      expect(error).toBeInstanceOf(CliConfigError);
      const message = (error as CliConfigError).message;
      expect(message).not.toContain("secret");
      expect(message).not.toContain("KEY12345678");
    }
  });

  it("masks unparseable URLs without echoing them", () => {
    try {
      loadCliConfig({}, { rpc: "not a url at all", chain: 1 });
      throw new Error("expected CliConfigError");
    } catch (error) {
      expect((error as CliConfigError).message).not.toContain("not a url");
    }
  });

  it("rejects non-mainnet chains for Phase 2", () => {
    expect(() => loadCliConfig({}, { rpc: "https://rpc.example", chain: 137 })).toThrow(/--chain must be 1/);
  });
});
