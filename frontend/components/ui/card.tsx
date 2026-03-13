"use client"

import * as React from "react"

export function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className = "", ...rest } = props
  return (
    <div
      className={[
        "rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm",
        className,
      ].join(" ")}
      {...rest}
    />
  )
}

