/** Output rendering: canonical JSON (no ANSI, no logs) and sectioned human text. */

import { redactRpcSecrets, toJsonValue } from "alfquote";
import type { CommandResult } from "alfquote";

/**
 * Canonical JSON: exactly the versioned envelope, nothing else on stdout.
 * Every string passes one final redaction pass so no credential-bearing URL
 * can reach JSON output even if a future envelope path forgets to sanitize.
 */
export function renderJson(result: CommandResult<unknown, object>, extraUrls: readonly string[] = []): string {
  // unbounded: payload strings (e.g. exact calldata) must never be truncated
  const redactStrings = (_key: string, value: unknown): unknown =>
    typeof value === "string" ? redactRpcSecrets(value, extraUrls, Number.MAX_SAFE_INTEGER) : value;
  return JSON.stringify(toJsonValue(result), redactStrings, 2);
}

function fmt(value: unknown): string {
  if (typeof value === "bigint") return value.toString(10);
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return String(value);
  }
  return JSON.stringify(toJsonValue(value));
}

function lines(title: string, entries: readonly string[]): string[] {
  if (entries.length === 0) return [];
  return [`${title}:`, ...entries.map((entry) => `  - ${entry}`)];
}

/** Per-command summary lines for human output (presentation of library data only). */
function summarize(result: CommandResult<unknown, object>): string[] {
  if (result.status !== "ok") return [];
  const data = result.data as Record<string, unknown>;
  switch (result.command) {
    case "discover": {
      const hooks = (data["hooks"] ?? []) as Array<Record<string, unknown>>;
      const pools = (data["pools"] ?? []) as Array<Record<string, unknown>>;
      const out = lines(
        "hooks",
        hooks.map((hook) => `${fmt(hook["address"])} → ${fmt(hook["provenance"])} (registry index ${fmt(hook["registryIndex"])})`),
      );
      if (pools.length > 0) {
        out.push(
          ...lines(
            "pools",
            pools.map((pool) => `${fmt(pool["poolId"]).slice(0, 18)}… match=${fmt(pool["poolKeyMatches"])} at block ${fmt(pool["block"])}`),
          ),
        );
      }
      const failures = (data["partialFailures"] ?? []) as Array<Record<string, unknown>>;
      out.push(...lines("failed targets", failures.map((failure) => `${fmt(failure["target"])}: ${fmt(failure["code"])} — ${fmt(failure["message"])}`)));
      return out;
    }
    case "assess": {
      const assessment = data as Record<string, { status: string; evidence: Array<{ observed: string }> }>;
      const out: string[] = ["assessment (independent dimensions — no combined verdict):"];
      for (const [dimension, field] of Object.entries(assessment)) {
        out.push(`  - ${dimension}: ${field.status}`);
        for (const entry of field.evidence) out.push(`      ${entry.observed}`);
      }
      return out;
    }
    case "quote": {
      const out = [
        `quote: ${fmt(data["amountInUnits"])} ${fmt((data["inputToken"] as Record<string, unknown>)["symbol"])} → ${fmt(data["outputAmountUnits"])} ${fmt((data["outputToken"] as Record<string, unknown>)["symbol"])} (raw ${fmt(data["outputAmountRaw"])})`,
        `gas bound (maxGas): ${fmt(data["gasCap"])}`,
      ];
      const liquidity = data["liquidity"] as Record<string, unknown>;
      out.push(
        `liquidity: vanilla=${fmt(liquidity["vanillaPoolManager"])} reserves=${fmt(liquidity["reserves"])} effective=${fmt(liquidity["effectiveLiquidity"])} (size fills from effective)`,
      );
      return out;
    }
    case "swap": {
      const plan = data["plan"] as Record<string, unknown>;
      const calldata = fmt(plan["calldata"]);
      const out = [
        `plan: amountIn=${fmt(plan["amountIn"])} amountOutMinimum=${fmt(plan["amountOutMinimum"])} slippage=${fmt(plan["slippageBps"])} bps`,
        `calldata: ${calldata.slice(0, 66)}… (${(calldata.length - 2) / 2} bytes)`,
        `simulation at block ${fmt(data["stateBlockUsed"])}: ${data["gas"] !== undefined ? `gas ${fmt(data["gas"])}` : "REVERTED"}`,
      ];
      const revert = data["revert"] as { name: string; shortMessage: string } | undefined;
      if (revert !== undefined) out.push(`  revert: ${revert.name} — ${revert.shortMessage}`);
      out.push(...lines("blockers (fix these; they are never bypassed)", (data["allowanceIssues"] ?? []) as string[]));
      return out;
    }
  }
}

/** Human output with clearly separated status, evidence, warnings, blockers, and caveats. */
export function renderHuman(result: CommandResult<unknown, object>, extraUrls: readonly string[] = []): string {
  const chain = result.chain;
  const block = chain.blockNumber === null ? "latest" : `block ${chain.blockNumber}`;
  const out: string[] = [
    `alfquote ${result.command}: ${result.status.toUpperCase()} (chain ${chain.chainId}, ${chain.blockSource}, ${block})`,
  ];

  if (result.status === "ok") {
    out.push(...summarize(result));
  } else if (result.status === "skip") {
    out.push(`skipped: ${result.skipped.code} — ${result.skipped.message}`);
  } else {
    out.push(`error: ${result.error.code} — ${result.error.message}`);
  }

  if (result.warnings.length > 0) {
    out.push(...lines("warnings", result.warnings.map((warning) => `${warning.code}: ${warning.message}`)));
  }
  if (result.status === "skip") {
    out.push("caveat: a skip is not a price; do not route from skipped results.");
  }
  if (result.command === "swap") {
    out.push("caveat: dry-run only — simulation at the state block above is not an execution guarantee.");
  }
  if (result.command === "quote" && result.status === "ok") {
    out.push("caveat: indicative quotes are non-binding and can diverge at larger sizes.");
  }
  return out.map((line) => redactRpcSecrets(line, extraUrls, Number.MAX_SAFE_INTEGER)).join("\n");
}
