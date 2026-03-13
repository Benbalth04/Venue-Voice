import { NextResponse } from "next/server"
import { BACKEND_BASE_URL, clearAuthCookie } from "../_shared"

export async function POST() {
  // Best-effort notify backend; frontend cookie is the source of truth here.
  try {
    await fetch(`${BACKEND_BASE_URL}/auth/logout`, { method: "POST" })
  } catch {}

  clearAuthCookie()
  return NextResponse.json({ ok: true })
}

