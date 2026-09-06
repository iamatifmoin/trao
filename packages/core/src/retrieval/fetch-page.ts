import { checkUrlSafety } from "./ssrf-guard.js";
import { extractFromHtml, type ExtractedLink } from "./html.js";

export type FetchPageErrorCode =
  | "INVALID_URL"
  | "BLOCKED_ADDRESS"
  | "TIMEOUT"
  | "UNREACHABLE"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "PAGE_TOO_LARGE"
  | "TOO_MANY_REDIRECTS"
  | "HTTP_ERROR";

export class FetchPageError extends Error {
  constructor(
    public code: FetchPageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FetchPageError";
  }
}

export interface FetchedPage {
  requestedUrl: string;
  finalUrl: string;
  status: number;
  title: string;
  text: string;
  links: ExtractedLink[];
}

export interface FetchPageOptions {
  /** Only for local/dev fixture servers — must stay false in production. */
  allowPrivateNetworks?: boolean;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const DEFAULT_MAX_REDIRECTS = 5;
const ACCEPTED_CONTENT_TYPES = ["text/html", "text/plain"];

export function isRetryableFetchError(err: unknown): boolean {
  if (err instanceof FetchPageError) {
    return err.code === "TIMEOUT" || err.code === "UNREACHABLE" || err.code === "HTTP_ERROR";
  }
  return false;
}

/**
 * The single primitive every other retrieval step goes through: validates
 * the URL is safe to fetch (SSRF guard, re-checked on every redirect hop),
 * enforces a timeout and a byte cap, restricts to text content types, and
 * returns cleaned text plus outgoing links.
 */
export async function fetchPage(url: string, opts: FetchPageOptions = {}): Promise<FetchedPage> {
  const allowPrivateNetworks = opts.allowPrivateNetworks ?? false;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let currentUrl = url;

  for (let redirectCount = 0; ; redirectCount++) {
    if (redirectCount > maxRedirects) {
      throw new FetchPageError("TOO_MANY_REDIRECTS", `exceeded ${maxRedirects} redirects starting from ${url}`);
    }

    const safety = await checkUrlSafety(currentUrl, { allowPrivateNetworks });
    if (!safety.allowed) {
      throw new FetchPageError("BLOCKED_ADDRESS", safety.reason ?? "URL blocked");
    }

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": "InterviewPrepKitBot/1.0 (+research)" },
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new FetchPageError("TIMEOUT", `timed out fetching ${currentUrl}`);
      }
      throw new FetchPageError("UNREACHABLE", `could not reach ${currentUrl}: ${(err as Error).message}`);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new FetchPageError("HTTP_ERROR", `redirect from ${currentUrl} had no Location header`);
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    if (!response.ok) {
      throw new FetchPageError("HTTP_ERROR", `${currentUrl} returned HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const isAccepted = ACCEPTED_CONTENT_TYPES.some((t) => contentType.includes(t));
    if (!isAccepted) {
      throw new FetchPageError("UNSUPPORTED_CONTENT_TYPE", `${currentUrl} has content-type "${contentType}"`);
    }

    const declaredLength = Number(response.headers.get("content-length") ?? "0");
    if (declaredLength > maxBytes) {
      throw new FetchPageError("PAGE_TOO_LARGE", `${currentUrl} declares ${declaredLength} bytes, over the ${maxBytes} limit`);
    }

    const body = await readBodyCapped(response, maxBytes, currentUrl);
    const isHtml = contentType.includes("text/html");
    const extracted = isHtml
      ? extractFromHtml(body, currentUrl)
      : { title: "", text: body.replace(/\s+/g, " ").trim(), links: [] };

    return {
      requestedUrl: url,
      finalUrl: currentUrl,
      status: response.status,
      title: extracted.title,
      text: extracted.text,
      links: extracted.links,
    };
  }
}

async function readBodyCapped(response: Response, maxBytes: number, url: string): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new FetchPageError("PAGE_TOO_LARGE", `${url} exceeded the ${maxBytes} byte limit while streaming`);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString("utf-8");
}
