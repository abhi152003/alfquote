/** Escape text before constructing a dynamic regular expression. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Mask credentials and Alchemy-style access paths in a generic RPC URL. */
export function maskRpcUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = "***";
      parsed.password = "";
    }
    if (/\/v[23]\/[^/]+/.test(parsed.pathname)) {
      parsed.pathname = parsed.pathname.replace(/(\/v[23]\/)[^/]+/, "$1***");
    }
    return parsed.toString();
  } catch {
    return "<unparseable>";
  }
}

/**
 * Redact configured provider URLs from arbitrary error text. Passing the
 * configured endpoints removes the complete URL and path even when a transport
 * library embeds them in an unexpected error shape.
 */
export function redactRpcSecrets(text: string, extraUrls: readonly string[] = []): string {
  let output = text.replace(/(\/v[23]\/)[A-Za-z0-9_-]{8,}/g, "$1***");
  for (const url of extraUrls) {
    if (!url) continue;
    let masked = "<redacted-rpc>";
    try {
      const parsed = new URL(url);
      masked = `${parsed.protocol}//${parsed.host}/***`;
    } catch {
      // Exact replacement below still removes an invalid configured value.
    }
    output = output.replace(new RegExp(escapeRegExp(url), "g"), masked);
    try {
      const parsed = new URL(url);
      if (parsed.pathname !== "/") {
        output = output.replace(new RegExp(escapeRegExp(parsed.pathname), "g"), "/***");
      }
    } catch {
      // Configuration validation handles malformed URLs.
    }
  }
  return output.slice(0, 500);
}

export function redactKeys(text: string): string {
  return redactRpcSecrets(text);
}
