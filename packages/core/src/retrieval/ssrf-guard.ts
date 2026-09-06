import dns from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";

export interface SsrfCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface SsrfCheckOptions {
  /** Set true only outside production, so local fixture servers remain reachable. */
  allowPrivateNetworks: boolean;
}

/**
 * Validates a URL is safe to fetch: http(s) only, and (unless explicitly
 * allowed for local/dev use) not resolving to a private, loopback or
 * link-local address. Resolves the hostname rather than pattern-matching it,
 * so a DNS record pointing a public-looking name at an internal IP is still
 * caught.
 */
export async function checkUrlSafety(
  rawUrl: string,
  opts: SsrfCheckOptions,
): Promise<SsrfCheckResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: "invalid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { allowed: false, reason: `unsupported protocol "${url.protocol}"` };
  }

  if (opts.allowPrivateNetworks) {
    return { allowed: true };
  }

  const hostname = url.hostname;

  if (isIPv4(hostname) || isIPv6(hostname)) {
    if (isPrivateOrLoopbackIp(hostname)) {
      return { allowed: false, reason: `"${hostname}" is a private/loopback address` };
    }
    return { allowed: true };
  }

  let addresses: string[];
  try {
    const records = await dns.lookup(hostname, { all: true });
    addresses = records.map((r) => r.address);
  } catch {
    return { allowed: false, reason: `could not resolve "${hostname}"` };
  }

  const blocked = addresses.find(isPrivateOrLoopbackIp);
  if (blocked) {
    return {
      allowed: false,
      reason: `"${hostname}" resolves to a private/loopback address (${blocked})`,
    };
  }

  return { allowed: true };
}

export function isPrivateOrLoopbackIp(ip: string): boolean {
  if (isIPv4(ip)) {
    const octets = ip.split(".").map(Number);
    const [a, b] = octets;
    if (a === undefined || b === undefined) return true;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 0) return true; // "this network"
    return false;
  }

  if (isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === "::1") return true; // loopback
    if (normalized.startsWith("fe80:") || normalized.startsWith("fe80::")) return true; // link-local
    if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true; // unique local (fc00::/7)
    // IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) inherit the IPv4 rules.
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped && mapped[1]) return isPrivateOrLoopbackIp(mapped[1]);
    return false;
  }

  // Couldn't classify the address format at all — fail closed.
  return true;
}
