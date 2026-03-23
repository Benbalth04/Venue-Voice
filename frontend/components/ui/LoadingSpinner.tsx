"use client"

const sizeClasses = {
  "2xs": "h-3 w-3 border-2",
  xs: "h-3.5 w-3.5 border-2",
  sm: "h-4 w-4 border-2",
  md: "h-5 w-5 border-[3px]",
  lg: "h-8 w-8 border-[3px]",
  xl: "h-10 w-10 border-[3px]",
  "2xl": "h-12 w-12 border-4",
} as const

export type LoadingSpinnerSize = keyof typeof sizeClasses

type LoadingSpinnerProps = {
  size?: LoadingSpinnerSize
  className?: string
  /** Accessible label; defaults to "Loading" */
  "aria-label"?: string
}

/**
 * Purple circular loading indicator (spinning ring).
 */
export function LoadingSpinner({
  size = "lg",
  className = "",
  "aria-label": ariaLabel = "Loading",
}: LoadingSpinnerProps) {
  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={[
        "inline-block shrink-0 rounded-full border-solid border-violet-200 border-t-violet-600 animate-spin",
        sizeClasses[size],
        className,
      ].join(" ")}
    />
  )
}

type LoadingBlockProps = {
  message?: string
  size?: LoadingSpinnerSize
  className?: string
}

/**
 * Centered spinner with optional caption — for pages, panels, and guards.
 */
export function LoadingBlock({ message, size = "xl", className = "" }: LoadingBlockProps) {
  return (
    <div className={["flex flex-col items-center justify-center gap-3", className].join(" ")}>
      <LoadingSpinner size={size} />
      {message ? <p className="text-sm text-zinc-500">{message}</p> : null}
    </div>
  )
}
