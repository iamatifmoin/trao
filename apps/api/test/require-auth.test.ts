import { describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { requireAuth } from "../src/middleware/require-auth.js";
import { HttpError } from "../src/lib/http-error.js";

describe("requireAuth", () => {
  it("calls next() with no error when a session user id is present", () => {
    const req = { session: { userId: "abc" } } as unknown as Request;
    const next = vi.fn();
    requireAuth(req, {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it("calls next(HttpError 401) when there is no session user id", () => {
    const req = { session: {} } as unknown as Request;
    const next = vi.fn();
    requireAuth(req, {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]?.[0];
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(401);
    expect((err as HttpError).code).toBe("UNAUTHENTICATED");
  });
});
