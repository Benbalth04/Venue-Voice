"use client"

import { useEffect } from "react"
import { RecoveryScreen } from "@/components/system/RecoveryScreen"

export default function Error({
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
    <RecoveryScreen
      title="Something went wrong"
      description="Something unexpected happened while loading this page. You can try again or return to your dashboard."
      secondaryAction={{ label: "Try again", onClick: reset }}
    />
  )
}
