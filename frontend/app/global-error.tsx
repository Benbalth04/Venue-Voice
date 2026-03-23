"use client"

import { useEffect } from "react"
import { RecoveryScreen } from "@/components/system/RecoveryScreen"

/**
 * Catches errors in the root layout. Must define html/body (Next.js App Router).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="en">
      <body className="antialiased">
        <RecoveryScreen
          title="Something went wrong"
          description="A critical error occurred. We're redirecting you back to your dashboard."
          secondaryAction={{ label: "Try again", onClick: reset }}
        />
      </body>
    </html>
  )
}
