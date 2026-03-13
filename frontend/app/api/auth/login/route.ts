import { NextResponse } from "next/server"
import { BACKEND_BASE_URL, setAuthCookie } from "../_shared"

export async function POST(req: Request) {
  const body = await req.json()

  const resp = await fetch(`${BACKEND_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "include",
  })

  const data = await resp.json().catch(() => null)
  if (!resp.ok) {
    return NextResponse.json(
      { error: data?.detail ?? data?.error ?? "Login failed" },
      { status: resp.status },
    )
  }

  if (!data?.access_token) {
    return NextResponse.json({ error: "Missing access token" }, { status: 502 })
  }

  await setAuthCookie(data.access_token)
  return NextResponse.json({ ok: true })
}

