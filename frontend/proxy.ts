import { NextResponse, type NextRequest } from "next/server"

const PROTECTED_PREFIXES = ["/dashboard"]

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  )
  if (!isProtected) return NextResponse.next()

  const token = req.cookies.get("vv_access_token")?.value
  if (token) return NextResponse.next()

  const url = req.nextUrl.clone()
  url.pathname = "/login"
  url.searchParams.set("next", pathname)
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ["/dashboard/:path*"],
}

