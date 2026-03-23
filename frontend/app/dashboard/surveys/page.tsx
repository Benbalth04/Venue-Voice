"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
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
  unpublishSurvey,
  unarchiveSurvey,
  duplicateSurvey,
  updateSurveyMeta,
  extractErrorMessage,
  type SurveyListItem,
} from "@/lib/api/client"
import { defaultSurvey } from "@/lib/survey/defaultSurvey"
import { surveyToApi } from "@/lib/survey/richText"
import { useConfirm } from "@/components/ui/ConfirmDialog"
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable"

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
  onDuplicate,
  onConfirmUnpublish,
  onConfirmArchive,
  onConfirmUnarchive,
}: {
  survey: SurveyListItem
  onPublish: (id: string) => Promise<void>
  onDuplicate: (id: string) => Promise<void>
  onConfirmUnpublish: (id: string) => Promise<void>
  onConfirmArchive: (id: string) => Promise<void>
  onConfirmUnarchive: (id: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, right: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const router = useRouter()

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    setPosition({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    })
  }, [open])

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden />
            <div
              className="fixed z-20 w-44 rounded-xl border border-zinc-200 bg-white py-1 shadow-lg"
              style={{ top: position.top, right: position.right }}
            >
            <button
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm ${
                survey.status === "active"
                  ? "cursor-not-allowed text-zinc-400"
                  : "text-zinc-700 hover:bg-zinc-50"
              }`}
              onClick={() => {
                setOpen(false)
                if (survey.status !== "active") {
                  router.push(`/dashboard/surveys/${survey.id}`)
                }
              }}
              disabled={survey.status === "active"}
              title={survey.status === "active" ? "Unpublish first to edit" : "Edit survey"}
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
            {survey.status === "active" && (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-amber-700 hover:bg-amber-50"
                onClick={async () => {
                  setOpen(false)
                  await onConfirmUnpublish(survey.id)
                }}
              >
                <Globe className="h-4 w-4" /> Unpublish
              </button>
            )}
            {survey.status === "archived" && (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-50"
                onClick={async () => {
                  setOpen(false)
                  await onConfirmUnarchive(survey.id)
                }}
              >
                <Archive className="h-4 w-4" /> Unarchive
              </button>
            )}
            {survey.status === "draft" && (
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
          </>,
          document.body
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
      setError(extractErrorMessage(err, "Failed to load surveys"))
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
      setCreateError(extractErrorMessage(err, "Failed to create survey"))
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

  async function handleUnpublish(id: string) {
    const token = await getToken()
    if (!token) return
    const updated = await unpublishSurvey(token, id)
    setSurveys((prev) => prev.map((s) => (s.id === id ? { ...s, ...updated } : s)))
  }

  async function handleUnarchive(id: string) {
    const token = await getToken()
    if (!token) return
    const updated = await unarchiveSurvey(token, id)
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

  async function handleConfirmUnpublish(id: string) {
    const ok = await confirm({
      title: "Unpublish Survey",
      message: "Are you sure you want to unpublish this survey? This will:\n- Make the survey inaccessible to respondents\n- Deactivate all assignments of this survey to locations\n- Disable any flows for this survey\nAre you sure you want to continue?",
      confirmLabel: "Unpublish",
      cancelLabel: "Cancel",
      variant: "danger",
    })
    if (ok) await handleUnpublish(id)
  }

  async function handleConfirmUnarchive(id: string) {
    const ok = await confirm({
      title: "Unarchive survey",
      message: "Restore this survey to draft? You can edit and publish it again.",
      confirmLabel: "Unarchive",
      cancelLabel: "Cancel",
    })
    if (ok) await handleUnarchive(id)
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
      setRenameError(extractErrorMessage(err, "Failed to update title"))
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

  type SortKey = "title" | "status" | "last_edited_by" | "updated_at"
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
      case "last_edited_by":
        cmp = (a.last_edited_by ?? "").localeCompare(b.last_edited_by ?? "")
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
      setSortDir(key === "title" || key === "status" || key === "last_edited_by" ? "asc" : "desc")
    }
  }

  const columns: DataTableColumn<SurveyListItem>[] = [
    {
      key: "title",
      label: "Title",
      sortable: true,
      align: "center",
      render: (s) => (
        <div className="flex items-center justify-center gap-2">
          {s.status === "active" ? (
            <span className="break-words font-medium text-zinc-900">{s.title}</span>
          ) : (
            <Link
              href={`/dashboard/surveys/${s.id}`}
              className="break-words font-medium text-zinc-900 hover:text-violet-700 hover:underline"
            >
              {s.title}
            </Link>
          )}
          {s.status !== "active" && (
            <button
              type="button"
              onClick={() => openTitleModal(s)}
              className="flex-shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              aria-label={`Edit title for ${s.title}`}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      align: "center",
      render: (s) => <StatusBadge status={s.status} />,
    },
    {
      key: "last_edited_by",
      label: "Last edited by",
      sortable: true,
      align: "center",
      render: (s) => (
        <span className="break-words text-zinc-500">{s.last_edited_by ?? "—"}</span>
      ),
    },
    {
      key: "updated_at",
      label: "Last updated",
      sortable: true,
      align: "center",
      render: (s) => (
        <span className="break-words text-zinc-500">{formatDate(s.updated_at)}</span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      sortable: false,
      align: "center",
      render: (s) => (
        <ActionsMenu
          survey={s}
          onPublish={handlePublish}
          onDuplicate={handleDuplicate}
          onConfirmUnpublish={handleConfirmUnpublish}
          onConfirmArchive={handleConfirmArchive}
          onConfirmUnarchive={handleConfirmUnarchive}
        />
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {ConfirmDialogRender}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Surveys</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            Create and manage your surveys.
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
        <DataTable<SurveyListItem>
          data={sortedSurveys}
          columns={columns}
          getRowKey={(s) => s.id}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={(key) => toggleSort(key as SortKey)}
        />
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
