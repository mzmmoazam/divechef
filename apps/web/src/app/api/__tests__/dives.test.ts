import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock prisma + auth + the parser/scoring helpers so the route can be
// driven through pure handler logic. Existing scaffold tests below remain
// no-DB stubs; the M3 deviceSerial validation tests are real.
vi.mock("@/lib/db", () => ({
  prisma: {
    device: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    dive: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(),
}));

vi.mock("@divechef/shared", () => ({
  scoreDive: vi.fn(() => ({ score: 90, insights: [] })),
  SCORING_VERSION: "test-1",
}));

import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { POST } from "@/app/api/dives/route";

const USER_A = {
  id: "user-a",
  email: "a@example.com",
  displayName: "User A",
  niveau: "N2",
  locale: "fr",
};

function buildJsonRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/dives", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_DIVE_BODY = {
  meta: {
    deviceModel: "peregrine",
    deviceSerial: "abcd1234",
    externalId: "ext-1",
    startedAt: "2026-05-19T10:00:00.000Z",
  },
  dive: {
    maxDepthM: 18,
    avgDepthM: 12,
    durationSec: 1800,
    maxAscentRateMps: 0.15,
    minWaterTempC: 14,
  },
  samples: [],
};

beforeEach(() => {
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Existing scaffolded tests — preserved as no-DB contract reminders.
// ---------------------------------------------------------------------------

describe("POST /api/dives (scaffold)", () => {
  it("returns 401 without auth token", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = await POST(buildJsonRequest(VALID_DIVE_BODY));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/dives", () => {
  it("returns paginated dives for authenticated user", () => {
    // TODO: create several dives, GET with default limit, verify structure
  });
});

describe("GET /api/dives/:id", () => {
  it("returns 404 for non-existent dive", () => {
    // TODO: GET /api/dives/nonexistent-id, expect 404
  });
});

describe("DELETE /api/dives/:id", () => {
  it("deletes dive and cascades to samples and insights", () => {
    // TODO: covered by the [id] route handler tests when added.
  });
});

describe("GET /api/dives/:id/samples", () => {
  it("returns all samples for the dive", () => {
    // TODO: add when samples route gets a unit-style test.
  });
});

// ---------------------------------------------------------------------------
// M3: deviceSerial validation against registered devices.
// ---------------------------------------------------------------------------

describe("POST /api/dives — M3 deviceSerial validation", () => {
  it("rejects when meta.deviceSerial is missing", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(USER_A);

    const body = {
      ...VALID_DIVE_BODY,
      meta: {
        deviceModel: "peregrine",
        externalId: "ext-1",
        startedAt: "2026-05-19T10:00:00.000Z",
      },
    };
    const res = await POST(buildJsonRequest(body));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_meta");
  });

  it("rejects when deviceSerial is not a registered device for the user", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(USER_A);
    // Idempotency lookup: no existing dive.
    vi.mocked(prisma.dive.findUnique).mockResolvedValue(null);
    // Device lookup: unregistered.
    vi.mocked(prisma.device.findUnique).mockResolvedValue(null);

    const res = await POST(buildJsonRequest(VALID_DIVE_BODY));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("unregistered_device");
    // Crucially: never created a Dive row for an unregistered device.
    expect(prisma.dive.create).not.toHaveBeenCalled();
  });

  it("accepts when deviceSerial belongs to a registered device", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(USER_A);
    vi.mocked(prisma.dive.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.device.findUnique).mockResolvedValue({
      id: "dev-1",
      userId: USER_A.id,
      serialNumber: "abcd1234",
    } as never);
    vi.mocked(prisma.dive.create).mockResolvedValue({
      id: "dive-1",
      userId: USER_A.id,
      deviceSerial: "abcd1234",
      insights: [],
    } as never);
    vi.mocked(prisma.device.update).mockResolvedValue({} as never);

    const res = await POST(buildJsonRequest(VALID_DIVE_BODY));
    expect(res.status).toBe(201);
  });

  it("persists deviceSerial on the saved Dive row", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(USER_A);
    vi.mocked(prisma.dive.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.device.findUnique).mockResolvedValue({
      id: "dev-1",
      userId: USER_A.id,
      serialNumber: "abcd1234",
    } as never);
    vi.mocked(prisma.dive.create).mockResolvedValue({
      id: "dive-1",
      insights: [],
    } as never);
    vi.mocked(prisma.device.update).mockResolvedValue({} as never);

    await POST(buildJsonRequest(VALID_DIVE_BODY));

    const createArgs = vi.mocked(prisma.dive.create).mock.calls[0]?.[0];
    expect(createArgs?.data.deviceSerial).toBe("abcd1234");
  });

  it("bumps Device.lastSyncAt as a side-effect of a successful upload", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(USER_A);
    vi.mocked(prisma.dive.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.device.findUnique).mockResolvedValue({
      id: "dev-1",
      userId: USER_A.id,
      serialNumber: "abcd1234",
    } as never);
    vi.mocked(prisma.dive.create).mockResolvedValue({
      id: "dive-1",
      insights: [],
    } as never);
    vi.mocked(prisma.device.update).mockResolvedValue({} as never);

    await POST(buildJsonRequest(VALID_DIVE_BODY));

    expect(prisma.device.update).toHaveBeenCalledWith({
      where: { id: "dev-1" },
      data: { lastSyncAt: expect.any(Date) },
    });
  });

  it("returns the existing dive (200) on idempotent re-upload", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(USER_A);
    // Device is registered (validated first); then existing dive short-
    // circuits the create.
    vi.mocked(prisma.device.findUnique).mockResolvedValue({
      id: "dev-1",
      userId: USER_A.id,
      serialNumber: "abcd1234",
    } as never);
    vi.mocked(prisma.dive.findUnique).mockResolvedValue({
      id: "dive-1",
      userId: USER_A.id,
      externalId: "ext-1",
      safetyScore: 90,
      insights: [],
    } as never);

    const res = await POST(buildJsonRequest(VALID_DIVE_BODY));
    expect(res.status).toBe(200);
    expect(prisma.dive.create).not.toHaveBeenCalled();
  });
});
