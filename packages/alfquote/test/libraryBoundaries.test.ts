import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HOOK_ASSESSMENT_KEYS } from "../src/index.js";

function librarySources(): string[] {
  const root = join(process.cwd(), "packages", "alfquote", "src");
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(entry.parentPath, entry.name));
}

describe("library package boundaries", () => {
  it("library source never touches the interface layer (env, argv, console, exit, stdout)", () => {
    const offenders = librarySources().filter((file) =>
      /process\.|console\./.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("library source imports no node builtins and uses no require", () => {
    const offenders = librarySources().filter((file) =>
      /from ['"]node:|require\(/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("library source has no signers, wallet clients, broadcasts, or state overrides", () => {
    const offenders = librarySources().filter((file) =>
      /createWalletClient|privateKeyToAccount|mnemonicToAccount|hdKeyToAccount|generatePrivateKey|signTypedData|signMessage|signTransaction|walletClient|writeContract|sendTransaction|sendRawTransaction|eth_sendRawTransaction|eth_sendTransaction|sendCalls|stateOverride|stateDiff/.test(
        readFileSync(file, "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("library source never references the controlled-fork provider", () => {
    const offenders = librarySources().filter((file) => /tenderly/i.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("assessment surface stays four independent dimensions with no combined verdict", () => {
    expect([...HOOK_ASSESSMENT_KEYS]).toEqual([
      "compatibility",
      "provenance",
      "routing",
      "upgradeability",
    ]);
  });
});
