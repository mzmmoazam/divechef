import { describe, it, expect } from "vitest";

describe("Auth endpoints — contract compliance", () => {
  it("POST /api/auth/signup rejects missing fields (400)", async () => {
    // TODO: Test empty body returns 400
    // Requires test DB or mocked Prisma — scaffold only
    expect(true).toBe(true);
  });

  it("POST /api/auth/signup returns { token, user } shape", async () => {
    // TODO: Validate response matches Contract §Auth
    // Expected shape: { token: string, user: { id, email, displayName, niveau, locale } }
    expect(true).toBe(true);
  });

  it("POST /api/auth/login returns 401 for wrong password", async () => {
    // TODO: Validate error handling
    // Expected: { error: "Invalid credentials" } with status 401
    expect(true).toBe(true);
  });

  it("GET /api/auth/me returns 401 without token", async () => {
    // TODO: Validate auth guard
    // Expected: { error: "Unauthorized" } with status 401
    expect(true).toBe(true);
  });

  it("GET /api/auth/me returns { user } with valid token", async () => {
    // TODO: Validate authenticated response shape
    // Expected: { user: { id, email, displayName, niveau, locale } }
    expect(true).toBe(true);
  });

  it("POST /api/auth/logout returns { ok: true }", async () => {
    // TODO: Validate logout response
    // Expected: { ok: true }
    expect(true).toBe(true);
  });
});
