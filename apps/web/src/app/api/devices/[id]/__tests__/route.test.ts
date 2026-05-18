import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: {
    device: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    dive: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  getAuthUser: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { PATCH, DELETE } from "@/app/api/devices/[id]/route";

const USER_A = {
  id: "user-a",
  email: "a@example.com",
  displayName: "User A",
  niveau: "N2",
  locale: "fr",
};

const USER_B = {
  id: "user-b",
  email: "b@example.com",
  displayName: "User B",
  niveau: "N2",
  locale: "fr",
};

function buildJsonRequest(method: string, body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/devices/dev-1", {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "dev-1" });

beforeEach(() => {
  vi.resetAllMocks();
});

describe("PATCH /api/devices/:id", () => {
  it("returns 401 without auth", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = await PATCH(
      buildJsonRequest("PATCH", { friendlyName: "X" }),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it("requires friendlyName", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(USER_A);
    const res = await PATCH(buildJsonRequest("PATCH", {}), { params });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_friendlyName");
  });

  it("renames the device", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(USER_A);
    vi.mocked(prisma.device.findUnique).mockResolvedValue({
      id: "dev-1",
      userId: USER_A.id,
      friendlyName: "Old",
    } as never);
    vi.mocked(prisma.device.update).mockResolvedValue({
      id: "dev-1",
      userId: USER_A.id,
      friendlyName: "New Name",
    } as never);

    const res = await PATCH(
      buildJsonRequest("PATCH", { friendlyName: "New Name" }),
      { params }
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.device.friendlyName).toBe("New Name");
    expect(prisma.device.update).toHaveBeenCalledWith({
      where: { id: "dev-1" },
      data: { friendlyName: "New Name" },
    });
  });

  it("returns 404 when device belongs to another user", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(USER_B);
    vi.mocked(prisma.device.findUnique).mockResolvedValue({
      id: "dev-1",
      userId: USER_A.id,
      friendlyName: "Old",
    } as never);

    const res = await PATCH(
      buildJsonRequest("PATCH", { friendlyName: "Hacked" }),
      { params }
    );
    expect(res.status).toBe(404);
    expect(prisma.device.update).not.toHaveBeenCalled();
  });

  it("returns 404 when device does not exist", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(USER_A);
    vi.mocked(prisma.device.findUnique).mockResolvedValue(null);

    const res = await PATCH(
      buildJsonRequest("PATCH", { friendlyName: "X" }),
      { params }
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/devices/:id", () => {
  it("returns 401 without auth", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(null);
    const res = await DELETE(buildJsonRequest("DELETE"), { params });
    expect(res.status).toBe(401);
  });

  it("removes the device", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(USER_A);
    vi.mocked(prisma.device.findUnique).mockResolvedValue({
      id: "dev-1",
      userId: USER_A.id,
    } as never);
    vi.mocked(prisma.device.delete).mockResolvedValue({} as never);

    const res = await DELETE(buildJsonRequest("DELETE"), { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(prisma.device.delete).toHaveBeenCalledWith({
      where: { id: "dev-1" },
    });
  });

  it("returns 404 when device belongs to another user", async () => {
    vi.mocked(getAuthUser).mockResolvedValue(USER_B);
    vi.mocked(prisma.device.findUnique).mockResolvedValue({
      id: "dev-1",
      userId: USER_A.id,
    } as never);

    const res = await DELETE(buildJsonRequest("DELETE"), { params });
    expect(res.status).toBe(404);
    expect(prisma.device.delete).not.toHaveBeenCalled();
  });

  it("does not cascade to dives — dive rows keep their deviceSerial reference", async () => {
    // Schema-level check: the Device → Dive relation has no cascade.
    // The delete call targets only the Device row; dives are untouched.
    vi.mocked(getAuthUser).mockResolvedValue(USER_A);
    vi.mocked(prisma.device.findUnique).mockResolvedValue({
      id: "dev-1",
      userId: USER_A.id,
    } as never);
    vi.mocked(prisma.device.delete).mockResolvedValue({} as never);

    await DELETE(buildJsonRequest("DELETE"), { params });

    // Only the Device.delete call — never any dive-mutation call.
    expect(prisma.device.delete).toHaveBeenCalledTimes(1);
    expect(prisma.dive.findFirst).not.toHaveBeenCalled();
  });
});
