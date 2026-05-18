import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { parseDiveBytes } from "@/lib/dctool-parser";
import { parseShearwaterDive } from "@/lib/shearwater-parser";
import { scoreDive, SCORING_VERSION } from "@divechef/shared";
import type { DiveSampleInput } from "@divechef/shared";

interface DiveMeta {
  deviceModel: string;
  deviceSerial: string;
  externalId: string;
  startedAt: string;
}

interface DiveData {
  maxDepthM: number;
  avgDepthM: number;
  durationSec: number;
  maxAscentRateMps: number;
  minWaterTempC: number | null;
}

/**
 * POST /api/dives
 *
 * Two ingestion paths:
 * - application/json (dev-mode): body has { meta, dive, samples }
 * - multipart/form-data (production): fields `bytes` (binary) + `meta` (JSON string)
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let meta: DiveMeta;
    let diveData: DiveData;
    let samples: DiveSampleInput[];

    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      // Production path: parse raw bytes with dctool
      const formData = await req.formData();
      const bytesField = formData.get("bytes");
      const metaField = formData.get("meta");

      if (!bytesField || !(bytesField instanceof Blob)) {
        return NextResponse.json(
          { error: "Missing 'bytes' file field" },
          { status: 400 }
        );
      }
      if (!metaField || typeof metaField !== "string") {
        return NextResponse.json(
          { error: "Missing 'meta' JSON field" },
          { status: 400 }
        );
      }

      meta = JSON.parse(metaField) as DiveMeta;
      const rawBytes = Buffer.from(await bytesField.arrayBuffer());
      const parsed = await parseDiveBytes(rawBytes);

      diveData = {
        maxDepthM: parsed.maxDepthM,
        avgDepthM: parsed.avgDepthM,
        durationSec: parsed.durationSec,
        maxAscentRateMps: parsed.maxAscentRateMps,
        minWaterTempC: parsed.minWaterTempC,
      };
      samples = parsed.samples;
    } else {
      const body = await req.json();

      if (body.rawBase64) {
        // Mobile BLE path: parse raw Shearwater dive data
        const externalId = (body.fingerprintHex as string) ?? `addr-${body.address}`;

        // Idempotency check
        const existing = await prisma.dive.findUnique({
          where: { userId_externalId: { userId: user.id, externalId } },
          include: { insights: true },
        });
        if (existing) {
          return NextResponse.json(
            { dive: existing, insights: existing.insights, score: existing.safetyScore },
            { status: 200 }
          );
        }

        const rawBytes = Buffer.from(body.rawBase64 as string, "base64");
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

        const dive = await prisma.dive.create({
          data: {
            userId: user.id,
            externalId,
            startedAt: parsed.startedAt,
            durationSec: parsed.durationSec,
            maxDepthM: parsed.maxDepthM,
            avgDepthM: parsed.avgDepthM,
            minWaterTempC: parsed.minWaterTempC,
            maxAscentRateMps: parsed.maxAscentRateMps,
            safetyScore: scoreResult.score,
            scoredAt: new Date(),
            scoringVersion: SCORING_VERSION,
            rawBase64: body.rawBase64 as string,
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
          include: { insights: true },
        });

        return NextResponse.json(
          { dive, insights: dive.insights, score: scoreResult.score },
          { status: 201 }
        );
      } else {
        // Dev-mode JSON path
        meta = body.meta as DiveMeta;
        diveData = body.dive as DiveData;
        samples = body.samples as DiveSampleInput[];
      }
    }

    // Validate required meta fields
    if (!meta?.externalId || !meta?.startedAt || !meta?.deviceModel) {
      return NextResponse.json(
        { error: "meta must include externalId, startedAt, and deviceModel" },
        { status: 400 }
      );
    }

    // Validate deviceSerial against the user's registered devices.
    // M3 contract: every uploaded dive must come from a known computer.
    if (typeof meta.deviceSerial !== "string" || meta.deviceSerial.length === 0) {
      return NextResponse.json(
        { error: "invalid_meta", detail: "meta.deviceSerial is required" },
        { status: 400 }
      );
    }

    const device = await prisma.device.findUnique({
      where: {
        userId_serialNumber: { userId: user.id, serialNumber: meta.deviceSerial },
      },
    });
    if (!device) {
      return NextResponse.json(
        {
          error: "unregistered_device",
          detail: "Register the device via POST /api/devices first.",
        },
        { status: 400 }
      );
    }

    // Idempotency check: (userId, externalId)
    const existing = await prisma.dive.findUnique({
      where: { userId_externalId: { userId: user.id, externalId: meta.externalId } },
      include: { insights: true },
    });

    if (existing) {
      return NextResponse.json(
        {
          dive: existing,
          insights: existing.insights,
          score: existing.safetyScore,
        },
        { status: 200 }
      );
    }

    // Score the dive
    const scoreResult = scoreDive(
      {
        maxDepthM: diveData.maxDepthM,
        avgDepthM: diveData.avgDepthM,
        durationSec: diveData.durationSec,
        maxAscentRateMps: diveData.maxAscentRateMps,
        minWaterTempC: diveData.minWaterTempC,
        niveau: user.niveau,
      },
      samples
    );

    // Create dive + samples + insights in one transaction
    const dive = await prisma.dive.create({
      data: {
        userId: user.id,
        externalId: meta.externalId,
        deviceSerial: meta.deviceSerial,
        startedAt: new Date(meta.startedAt),
        durationSec: diveData.durationSec,
        maxDepthM: diveData.maxDepthM,
        avgDepthM: diveData.avgDepthM,
        minWaterTempC: diveData.minWaterTempC,
        maxAscentRateMps: diveData.maxAscentRateMps,
        safetyScore: scoreResult.score,
        scoredAt: new Date(),
        scoringVersion: SCORING_VERSION,
        samples: {
          createMany: {
            data: samples.map((s) => ({
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
      include: { insights: true },
    });

    // Side-effect: bump Device.lastSyncAt so the device list UI can show
    // "last synced X minutes ago". Best-effort; don't fail the upload if
    // this update can't write.
    await prisma.device
      .update({ where: { id: device.id }, data: { lastSyncAt: new Date() } })
      .catch((err) => {
        console.error("lastSyncAt update failed:", err);
      });

    return NextResponse.json(
      {
        dive,
        insights: dive.insights,
        score: scoreResult.score,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/dives error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/dives
 *
 * Cursor-based pagination. Query params: ?limit (default 20, max 100) &cursor
 * Returns: { dives: DiveSummary[], nextCursor: string | null }
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limitParam = parseInt(searchParams.get("limit") ?? "20", 10);
    const limit = Math.min(Math.max(1, limitParam), 100);
    const cursor = searchParams.get("cursor") ?? undefined;

    const dives = await prisma.dive.findMany({
      where: { userId: user.id },
      orderBy: { startedAt: "desc" },
      take: limit + 1, // fetch one extra to determine nextCursor
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        startedAt: true,
        durationSec: true,
        maxDepthM: true,
        safetyScore: true,
      },
    });

    let nextCursor: string | null = null;
    if (dives.length > limit) {
      const next = dives.pop()!;
      nextCursor = next.id;
    }

    return NextResponse.json({ dives, nextCursor });
  } catch (error) {
    console.error("GET /api/dives error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
