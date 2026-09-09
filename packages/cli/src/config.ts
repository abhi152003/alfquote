/** CLI configuration: RPC and chain validation with masked errors only. */

import { maskRpcUrl } from "alfquote";

export const RPC_URL_ENV_VAR = "ETHEREUM_RPC_URL";

export class CliConfigError extends Error {}

export interface CliConfig {
  readonly rpcUrl: string;
  readonly chainId: number;
}

/**
 * Resolve the RPC endpoint from `--rpc` or `ETHEREUM_RPC_URL` and validate it.
 * Error messages only ever contain the masked URL — never the credential.
 */
export function loadCliConfig(
  env: Record<string, string | undefined>,
  options: { rpc?: string; chain: number },
): CliConfig {
  const raw = options.rpc ?? env[RPC_URL_ENV_VAR];
  if (raw === undefined || raw.trim() === "") {
    throw new CliConfigError(
      `missing RPC endpoint: pass --rpc <url> or set ${RPC_URL_ENV_VAR} (http(s) or ws(s))`,
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new CliConfigError(`invalid RPC endpoint: ${maskRpcUrl(raw)}`);
  }
  if (!/^https?:$|^wss?:$/.test(parsed.protocol)) {
    throw new CliConfigError(`RPC endpoint must be http(s) or ws(s): ${maskRpcUrl(raw)}`);
  }
  if (options.chain !== 1) {
    throw new CliConfigError(`--chain must be 1 in Phase 2; got ${options.chain}`);
  }
  return { rpcUrl: raw.trim(), chainId: options.chain };
}
