import { Suspense } from "react"
import { Loader2 } from "lucide-react"
import ReviewRedirectPageContent from "./ReviewRedirectPageContent"

export default function ReviewRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
        </div>
      }
    >
      <ReviewRedirectPageContent />
    </Suspense>
  )
}
