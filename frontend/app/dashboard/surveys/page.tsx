"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Plus,
  FileText,
  Edit,
  Pencil,
  Copy,
  Globe,
  Archive,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react"
import { supabase } from "@/lib/supabase/client"
import {
  fetchSurveysList,
  createSurvey,
  publishSurvey,
  archiveSurvey,
  duplicateSurvey,
  updateSurveyMeta,
  type SurveyListItem,
} from "@/lib/api/client"
import { defaultSurvey } from "@/lib/survey/defaultSurvey"
import { surveyToApi } from "@/lib/survey/richText"
import { useConfirm } from "@/components/ui/ConfirmDialog"

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    draft: {
      label: "Draft",
      cls: "bg-zinc-100 text-zinc-600",
      icon: <Clock className="h-3 w-3" />,
    },
    active: {
      label: "Active",
      cls: "bg-emerald-50 text-emerald-700",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    archived: {
      label: "Archived",
      cls: "bg-red-50 text-red-600",
      icon: <XCircle className="h-3 w-3" />,
    },
  }
  const { label, cls, icon } = map[status] ?? map.draft
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {icon}
      {label}
    </span>
  )
}

function ActionsMenu({
  survey,
  onPublish,
  onArchive,
  onDuplicate,
  onConfirmArchive,
}: {
  survey: SurveyListItem
  onPublish: (id: string) => Promise<void>
  onArchive: (id: string) => Promise<void>
  onDuplicate: (id: string) => Promise<void>
  onConfirmArchive: (id: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              onClick={() => {
                setOpen(false)
                router.push(`/dashboard/surveys/${survey.id}`)
              }}
            >
              <Edit className="h-4 w-4" /> Edit
            </button>
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              onClick={async () => {
                setOpen(false)
                await onDuplicate(survey.id)
              }}
            >
              <Copy className="h-4 w-4" /> Duplicate
            </button>
            {survey.status === "draft" && (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50"
                onClick={async () => {
                  setOpen(false)
                  await onPublish(survey.id)
                }}
              >
                <Globe className="h-4 w-4" /> Publish
              </button>
            )}
            {survey.status !== "archived" && (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                onClick={async () => {
                  setOpen(false)
                  await onConfirmArchive(survey.id)
                }}
              >
                <Archive className="h-4 w-4" /> Archive
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function SurveysListPage() {
  const router = useRouter()
  const pathname = usePathname()
  const [surveys, setSurveys] = useState<SurveyListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create modal state
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [editingSurvey, setEditingSurvey] = useState<SurveyListItem | null>(null)
  const [editingTitle, setEditingTitle] = useState("")
  const [renaming, setRenaming] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)

  const { confirm, ConfirmDialogRender } = useConfirm()

  async function getToken() {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  const load = useCallback(async () => {
    const token = await getToken()
    if (!token) return
    try {
      const data = await fetchSurveysList(token)
      setSurveys(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load surveys")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (pathname === "/dashboard/surveys") load()
  }, [pathname, load])

  async function handleCreate() {
    const title = newTitle.trim()
    if (!title) return
    const token = await getToken()
    if (!token) return

    setCreating(true)
    setCreateError(null)
    try {
      const survey = await createSurvey(token, title, surveyToApi(defaultSurvey) as Record<string, unknown>)
      router.push(`/dashboard/surveys/${survey.id}`)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create survey")
      setCreating(false)
    }
  }

  async function handlePublish(id: string) {
    const token = await getToken()
    if (!token) return
    const updated = await publishSurvey(token, id)
    setSurveys((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)))
  }

  async function handleArchive(id: string) {
    const token = await getToken()
    if (!token) return
    const updated = await archiveSurvey(token, id)
    setSurveys((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)))
  }

  async function handleConfirmArchive(id: string) {
    const ok = await confirm({
      title: "Archive survey",
      message: "Archive this survey? You can restore it later.",
      confirmLabel: "Archive",
      cancelLabel: "Cancel",
      variant: "danger",
    })
    if (ok) await handleArchive(id)
  }

  async function handleDuplicate(id: string) {
    const token = await getToken()
    if (!token) return
    const copy = await duplicateSurvey(token, id)
    router.push(`/dashboard/surveys/${copy.id}`)
  }

  function openTitleModal(survey: SurveyListItem) {
    setEditingSurvey(survey)
    setEditingTitle(survey.title)
    setRenameError(null)
  }

  async function handleRenameTitle() {
    if (!editingSurvey) return
    const token = await getToken()
    if (!token) return
    const nextTitle = editingTitle.trim()
    if (!nextTitle) {
      setRenameError("Title cannot be empty")
      return
    }
    setRenaming(true)
    setRenameError(null)
    try {
      await updateSurveyMeta(token, editingSurvey.id, { title: nextTitle })
      await load()
      setEditingSurvey(null)
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Failed to update title")
    } finally {
      setRenaming(false)
    }
  }

  function formatDate(iso: string) {
    if (!iso || !iso.trim()) return "—"
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return "—"
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  type SortKey = "title" | "status" | "latest_version" | "updated_at"
  type SortDir = "asc" | "desc"
  const [sortKey, setSortKey] = useState<SortKey>("updated_at")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  const sortedSurveys = [...surveys].sort((a, b) => {
    let cmp = 0
    switch (sortKey) {
      case "title":
        cmp = a.title.localeCompare(b.title)
        break
      case "status":
        cmp = a.status.localeCompare(b.status)
        break
      case "latest_version":
        cmp = a.latest_version - b.latest_version
        break
      case "updated_at":
        cmp = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
        break
      default:
        return 0
    }
    return sortDir === "asc" ? cmp : -cmp
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    else {
      setSortKey(key)
      setSortDir(key === "title" || key === "status" ? "asc" : "desc")
    }
  }

  function SortHeader({
    colKey,
    label,
  }: {
    colKey: SortKey
    label: string
  }) {
    const active = sortKey === colKey
    return (
      <th
        className="cursor-pointer select-none px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400 hover:text-zinc-600"
        onClick={() => toggleSort(colKey)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active && (sortDir === "asc" ? " ↑" : " ↓")}
        </span>
      </th>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {ConfirmDialogRender}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Surveys</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Create and manage your feedback surveys
          </p>
        </div>
        <button
          onClick={() => {
            setNewTitle("")
            setCreateError(null)
            setShowCreate(true)
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
        >
          <Plus className="h-4 w-4" />
          New Survey
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <div className="h-4 w-40 animate-pulse rounded bg-zinc-100" />
              <div className="h-4 w-16 animate-pulse rounded bg-zinc-100" />
              <div className="ml-auto h-4 w-24 animate-pulse rounded bg-zinc-100" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && surveys.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-white py-20 text-center">
          <FileText className="mb-3 h-10 w-10 text-zinc-300" />
          <p className="font-medium text-zinc-700">No surveys yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Create your first survey to start collecting feedback
          </p>
          <button
            onClick={() => {
              setNewTitle("")
              setCreateError(null)
              setShowCreate(true)
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
          >
            <Plus className="h-4 w-4" /> New Survey
          </button>
        </div>
      )}

      {/* Survey list */}
      {!loading && surveys.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
                <SortHeader colKey="title" label="Title" />
                <SortHeader colKey="status" label="Status" />
                <SortHeader colKey="latest_version" label="Version" />
                <SortHeader colKey="updated_at" label="Last updated" />
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {sortedSurveys.map((s) => (
                <tr key={s.id} className="group hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/surveys/${s.id}`}
                        className="font-medium text-zinc-900 hover:text-violet-700 hover:underline"
                      >
                        {s.title}
                      </Link>
                      <button
                        type="button"
                        onClick={() => openTitleModal(s)}
                        className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                        aria-label={`Edit title for ${s.title}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-zinc-500">v{s.latest_version}</td>
                  <td className="px-4 py-3 text-zinc-500">{formatDate(s.updated_at)}</td>
                  <td className="px-4 py-3">
                    <ActionsMenu
                      survey={s}
                      onPublish={handlePublish}
                      onArchive={handleArchive}
                      onDuplicate={handleDuplicate}
                      onConfirmArchive={handleConfirmArchive}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-semibold text-zinc-900">New Survey</h2>
            <p className="mb-4 text-sm text-zinc-500">Give your survey a title to get started.</p>
            <input
              type="text"
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate()
                if (e.key === "Escape") setShowCreate(false)
              }}
              placeholder="e.g. Customer Satisfaction Q1 2026"
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
            {createError && (
              <p className="mt-2 text-xs text-red-600">{createError}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                disabled={creating}
                className="rounded-xl px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newTitle.trim()}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create Survey"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingSurvey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-semibold text-zinc-900">Edit Survey Title</h2>
            <p className="mb-4 text-sm text-zinc-500">
              Titles must be unique for your company.
            </p>
            <input
              type="text"
              autoFocus
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRenameTitle()
                if (e.key === "Escape" && !renaming) setEditingSurvey(null)
              }}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            />
            {renameError && <p className="mt-2 text-xs text-red-600">{renameError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setEditingSurvey(null)}
                disabled={renaming}
                className="rounded-xl px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRenameTitle}
                disabled={renaming || !editingTitle.trim()}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {renaming ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
