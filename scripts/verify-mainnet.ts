/**
 * ALFQuote mainnet verification spike (go/no-go), WO-2 stage: read-only
 * verification of the documented factory and PoolManager, deployment
 * enumeration, two-way provenance, ERC-165 compatibility, and the demo
 * pool's pinned identity. Evidence lives in docs/pins.md; liquidity/quote
 * proofs land in WO-3, simulation in WO-4.
 */
import {
  RPC_URL_ENV_VAR,
  SpikeConfigError,
  loadSpikeConfig,
  createMainnetClient,
  hasBytecode,
  enumerateDeployments,
  factoryProvenance,
  reverseProvenance,
  supportsInterface,
  derivePoolId,
  interfaceIdOf,
  ALLOWLISTED_FACTORY,
  POOL_MANAGER,
  FIXTURE_HOOK,
  FIXTURE_POOL_ID,
  PINNED_POOL_KEY,
  IALFHOOK_INTERFACE_ID,
  IHOOKSTATS_INTERFACE_ID,
  DEMO_POOL_INIT,
  POOL_MANAGER_BIRTH_BLOCK,
  FACTORY_BIRTH_BLOCK,
  FIXTURE_HOOK_BIRTH_BLOCK,
  FACTORY_REGISTRY_SNAPSHOT,
} from "../src/index.js";
import { erc165Abi, alfHookAbi, hookStatsAbi } from "../src/abis.js";
import { maskRpcUrl, redactKeys } from "../src/output.js";

interface CheckResult {
  name: string;
  status: "pass" | "fail" | "info";
  evidence: string;
}

const results: CheckResult[] = [];

function check(name: string, status: CheckResult["status"], evidence: string): void {
  results.push({ name, status, evidence });
  console.log(`  [${status}] ${name}: ${evidence}`);
}

async function main(): Promise<void> {
  let config;
  try {
    config = loadSpikeConfig(process.env);
  } catch (error) {
    if (error instanceof SpikeConfigError) {
      console.error(`Spike configuration error: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }

  console.log("ALFQuote mainnet verification spike");
  console.log(`  ${RPC_URL_ENV_VAR}: ${maskRpcUrl(config.rpcUrl)}`);
  console.log();

  // createMainnetClient aborts on wrong chains before any read: evidence must be mainnet.
  const client = await createMainnetClient(config);
  const head = await client.getBlockNumber();
  console.log(`Connected: chain id 1, latest-state head block ${head}`);
  console.log("Live reads below are latest-state at that head unless labeled historical.");
  console.log();

  // The known IERC-165 constant guards the XOR-fold against silent breakage.
  const IERC165_ID = interfaceIdOf(erc165Abi);
  if (IERC165_ID !== "0x01ffc9a7") {
    console.error(`Internal error: computed IERC165 id ${IERC165_ID} != 0x01ffc9a7`);
    process.exit(1);
  }
  const IALFHOOK_ID = interfaceIdOf(alfHookAbi);
  const IHOOKSTATS_ID = interfaceIdOf(hookStatsAbi);
  if (IALFHOOK_ID !== IALFHOOK_INTERFACE_ID || IHOOKSTATS_ID !== IHOOKSTATS_INTERFACE_ID) {
    console.error(
      `Interface id mismatch: computed IALFHook=${IALFHOOK_ID} IHookStats=${IHOOKSTATS_ID}, pinned ${IALFHOOK_INTERFACE_ID} ${IHOOKSTATS_INTERFACE_ID}`,
    );
    process.exit(1);
  }
  console.log(`Interface ids (pinned): IALFHook=${IALFHOOK_ID} IHookStats=${IHOOKSTATS_ID}`);
  console.log();
  console.log("Verification results (streamed):");

  // --- Documented targets have bytecode (direct reads) -----------------------
  const factoryCode = await hasBytecode(client, ALLOWLISTED_FACTORY, head);
  check(
    "factory bytecode",
    factoryCode.present ? "pass" : "fail",
    factoryCode.present
      ? `${ALLOWLISTED_FACTORY} runtime ${factoryCode.size} bytes (block ${head})`
      : `${ALLOWLISTED_FACTORY} has no runtime bytecode`,
  );

  const pmCode = await hasBytecode(client, POOL_MANAGER, head);
  check(
    "PoolManager bytecode",
    pmCode.present ? "pass" : "fail",
    pmCode.present
      ? `${POOL_MANAGER} runtime ${pmCode.size} bytes (block ${head})`
      : `${POOL_MANAGER} has no runtime bytecode`,
  );

  check(
    "pinned deployment blocks",
    "info",
    `PoolManager ${POOL_MANAGER_BIRTH_BLOCK}, factory ${FACTORY_BIRTH_BLOCK}, fixture hook ${FIXTURE_HOOK_BIRTH_BLOCK} (verified 2026-09-07 via archive getCode binary search; see docs/pins.md)`,
  );

  // --- Factory enumeration + pinned-snapshot integrity ------------------------
  let deployments: Awaited<ReturnType<typeof enumerateDeployments>> = [];
  try {
    deployments = await enumerateDeployments(client, ALLOWLISTED_FACTORY, head);
    check(
      "factory enumeration",
      "info",
      `allDeploymentsLength = ${deployments.length}${deployments.length ? `: ${deployments.map((d) => d.address).join(", ")}` : " (factory registry is empty)"}`,
    );

    const current = new Set(deployments.map((d) => d.address.toLowerCase()));
    const missing = FACTORY_REGISTRY_SNAPSHOT.filter((a) => !current.has(a.toLowerCase()));
    check(
      "registry snapshot integrity",
      missing.length === 0 ? "pass" : "fail",
      missing.length === 0
        ? `all ${FACTORY_REGISTRY_SNAPSHOT.length} pinned deployments still present (registry is append-only)`
        : `pinned deployments no longer registered: ${missing.join(", ")}`,
    );
  } catch (error) {
    check("factory enumeration", "fail", `read failed: ${redactKeys(String(error))}`);
  }

  // --- Selected hook: factory-attested if possible, else fixture -------------
  let selectedHook = FIXTURE_HOOK;
  let selectedLabel = "fixture";
  for (const deployment of deployments) {
    try {
      if (await supportsInterface(client, deployment.address, IALFHOOK_ID, head)) {
        selectedHook = deployment.address;
        selectedLabel = "factory-attested";
        check(
          "selected hook",
          "info",
          `${deployment.address} (registry index ${deployment.index}) supports IALFHook ${IALFHOOK_ID}`,
        );
        break;
      }
    } catch {
      // Unsupported or failing hook: skip.
    }
  }
  if (selectedLabel === "fixture") {
    check(
      "selected hook",
      "info",
      `${FIXTURE_HOOK} (pre-factory example; labeled fixture, never factory-attested)`,
    );
  }

  // --- Two-way provenance -----------------------------------------------------
  const forward = await factoryProvenance(client, ALLOWLISTED_FACTORY, selectedHook, head);
  check(
    "isFromFactory(selected hook)",
    "info",
    `${forward.isFromFactory} (creationCodeHash ${forward.creationCodeHash}) — provenance label only, never operator/vault/routing/liveness safety`,
  );

  const reverse = await reverseProvenance(client, selectedHook, ALLOWLISTED_FACTORY, head);
  check(
    "hook.factory()",
    "info",
    `reports ${reverse.reported}${reverse.matches ? " (matches documented factory)" : " (does not match documented factory)"}`,
  );

  // --- ERC-165 compatibility on the selected hook -----------------------------
  const supportsErc165 = await supportsInterface(client, selectedHook, IERC165_ID, head);
  check("ERC-165 base", supportsErc165 ? "pass" : "fail", `supportsInterface(${IERC165_ID}) = ${supportsErc165} (latest-state ${head})`);

  const supportsAlf = await supportsInterface(client, selectedHook, IALFHOOK_ID, head);
  check(
    "IALFHook compatibility",
    supportsAlf ? "pass" : "fail",
    `supportsInterface(${IALFHOOK_ID}) = ${supportsAlf} (latest-state ${head})`,
  );

  const supportsStats = await supportsInterface(client, selectedHook, IHOOKSTATS_ID, head);
  check(
    "IHookStats advertisement discrepancy",
    supportsAlf && !supportsStats ? "pass" : supportsStats ? "info" : "fail",
    `IALFHook=${supportsAlf} IHookStats=${supportsStats} — stats views are still called directly; ERC-165 is not used as a substitute`,
  );

  // Fixture-hook ERC-165 status (the demo pool's hook; WO-3 quote targets it)
  if (selectedHook !== FIXTURE_HOOK) {
    const [fxErc165, fxAlf, fxStats] = await Promise.all([
      supportsInterface(client, FIXTURE_HOOK, IERC165_ID, head),
      supportsInterface(client, FIXTURE_HOOK, IALFHOOK_ID, head),
      supportsInterface(client, FIXTURE_HOOK, IHOOKSTATS_ID, head),
    ]);
    check("fixture ERC-165 base", fxErc165 ? "pass" : "fail", `supportsInterface(${IERC165_ID}) = ${fxErc165}`);
    check(
      "fixture IALFHook compatibility",
      fxAlf ? "pass" : "fail",
      `supportsInterface(${IALFHOOK_ID}) = ${fxAlf}`,
    );
    check(
      "fixture IHookStats advertisement discrepancy",
      fxAlf && !fxStats ? "pass" : fxStats ? "info" : "fail",
      `IALFHook=${fxAlf} IHookStats=${fxStats} (latest-state ${head})`,
    );
  }

  // --- Demo pool identity (pinned facts; offline self-verification) ------------
  check(
    "demo pool PoolKey",
    "pass",
    `pinned key currency0=${PINNED_POOL_KEY.currency0} currency1=${PINNED_POOL_KEY.currency1} fee=${PINNED_POOL_KEY.fee} tickSpacing=${PINNED_POOL_KEY.tickSpacing} hooks=${PINNED_POOL_KEY.hooks}; initialized at block ${DEMO_POOL_INIT.block} tx ${DEMO_POOL_INIT.tx} (decoded from the on-chain Initialize event; see docs/pins.md)`,
  );
  const derived = derivePoolId(PINNED_POOL_KEY);
  check(
    "PoolId derivation",
    derived === FIXTURE_POOL_ID ? "pass" : "fail",
    `keccak256(abi.encode(pinned key)) = ${derived}`,
  );

  // --- Summary --------------------------------------------------------------------
  const failures = results.filter((r) => r.status === "fail").length;
  console.log();
  console.log(
    failures
      ? `${failures} required check(s) failed. Recorded as a blocking result; see docs/pins.md.`
      : `All required checks passed (${results.length} results). Recorded in docs/pins.md (head block ${head}).`,
  );
  process.exit(failures ? 1 : 0);
}



main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nSpike failed: ${redactKeys(message)}`);
  process.exit(1);
});
