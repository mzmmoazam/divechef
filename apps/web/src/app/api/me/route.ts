import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import type { Niveau, Locale } from "@diveforge/shared";
import { Niveau as PrismaNiveau } from "@prisma/client";

const VALID_NIVEAUX: Niveau[] = [
  "N1",
  "N2",
  "N3",
  "N4",
  "INITIATEUR",
  "MF1",
  "MF2",
  "UNKNOWN",
];

const VALID_LOCALES: Locale[] = ["fr", "en"];

/**
 * PATCH /api/me
 *
 * Updates user profile fields (niveau, locale).
 * Returns { user } with the updated user shape.
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { niveau, locale } = body as { niveau?: string; locale?: string };

    // Validate niveau if provided
    if (niveau !== undefined && !VALID_NIVEAUX.includes(niveau as Niveau)) {
      return NextResponse.json(
        { error: `Invalid niveau. Must be one of: ${VALID_NIVEAUX.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate locale if provided
    if (locale !== undefined && !VALID_LOCALES.includes(locale as Locale)) {
      return NextResponse.json(
        { error: `Invalid locale. Must be one of: ${VALID_LOCALES.join(", ")}` },
        { status: 400 }
      );
    }

    // If no fields provided, return current user unchanged
    if (niveau === undefined && locale === undefined) {
      return NextResponse.json({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          niveau: user.niveau,
          locale: user.locale,
        },
      });
    }

    // Build update data
    const updateData: { niveau?: PrismaNiveau; locale?: string } = {};
    if (niveau !== undefined) updateData.niveau = niveau as PrismaNiveau;
    if (locale !== undefined) updateData.locale = locale;

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        displayName: true,
        niveau: true,
        locale: true,
      },
    });

    return NextResponse.json({
      user: {
        id: updated.id,
        email: updated.email,
        displayName: updated.displayName,
        niveau: updated.niveau,
        locale: updated.locale,
      },
    });
  } catch (error) {
    console.error("PATCH /api/me error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * GET /api/me
 *
 * Returns the authenticated user's profile.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        niveau: user.niveau,
        locale: user.locale,
      },
    });
  } catch (error) {
    console.error("GET /api/me error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
