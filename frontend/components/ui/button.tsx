"use client"

import * as React from "react"

type Variant = "default" | "outline" | "ghost"

const base =
  "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"

const variants: Record<Variant, string> = {
  default: "bg-violet-600 text-white shadow-sm hover:bg-violet-700",
  outline:
    "border border-zinc-200 bg-white text-zinc-900 shadow-sm hover:bg-zinc-50",
  ghost: "text-zinc-700 hover:bg-zinc-100",
}

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={[base, variants[variant], className].join(" ")}
      {...props}
    />
  ),
)

Button.displayName = "Button"

