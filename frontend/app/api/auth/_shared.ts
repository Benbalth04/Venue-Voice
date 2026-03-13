import { cookies } from "next/headers"

export const BACKEND_BASE_URL =
  process.env.BACKEND_BASE_URL ?? "http://backend:5000/api/v1"

export async function setAuthCookie(accessToken: string) {
  const cookieStore = await cookies()

  cookieStore.set("vv_access_token", accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  })
}

export async function clearAuthCookie() {
  const cookieStore = await cookies()

  cookieStore.set("vv_access_token", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  })
}