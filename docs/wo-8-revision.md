# WO-8 verification revision

## Why origin block hashes are recorded but not compared

Tenderly Virtual Environments re-seal forked blocks on a different chain ID and with their own block timestamps. The fork block header therefore has a different hash from the Ethereum mainnet block even when the forked state is correct. Literal block-hash equality is not a satisfiable origin invariant for this environment.

WO-8 formally replaces the original block-hash-equality criterion with a state fingerprint at the configured origin block:

- bytecode equality for PoolManager, the DualPool fixture hook, Universal Router v2, Permit2, USDC, and USDT;
- equality of six consecutive `pools[poolId]` storage words, including non-zero slot0;
- independently derived PoolId equality;
- distinct mainnet and Tenderly RPC hosts;
- fork head at or above the configured origin block.

Both fork and mainnet origin block hashes remain recorded as identifiers. They are not presented as equal.

## Why reserves and effective-liquidity views are informational

DualPool reserves and effective-liquidity views derive values from vault shares and block timestamps. Tenderly re-sealed blocks use their own timestamps, so these computed views can differ by dust even when bytecode and storage are identical. The release artifact records both snapshots for transparency, but origin verification relies on storage equality instead.

## Fresh-run evidence rule

A release artifact is valid only when one run contains:

- successful native and ERC-20 funding identifiers;
- successful normal USDC and Permit2 approval transactions with read-backs;
- no skipped setup records and no storage overrides;
- one successful protected swap with reconciled input and output measurements;
- non-empty execution logs and decoded events;
- a public/read-only Tenderly evidence link.

The strict validator enforces these conditions before `docs/fork-evidence.json` is written.
