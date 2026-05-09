import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

/**
 * GET /api/dives/:id
 *
 * Returns { dive, insights } for the authenticated user's dive.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const dive = await prisma.dive.findUnique({
      where: { id },
      include: { insights: true },
    });

    if (!dive || dive.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ dive, insights: dive.insights });
  } catch (error) {
    console.error("GET /api/dives/:id error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/dives/:id
 *
 * Deletes the dive (cascade handles samples + insights).
 * Returns { ok: true }.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const dive = await prisma.dive.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!dive || dive.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.dive.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/dives/:id error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
