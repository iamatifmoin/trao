import { describe, expect, it } from "vitest";
import { checkUrlSafety, isPrivateOrLoopbackIp } from "../src/retrieval/ssrf-guard.js";

describe("isPrivateOrLoopbackIp", () => {
  it("flags loopback, private and link-local IPv4 ranges", () => {
    expect(isPrivateOrLoopbackIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrLoopbackIp("10.1.2.3")).toBe(true);
    expect(isPrivateOrLoopbackIp("172.16.0.5")).toBe(true);
    expect(isPrivateOrLoopbackIp("172.31.255.255")).toBe(true);
    expect(isPrivateOrLoopbackIp("192.168.1.1")).toBe(true);
    expect(isPrivateOrLoopbackIp("169.254.1.1")).toBe(true);
  });

  it("flags IPv6 loopback and unique-local addresses", () => {
    expect(isPrivateOrLoopbackIp("::1")).toBe(true);
    expect(isPrivateOrLoopbackIp("fc00::1")).toBe(true);
    expect(isPrivateOrLoopbackIp("fe80::1")).toBe(true);
  });

  it("allows ordinary public addresses", () => {
    expect(isPrivateOrLoopbackIp("8.8.8.8")).toBe(false);
    expect(isPrivateOrLoopbackIp("172.15.0.1")).toBe(false);
    expect(isPrivateOrLoopbackIp("172.32.0.1")).toBe(false);
  });
});

describe("checkUrlSafety", () => {
  it("rejects non-http(s) protocols", async () => {
    const result = await checkUrlSafety("file:///etc/passwd", { allowPrivateNetworks: true });
    expect(result.allowed).toBe(false);
  });

  it("rejects malformed URLs", async () => {
    const result = await checkUrlSafety("not a url", { allowPrivateNetworks: false });
    expect(result.allowed).toBe(false);
  });

  it("rejects a literal loopback IP when private networks are disallowed", async () => {
    const result = await checkUrlSafety("http://127.0.0.1:9999/", { allowPrivateNetworks: false });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/private|loopback/i);
  });

  it("allows a literal loopback IP when explicitly allowed (dev/CLI fixtures)", async () => {
    const result = await checkUrlSafety("http://127.0.0.1:9999/", { allowPrivateNetworks: true });
    expect(result.allowed).toBe(true);
  });

  it("allows a public host when private networks are disallowed", async () => {
    const result = await checkUrlSafety("https://example.com/", { allowPrivateNetworks: false });
    expect(result.allowed).toBe(true);
  });
});
