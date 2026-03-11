"use client"

export function Toolbar({
  onAddStar,
  onAddText,
}: {
  onAddStar: () => void
  onAddText: () => void
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="text-sm font-semibold text-zinc-900">Add elements</div>
      <div className="mt-3 flex flex-col gap-2">
        <Button onClick={onAddStar}>Add star rating question</Button>
        <Button onClick={onAddText} variant="secondary">
          Add text response question
        </Button>
      </div>
    </div>
  )
}

function Button({
  children,
  onClick,
  variant = "primary",
}: {
  children: React.ReactNode
  onClick: () => void
  variant?: "primary" | "secondary"
}) {
  const base =
    "w-full rounded-xl px-3 py-2 text-left text-sm font-medium shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
  const styles =
    variant === "primary"
      ? "bg-violet-600 text-white hover:bg-violet-700"
      : "bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50"
  return (
    <button type="button" className={`${base} ${styles}`} onClick={onClick}>
      {children}
    </button>
  )
}
