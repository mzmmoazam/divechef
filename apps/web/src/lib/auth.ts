import { prisma } from "./db";
import { verifyToken } from "./jwt";
import { NextRequest } from "next/server";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  niveau: string;
  locale: string;
}

export async function getAuthUser(req: NextRequest): Promise<AuthUser | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, displayName: true, niveau: true, locale: true },
  });

  if (!user) return null;

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    niveau: user.niveau,
    locale: user.locale,
  };
}
