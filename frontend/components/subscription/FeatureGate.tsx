"use client"

/**
 * FeatureGate — wrap UI elements that require a higher subscription plan.
 *
 * When `allowed` is false the gate renders an upgrade prompt instead of (or
 * over) the children, depending on the `mode` prop.
 *
 * Usage:
 *
 *   // Hide the feature entirely and show a dashed upgrade box
 *   <FeatureGate
 *     allowed={subscription?.plan_limits?.can_use_photo_feedback ?? true}
 *     featureName="Photo Feedback"
 *     upgradeTo="Growth"
 *   >
 *     <PhotoQuestionOption />
 *   </FeatureGate>
 *
 *   // Show the feature blurred with an overlay CTA
 *   <FeatureGate
 *     allowed={!isAtLimit(locationCount, subscription?.plan_limits?.max_locations ?? -1)}
 *     featureName="Add Location"
 *     upgradeTo="Growth"
 *     mode="blur"
 *   >
 *     <AddLocationButton />
 *   </FeatureGate>
 *
 * Safety convention: always default `allowed` to `true` when the subscription
 * data is unavailable (e.g. still loading or null). The backend enforces the
 * real restriction; the frontend gate is purely a UX courtesy.
 */

import type { ReactNode } from "react"
import Link from "next/link"

interface FeatureGateProps {
  /** Whether the current plan permits this feature or resource creation. */
  allowed: boolean
  /** Human-readable feature name shown in the upgrade prompt. */
  featureName: string
  /** Plan name required to unlock — shown in the prompt if provided. */
  upgradeTo?: string
  /**
   * Render mode when blocked:
   * - "hide" (default): replace children with a dashed upgrade prompt box
   * - "blur": show children blurred with a centred overlay + upgrade CTA
   */
  mode?: "hide" | "blur"
  children: ReactNode
}

export function FeatureGate({
  allowed,
  featureName,
  upgradeTo,
  mode = "hide",
  children,
}: FeatureGateProps) {
  if (allowed) return <>{children}</>

  const upgradeHref = "/dashboard/settings/manage-subscription"
  const promptText = upgradeTo
    ? `${featureName} requires the ${upgradeTo} plan.`
    : `${featureName} requires a higher plan.`

  if (mode === "blur") {
    return (
      <div className="relative">
        <div className="pointer-events-none select-none opacity-40 blur-[2px]">
          {children}
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-white/80 p-4 text-center">
          <p className="text-sm font-medium text-zinc-700">{promptText}</p>
          <Link
            href={upgradeHref}
            className="rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700"
          >
            Upgrade
          </Link>
        </div>
      </div>
    )
  }

  // mode === "hide"
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-200 bg-zinc-50 p-4 text-center">
      <p className="text-sm text-zinc-500">{promptText}</p>
      <Link
        href={upgradeHref}
        className="text-sm font-medium text-violet-600 underline hover:text-violet-700"
      >
        Upgrade your plan
      </Link>
    </div>
  )
}
