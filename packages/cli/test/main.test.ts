import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CLI_VERSION, PLANNED_COMMANDS, cliPlaceholderInfo } from "../src/main.js";

describe("alfquote CLI placeholder", () => {
  it("reports the planned Phase 2 command surface without implementing it", () => {
    const info = cliPlaceholderInfo();
    expect(info.version).toBe(CLI_VERSION);
    expect(info.plannedCommands).toEqual(["discover", "assess", "quote", "swap"]);
    expect(info.resultSchemaVersion).toBeGreaterThanOrEqual(1);
  });

  it("depends on the library through the workspace and ships a bin", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      name: string;
      bin: Record<string, string>;
      dependencies: Record<string, string>;
    };
    expect(pkg.name).toBe("@alfquote/cli");
    expect(pkg.dependencies["alfquote"]).toBeDefined();
    expect(pkg.bin["alfquote"]).toBe("dist/main.js");
  });

  it("keeps the planned commands in the documented order", () => {
    expect(PLANNED_COMMANDS).toEqual(["discover", "assess", "quote", "swap"]);
  });
});
