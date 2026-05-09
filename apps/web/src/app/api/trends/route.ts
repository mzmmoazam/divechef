import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

interface ScoreSeriesEntry {
  date: string;
  score: number;
}

interface TrendsResponse {
  avgScore: number | null;
  avgDepthM: number | null;
  diveCount: number;
  scoreSeries: ScoreSeriesEntry[];
  summaryTipKey: string;
}

function getSummaryTipKey(avgScore: number | null, hasScoredDives: boolean): string {
  if (!hasScoredDives || avgScore === null) return "keep_diving";
  if (avgScore >= 90) return "excellent_practice";
  if (avgScore >= 75) return "improving_ascent_control";
  if (avgScore >= 50) return "watch_ascent_rate";
  return "review_safety_stops";
}

/**
 * GET /api/trends?days=30
 *
 * Returns rolling aggregate stats for the authenticated user's dives
 * over the specified number of days.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const days = Math.max(1, parseInt(searchParams.get("days") ?? "30", 10));

    const since = new Date();
    since.setDate(since.getDate() - days);

    const dives = await prisma.dive.findMany({
      where: {
        userId: user.id,
        startedAt: { gte: since },
      },
      select: {
        startedAt: true,
        avgDepthM: true,
        safetyScore: true,
      },
      orderBy: { startedAt: "asc" },
    });

    if (dives.length === 0) {
      const response: TrendsResponse = {
        avgScore: null,
        avgDepthM: null,
        diveCount: 0,
        scoreSeries: [],
        summaryTipKey: "no_dives_yet",
      };
      return NextResponse.json(response);
    }

    // Compute averages
    const depthSum = dives.reduce((acc, d) => acc + d.avgDepthM, 0);
    const avgDepthM = depthSum / dives.length;

    const scoredDives = dives.filter((d) => d.safetyScore !== null);
    const avgScore =
      scoredDives.length > 0
        ? scoredDives.reduce((acc, d) => acc + d.safetyScore!, 0) / scoredDives.length
        : null;

    // Build scoreSeries (one entry per scored dive, sorted by date)
    const scoreSeries: ScoreSeriesEntry[] = scoredDives.map((d) => ({
      date: d.startedAt.toISOString().slice(0, 10),
      score: d.safetyScore!,
    }));

    const summaryTipKey = getSummaryTipKey(avgScore, scoredDives.length > 0);

    const response: TrendsResponse = {
      avgScore: avgScore !== null ? Math.round(avgScore * 100) / 100 : null,
      avgDepthM: Math.round(avgDepthM * 100) / 100,
      diveCount: dives.length,
      scoreSeries,
      summaryTipKey,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("GET /api/trends error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
