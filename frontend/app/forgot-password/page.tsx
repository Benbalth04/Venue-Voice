import { Suspense } from "react"
import { LoadingBlock } from "@/components/ui/LoadingSpinner"
import ForgotPasswordClient from "./ForgotPasswordClient"

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50">
          <LoadingBlock message="Loading…" />
        </div>
      }
    >
      <ForgotPasswordClient />
    </Suspense>
  )
}
