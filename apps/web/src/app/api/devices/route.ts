import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

/**
 * Supported device models — kept aligned with @divechef/shared ShearwaterModel.
 * Re-stated here as a runtime Set so the API can validate POST payloads
 * without pulling shared into a runtime dependency cycle.
 */
const SUPPORTED_MODELS = new Set([
  "peregrine",
  "perdix",
  "perdix-ai",
  "perdix-2",
  "petrel-2",
  "petrel-3",
  "teric",
  "nerd-2",
  "tern",
  "unknown-shearwater",
]);

/** Human-readable default friendlyName when the client doesn't supply one. */
const FRIENDLY_LABEL: Record<string, string> = {
  peregrine: "Peregrine",
  perdix: "Perdix",
  "perdix-ai": "Perdix AI",
  "perdix-2": "Perdix 2",
  "petrel-2": "Petrel 2",
  "petrel-3": "Petrel 3",
  teric: "Teric",
  "nerd-2": "Nerd 2",
  tern: "Tern",
  "unknown-shearwater": "Shearwater",
};

/**
 * GET /api/devices
 *
 * Returns the authenticated user's registered devices, ordered oldest-first
 * so the UI can render a stable list.
 */
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const devices = await prisma.device.findMany({
    where: { userId: user.id },
    orderBy: { registeredAt: "asc" },
  });
  return NextResponse.json({ devices });
}

/**
 * POST /api/devices
 *
 * Registers a device. Idempotent on (userId, serialNumber): a re-register with
 * the same serial returns the existing row and refreshes any soft fields the
 * client supplies (scanName / firmwareVersion). This lets the mobile add-a-
 * device flow safely retry without creating duplicates.
 */
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { model, serialNumber, friendlyName, scanName, firmwareVersion } =
    (body ?? {}) as {
      model?: unknown;
      serialNumber?: unknown;
      friendlyName?: unknown;
      scanName?: unknown;
      firmwareVersion?: unknown;
    };

  if (typeof model !== "string" || !SUPPORTED_MODELS.has(model)) {
    return NextResponse.json(
      {
        error: "invalid_model",
        detail: `model must be one of: ${[...SUPPORTED_MODELS].join(", ")}`,
      },
      { status: 400 }
    );
  }
  if (typeof serialNumber !== "string" || serialNumber.length === 0) {
    return NextResponse.json(
      { error: "invalid_serial", detail: "serialNumber is required" },
      { status: 400 }
    );
  }

  // Upsert: idempotent on (userId, serialNumber). Re-registers update soft
  // fields only — never silently mutate the user's friendlyName.
  const device = await prisma.device.upsert({
    where: {
      userId_serialNumber: { userId: user.id, serialNumber },
    },
    create: {
      userId: user.id,
      model,
      serialNumber,
      friendlyName:
        typeof friendlyName === "string" && friendlyName.length > 0
          ? friendlyName
          : (FRIENDLY_LABEL[model] ?? null),
      scanName: typeof scanName === "string" ? scanName : null,
      firmwareVersion:
        typeof firmwareVersion === "string" ? firmwareVersion : null,
    },
    update: {
      scanName: typeof scanName === "string" ? scanName : undefined,
      firmwareVersion:
        typeof firmwareVersion === "string" ? firmwareVersion : undefined,
    },
  });

  return NextResponse.json({ device }, { status: 201 });
}
