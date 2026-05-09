import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

/**
 * GET /api/dives/:id/samples
 *
 * Returns { samples } for the authenticated user's dive.
 * Supports ?from&to query params (in seconds since dive start) for lazy-loading.
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

    // Verify dive exists and belongs to user
    const dive = await prisma.dive.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!dive || dive.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Parse optional from/to time filters
    const { searchParams } = new URL(req.url);
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");

    const whereClause: { diveId: string; tSec?: { gte?: number; lte?: number } } = {
      diveId: id,
    };

    if (fromParam || toParam) {
      whereClause.tSec = {};
      if (fromParam) whereClause.tSec.gte = parseInt(fromParam, 10);
      if (toParam) whereClause.tSec.lte = parseInt(toParam, 10);
    }

    const samples = await prisma.diveSample.findMany({
      where: whereClause,
      orderBy: { tSec: "asc" },
      select: {
        tSec: true,
        depthM: true,
        tempC: true,
        cnsPct: true,
        decoState: true,
        decoTimeSec: true,
        decoDepthM: true,
        ttsSec: true,
      },
    });

    return NextResponse.json({ samples });
  } catch (error) {
    console.error("GET /api/dives/:id/samples error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
