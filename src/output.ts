/** Mask userinfo and Alchemy `/v2|/v3` keys in RPC URLs. */
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

/** Redact `/v2|/v3` keys in error strings. */
export function redactKeys(text: string): string {
  return text.replace(/(\/v[23]\/)[A-Za-z0-9_-]{8,}/g, "$1***").slice(0, 300);
}
