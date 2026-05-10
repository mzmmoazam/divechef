import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { parseShearwaterDive } from "@/lib/shearwater-parser";
import { scoreDive, SCORING_VERSION } from "@divechef/shared";

/**
 * POST /api/dives/reprocess
 *
 * Re-parses all dives that have rawBase64 but are missing parsed data
 * (durationSec=0 or safetyScore=null). Useful after deploying the parser.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const unparsedDives = await prisma.dive.findMany({
      where: {
        userId: user.id,
        rawBase64: { not: null },
        OR: [{ durationSec: 0 }, { safetyScore: null }],
      },
      select: { id: true, rawBase64: true },
    });

    let processed = 0;
    let failed = 0;

    for (const dive of unparsedDives) {
      if (!dive.rawBase64) continue;

      try {
        const rawBytes = Buffer.from(dive.rawBase64, "base64");
        const parsed = parseShearwaterDive(rawBytes);

        const scoreResult = scoreDive(
          {
            maxDepthM: parsed.maxDepthM,
            avgDepthM: parsed.avgDepthM,
            durationSec: parsed.durationSec,
            maxAscentRateMps: parsed.maxAscentRateMps,
            minWaterTempC: parsed.minWaterTempC,
            niveau: user.niveau,
          },
          parsed.samples
        );

        await prisma.$transaction([
          prisma.diveSample.deleteMany({ where: { diveId: dive.id } }),
          prisma.insight.deleteMany({ where: { diveId: dive.id } }),
          prisma.dive.update({
            where: { id: dive.id },
            data: {
              startedAt: parsed.startedAt,
              durationSec: parsed.durationSec,
              maxDepthM: parsed.maxDepthM,
              avgDepthM: parsed.avgDepthM,
              minWaterTempC: parsed.minWaterTempC,
              maxAscentRateMps: parsed.maxAscentRateMps,
              safetyScore: scoreResult.score,
              scoredAt: new Date(),
              scoringVersion: SCORING_VERSION,
              samples: {
                createMany: {
                  data: parsed.samples.map((s) => ({
                    tSec: s.tSec,
                    depthM: s.depthM,
                    tempC: s.tempC,
                    cnsPct: s.cnsPct,
                    decoState: s.decoState,
                    decoTimeSec: s.decoTimeSec,
                    decoDepthM: s.decoDepthM,
                    ttsSec: s.ttsSec,
                  })),
                },
              },
              insights: {
                createMany: {
                  data: scoreResult.insights.map((i) => ({
                    ruleId: i.ruleId,
                    severity: i.severity,
                    evidence: i.evidence as object,
                  })),
                },
              },
            },
          }),
        ]);

        processed++;
      } catch {
        failed++;
      }
    }

    return NextResponse.json({
      total: unparsedDives.length,
      processed,
      failed,
    });
  } catch (error) {
    console.error("POST /api/dives/reprocess error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
