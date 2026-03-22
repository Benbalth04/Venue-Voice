"use client"

import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"

export interface DataTableColumn<T> {
  key: string
  label: ReactNode
  sortable?: boolean
  align?: "left" | "center" | "right"
  render: (row: T) => ReactNode
  headerClassName?: string
  cellClassName?: string
}

export interface DataTableProps<T> {
  data: T[]
  columns: DataTableColumn<T>[]
  getRowKey: (row: T) => string
  sortKey?: string
  sortDir?: "asc" | "desc"
  onSort?: (key: string) => void
  emptyMessage?: string
  loading?: boolean
  minWidth?: string
  footer?: ReactNode
}

export function DataTable<T>({
  data,
  columns,
  getRowKey,
  sortKey,
  sortDir = "asc",
  onSort,
  emptyMessage = "No data",
  loading = false,
  minWidth,
  footer,
}: DataTableProps<T>) {
  const alignClass = (align: "left" | "center" | "right" = "center") => {
    switch (align) {
      case "left":
        return "text-left"
      case "right":
        return "text-right"
      default:
        return "text-center"
    }
  }

  const justifyClass = (align: "left" | "center" | "right" = "center") => {
    switch (align) {
      case "left":
        return "justify-start"
      case "right":
        return "justify-end"
      default:
        return "justify-center"
    }
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table
          className="w-full text-sm"
          style={minWidth ? { minWidth } : undefined}
        >
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50">
              {columns.map((col) => {
                const sortable = col.sortable !== false && onSort != null
                const active = sortKey === col.key
                return (
                  <th
                    key={col.key}
                    className={[
                      "px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500",
                      alignClass(col.align),
                      "align-middle",
                      col.headerClassName ?? "",
                      sortable ? "cursor-pointer select-none hover:text-zinc-600" : "",
                    ].join(" ")}
                    onClick={
                      sortable
                        ? () => onSort!(col.key)
                        : undefined
                    }
                  >
                    <span
                      className={`inline-flex items-center gap-1 ${justifyClass(col.align)}`}
                    >
                      {col.label}
                      {sortable && active && (
                        <span className="text-zinc-400" aria-hidden>
                          {sortDir === "asc" ? " ↑" : " ↓"}
                        </span>
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr className="border-b border-zinc-100">
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center align-middle text-sm text-zinc-500"
                >
                  Loading…
                </td>
              </tr>
            )}
            {!loading && data.length === 0 && (
              <tr className="border-b border-zinc-100">
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center align-middle text-sm text-zinc-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
            {!loading &&
              data.map((row) => (
                <tr
                  key={getRowKey(row)}
                  className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={[
                        "px-4 py-3 align-middle break-words",
                        alignClass(col.align),
                        col.cellClassName ?? "text-zinc-700",
                      ].join(" ")}
                    >
                      <div
                        className={`flex min-w-0 items-center ${justifyClass(col.align)}`}
                      >
                        {col.render(row)}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {footer}
    </Card>
  )
}
