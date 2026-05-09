import { NextResponse } from "next/server";

export async function POST() {
  // JWT is stateless — no server-side invalidation needed.
  // This endpoint exists for API symmetry per the contract.
  return NextResponse.json({ ok: true });
}
