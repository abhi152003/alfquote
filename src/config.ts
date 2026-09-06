/**
 * Environment contract for the ALFQuote mainnet verification spike.
 *
 * The spike is fail-closed: a missing or malformed RPC configuration must stop
 * the run with an actionable error before any on-chain read is attempted.
 */

export const RPC_URL_ENV_VAR = "ETHEREUM_RPC_URL";

const ACCEPTED_PROTOCOLS = new Set(["http:", "https:", "ws:", "wss:"]);

export class SpikeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpikeConfigError";
  }
}

export interface SpikeConfig {
  /** Ethereum mainnet JSON-RPC endpoint (http/https) or WebSocket endpoint (ws/wss). */
  rpcUrl: string;
  /** The spike only targets Ethereum mainnet (chain id 1). */
  chainId: 1;
}

/**
 * Validate the spike environment and return the parsed configuration.
 *
 * @throws {SpikeConfigError} when `ETHEREUM_RPC_URL` is missing, empty, not a
 * parseable URL, or uses a protocol other than http(s)/ws(s).
 */
export function loadSpikeConfig(env: Record<string, string | undefined>): SpikeConfig {
  const raw = env[RPC_URL_ENV_VAR]?.trim();

  if (raw === undefined || raw === "") {
    throw new SpikeConfigError(
      `${RPC_URL_ENV_VAR} is not set. Copy .env.example to .env and set it to an Ethereum mainnet RPC endpoint (for example an Infura or Alchemy HTTPS URL).`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new SpikeConfigError(
      `${RPC_URL_ENV_VAR} is not a valid URL: "${raw}". Set it to an Ethereum mainnet RPC endpoint such as https://eth-mainnet.g.alchemy.com/v2/<key>.`,
    );
  }

  if (!ACCEPTED_PROTOCOLS.has(parsed.protocol)) {
    throw new SpikeConfigError(
      `${RPC_URL_ENV_VAR} must use http, https, ws, or wss, but "${raw}" uses "${parsed.protocol}".`,
    );
  }

  return { rpcUrl: raw, chainId: 1 };
}
