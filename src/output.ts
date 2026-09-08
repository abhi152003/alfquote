/** Escape text before constructing a dynamic regular expression. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Mask credentials and provider access paths in an RPC URL.
 * Tenderly Virtual Environment paths are always treated as secrets.
 */
export function maskRpcUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = "***";
      parsed.password = "";
    }
    if (parsed.hostname.toLowerCase().endsWith("tenderly.co")) {
      parsed.pathname = "/***";
      parsed.search = "";
      parsed.hash = "";
    } else if (/\/v[23]\/[^/]+/.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(/(\/v[23]\/)[^/]+/, "$1***");
    }
    return parsed.toString();
  } catch {
    return "<unparseable>";
  }
}

/**
 * Redact known RPC secrets from arbitrary error text. Extra URLs are removed
 * exactly and by path so provider errors cannot leak configured endpoints.
 */
export function redactRpcSecrets(text: string, extraUrls: readonly string[] = []): string {
  let output = text.replace(/(\/v[23]\/)[A-Za-z0-9_-]{8,}/g, "$1***");
  output = output.replace(
    /https?:\/\/(?:[^@\s/]+@)?[A-Za-z0-9.-]*tenderly\.co(?:\/[^\s"'<>\])}]*)?/gi,
    (match) => maskRpcUrl(match),
  );
  for (const url of extraUrls) {
    if (!url) continue;
    output = output.replace(new RegExp(escapeRegExp(url), "g"), maskRpcUrl(url));
    try {
      const parsed = new URL(url);
      if (parsed.pathname !== "/") {
        output = output.replace(new RegExp(escapeRegExp(parsed.pathname), "g"), "/***");
      }
    } catch {
      // Configuration validation handles malformed URLs. Exact replacement above still applies.
    }
  }
  return output.slice(0, 500);
}

/** Backwards-compatible generic RPC redactor used by mainnet and fork paths. */
export function redactKeys(text: string): string {
  return redactRpcSecrets(text);
}
