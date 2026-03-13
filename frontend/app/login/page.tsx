import { Suspense } from "react"
import LoginPageClient from "./LoginPageClient"

export default function Page() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <LoginPageClient />
    </Suspense>
  )
}