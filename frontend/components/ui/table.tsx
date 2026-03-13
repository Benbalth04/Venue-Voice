"use client"

import * as React from "react"

export function Table(props: React.TableHTMLAttributes<HTMLTableElement>) {
  const { className = "", ...rest } = props
  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <table
        className={["w-full border-collapse text-sm text-zinc-900", className].join(
          " ",
        )}
        {...rest}
      />
    </div>
  )
}

export function THead(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className="bg-zinc-50 text-xs font-semibold" {...props} />
}

export function TBody(props: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} />
}

export function TR(props: React.HTMLAttributes<HTMLTableRowElement>) {
  const { className = "", ...rest } = props
  return (
    <tr
      className={[
        "border-b border-zinc-100 last:border-0 hover:bg-zinc-50",
        className,
      ].join(" ")}
      {...rest}
    />
  )
}

export function TH(
  props: React.ThHTMLAttributes<HTMLTableCellElement>,
) {
  const { className = "", ...rest } = props
  return (
    <th
      className={[
        "px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500",
        className,
      ].join(" ")}
      {...rest}
    />
  )
}

export function TD(
  props: React.TdHTMLAttributes<HTMLTableCellElement>,
) {
  const { className = "", ...rest } = props
  return (
    <td
      className={[
        "px-4 py-2 align-middle text-sm text-zinc-800",
        className,
      ].join(" ")}
      {...rest}
    />
  )
}

