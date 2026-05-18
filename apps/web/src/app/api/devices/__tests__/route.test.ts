import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

// Mock prisma and auth helpers BEFORE importing the route under test.
// The repo's existing API tests are stubs (no DB), so we follow the same
// no-DB pattern but actually exercise the handler logic via mocks.
vi.mock("@/lib/db", () => ({
  prisma: {
    device: {
      findMany: vi.fn(),
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { GET, POST } from "@/app/api/devices/route";

const USER_A = {
  id: "user-a",
  email: "a@example.com",
  displayName: "User A",
  niveau: "N2",
  locale: "fr",
};

function buildJsonRequest(method: string, body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/devices", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /api/devices", () => {
  it("returns 401 without auth", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = await GET(buildJsonRequest("GET"));
    expect(res.status).toBe(401);
  });

  it("returns empty array for new user", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(USER_A);
    vi.mocked(prisma.device.findMany).mockResolvedValue([]);

    const res = await GET(buildJsonRequest("GET"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.devices).toEqual([]);
    // Scoped by userId — never leaks another user's devices.
    expect(prisma.device.findMany).toHaveBeenCalledWith({
      where: { userId: USER_A.id },
      orderBy: { registeredAt: "asc" },
    });
  });

  it("returns the user's registered devices, scoped by userId", async () => {
    const devices = [
      {
        id: "dev-1",
        userId: USER_A.id,
        model: "peregrine",
        serialNumber: "abcd1234",
        friendlyName: "Peregrine",
        scanName: "Peregrine 1234",
        firmwareVersion: "97",
        registeredAt: new Date("2026-05-01"),
        lastSyncAt: null,
      },
    ];
    vi.mocked(getAuthUser).mockResolvedValue(USER_A);
    vi.mocked(prisma.device.findMany).mockResolvedValue(devices as never);

    const res = await GET(buildJsonRequest("GET"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.devices).toHaveLength(1);
    expect(json.devices[0].serialNumber).toBe("abcd1234");
  });
});

describe("POST /api/devices", () => {
  it("returns 401 without auth", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = await POST(
      buildJsonRequest("POST", {
        model: "peregrine",
        serialNumber: "abcd",
      })
    );
    expect(res.status).toBe(401);
  });

  it("requires serialNumber", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(USER_A);
    const res = await POST(
      buildJsonRequest("POST", { model: "peregrine" })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_serial");
  });

  it("requires a known model", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(USER_A);
    const res = await POST(
      buildJsonRequest("POST", {
        model: "fake-computer",
        serialNumber: "abcd",
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_model");
  });

  it("registers a new device", async () => {
    const created = {
      id: "dev-new",
      userId: USER_A.id,
      model: "peregrine",
      serialNumber: "abcd1234",
      friendlyName: "My Peregrine",
      scanName: "Peregrine 1234",
      firmwareVersion: "97",
      registeredAt: new Date(),
      lastSyncAt: null,
    };
    vi.mocked(getAuthUser).mockResolvedValue(USER_A);
    vi.mocked(prisma.device.upsert).mockResolvedValue(created as never);

    const res = await POST(
      buildJsonRequest("POST", {
        model: "peregrine",
        serialNumber: "abcd1234",
        friendlyName: "My Peregrine",
        scanName: "Peregrine 1234",
        firmwareVersion: "97",
      })
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.device.id).toBe("dev-new");

    expect(prisma.device.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_serialNumber: {
            userId: USER_A.id,
            serialNumber: "abcd1234",
          },
        },
      })
    );
  });

  it("defaults friendlyName from model when not provided", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(USER_A);
    vi.mocked(prisma.device.upsert).mockResolvedValue({} as never);

    await POST(
      buildJsonRequest("POST", {
        model: "perdix-2",
        serialNumber: "abcd1234",
      })
    );

    const args = vi.mocked(prisma.device.upsert).mock.calls[0]?.[0];
    expect(args?.create.friendlyName).toBe("Perdix 2");
  });

  it("is idempotent on (userId, serialNumber) via upsert", async () => {
    // The handler relies on upsert — the same serialNumber re-posted should
    // route through update (Prisma decides), not create a duplicate row.
    // We assert the where clause uses the unique constraint.
    vi.mocked(getAuthUser).mockResolvedValue(USER_A);
    vi.mocked(prisma.device.upsert).mockResolvedValue({} as never);

    await POST(
      buildJsonRequest("POST", {
        model: "peregrine",
        serialNumber: "abcd1234",
      })
    );
    await POST(
      buildJsonRequest("POST", {
        model: "peregrine",
        serialNumber: "abcd1234",
      })
    );

    expect(prisma.device.upsert).toHaveBeenCalledTimes(2);
    const firstCall = vi.mocked(prisma.device.upsert).mock.calls[0]?.[0];
    const secondCall = vi.mocked(prisma.device.upsert).mock.calls[1]?.[0];
    expect(firstCall?.where).toEqual(secondCall?.where);
    expect(firstCall?.where).toEqual({
      userId_serialNumber: {
        userId: USER_A.id,
        serialNumber: "abcd1234",
      },
    });
  });
});
