import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

/**
 * PATCH /api/devices/:id
 *
 * Renames a device (friendlyName only — model and serialNumber are
 * immutable post-registration). Guards ownership: 404 when the device
 * belongs to another user, so we don't leak existence.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { friendlyName } = (body ?? {}) as { friendlyName?: unknown };
  if (typeof friendlyName !== "string" || friendlyName.length === 0) {
    return NextResponse.json(
      { error: "invalid_friendlyName", detail: "friendlyName is required" },
      { status: 400 }
    );
  }

  // Ownership check before update — never reveal existence to non-owners.
  const existing = await prisma.device.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const device = await prisma.device.update({
    where: { id },
    data: { friendlyName },
  });
  return NextResponse.json({ device });
}

/**
 * DELETE /api/devices/:id
 *
 * Removes a device from the user's inventory. Does NOT cascade to dives —
 * the user's dive history keeps its deviceSerial reference for context
 * (a dive logged from a since-removed device is still a valid dive).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.device.findUnique({ where: { id } });
  if (!existing || existing.userId !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // No cascade — dives keep their deviceSerial reference for history.
  await prisma.device.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
