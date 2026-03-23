"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, Pencil, Plus, Save, Trash2, UserPlus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/ui/LoadingSpinner"
import { Card } from "@/components/ui/card"
import { useConfirm } from "@/components/ui/ConfirmDialog"
import { supabase } from "@/lib/supabase/client"
import {
  createNotificationGroup,
  deleteNotificationGroup,
  extractErrorMessage,
  fetchNotificationGroups,
  type NotificationGroupResponse,
  updateNotificationGroup,
} from "@/lib/api/client"

type MemberDraft = {
  localId: string
  id?: string
  name: string
  email: string
}

type GroupDraft = {
  id?: string
  name: string
  members: MemberDraft[]
}

function createMemberDraft(member?: NotificationGroupResponse["members"][number]): MemberDraft {
  return {
    localId: crypto.randomUUID(),
    id: member?.id,
    name: member?.name ?? "",
    email: member?.email ?? "",
  }
}

function draftFromGroup(group: NotificationGroupResponse): GroupDraft {
  return {
    id: group.id,
    name: group.name,
    members: group.members.map((member) => createMemberDraft(member)),
  }
}

function serializeDraft(draft: GroupDraft) {
  return JSON.stringify({
    id: draft.id ?? null,
    name: draft.name,
    members: draft.members.map((member) => ({
      name: member.name,
      email: member.email,
    })),
  })
}

export default function NotificationGroupsPage() {
  const { confirm, ConfirmDialogRender } = useConfirm()
  const [groups, setGroups] = useState<NotificationGroupResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<GroupDraft | null>(null)
  const [draftSnapshot, setDraftSnapshot] = useState<string | null>(null)

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
      const groupRows = await fetchNotificationGroups(token)
      setGroups(groupRows)
      setDraft(null)
      setDraftSnapshot(null)
      setError(null)
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to load notification groups"))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const selectedGroupMemberCount = useMemo(() => draft?.members.length ?? 0, [draft])
  const hasUnsavedChanges = useMemo(
    () => (draft ? (!draft.id || serializeDraft(draft) !== draftSnapshot) : false),
    [draft, draftSnapshot],
  )

  async function confirmDiscardChanges() {
    if (!hasUnsavedChanges) return true
    return confirm({
      title: "You have unsaved changes",
      message: "Discard the current notification group changes?",
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
      variant: "danger",
    })
  }

  async function openCreateDraft() {
    const proceed = await confirmDiscardChanges()
    if (!proceed) return
    const nextDraft = {
      name: "",
      members: [],
    }
    setDraft(nextDraft)
    setDraftSnapshot(null)
    setError(null)
  }

  async function openGroup(group: NotificationGroupResponse) {
    const proceed = await confirmDiscardChanges()
    if (!proceed) return
    const nextDraft = draftFromGroup(group)
    setDraft(nextDraft)
    setDraftSnapshot(serializeDraft(nextDraft))
    setError(null)
  }

  async function saveDraft() {
    const token = await getToken()
    if (!token || !draft) return
    setSaving(true)
    try {
      const trimmedName = draft.name.trim()
      const members = draft.members
        .map((member) => ({
          name: member.name.trim(),
          email: member.email.trim(),
        }))
        .filter((member) => member.name && member.email)

      if (!trimmedName) {
        setError("Group name is required")
        return
      }

      const nameConflict = groups.some(
        (g) =>
          g.id !== draft.id && g.name.trim().toLowerCase() === trimmedName.toLowerCase(),
      )
      if (nameConflict) {
        setError("A notification group with this name already exists.")
        return
      }

      if (members.length === 0) {
        setError("Add at least one member with a name and email.")
        return
      }

      const duplicateEmails = new Set<string>()
      for (const member of members) {
        const key = member.email.toLowerCase()
        if (duplicateEmails.has(key)) {
          setError("Member emails must be unique within a group")
          return
        }
        duplicateEmails.add(key)
      }

      if (draft.id) {
        const updated = await updateNotificationGroup(token, draft.id, {
          name: trimmedName,
          members,
        })
        setGroups((current) => current.map((group) => (group.id === updated.id ? updated : group)))
        const nextDraft = draftFromGroup(updated)
        setDraft(nextDraft)
        setDraftSnapshot(serializeDraft(nextDraft))
      } else {
        const created = await createNotificationGroup(token, { name: trimmedName })
        const saved = await updateNotificationGroup(token, created.id, {
          name: trimmedName,
          members,
        })
        setGroups((current) => [saved, ...current])
        const nextDraft = draftFromGroup(saved)
        setDraft(nextDraft)
        setDraftSnapshot(serializeDraft(nextDraft))
      }
      setError(null)
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to save notification group"))
    } finally {
      setSaving(false)
    }
  }

  function addMemberRow() {
    setDraft((current) =>
      current
        ? {
            ...current,
            members: [...current.members, createMemberDraft()],
          }
        : current,
    )
  }

  function removeMemberRow(localId: string) {
    setDraft((current) =>
      current
        ? {
            ...current,
            members: current.members.filter((member) => member.localId !== localId),
          }
        : current,
    )
  }

  async function handleDelete(group: NotificationGroupResponse) {
    const ok = await confirm({
      title: `Delete Notification Group - ${group.name}`,
      message: `Are you sure you want to delete this notification group? This cannot be undone.`,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      variant: "danger",
    })
    if (!ok) return

    const token = await getToken()
    if (!token) return
    setSaving(true)
    try {
      await deleteNotificationGroup(token, group.id)
      setGroups((current) => current.filter((item) => item.id !== group.id))
      setDraft((current) => (current?.id === group.id ? null : current))
      setDraftSnapshot((current) => (draft?.id === group.id ? null : current))
    } catch (err) {
      setError(extractErrorMessage(err, "Failed to delete notification group"))
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {ConfirmDialogRender}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Notification Groups</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Create mailing lists that receive notifications for important survey responses or trends.
          </p>
        </div>
        <Button onClick={() => void openCreateDraft()}>
          <Plus className="mr-1.5 h-4 w-4" />
          Create group
        </Button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900">Current groups</h2>
            <span className="text-sm text-zinc-500">{groups.length}</span>
          </div>

          {groups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
              No notification groups yet.
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => (
                <div
                  key={group.id}
                  role="button"
                  tabIndex={0}
                    onClick={() => void openGroup(group)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      void openGroup(group)
                    }
                  }}
                  className={[
                    "rounded-2xl border px-4 py-3 transition-colors",
                    draft?.id === group.id
                      ? "border-violet-300 bg-violet-50"
                      : "border-zinc-200 bg-white hover:border-violet-200 hover:bg-violet-50/40",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-900">{group.name}</p>
                      <p className="mt-1 text-sm text-zinc-500">{group.members.length} members</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                        onClick={(event) => {
                          event.stopPropagation()
                          void openGroup(group)
                        }}
                        aria-label={`Edit ${group.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        className="rounded-lg p-2 text-zinc-400 hover:bg-red-50 hover:text-red-600"
                        onClick={(event) => {
                          event.stopPropagation()
                          void handleDelete(group)
                        }}
                        aria-label={`Delete ${group.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div>
          {draft ? (
            <Card>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-zinc-900">
                    {draft.id ? "Edit group" : "Create group"}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Update the group name and manage the people who receive email notifications.
                  </p>
                </div>

                <div className="flex flex-shrink-0 gap-2">
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      const proceed = await confirmDiscardChanges()
                      if (!proceed) return
                      setDraft(null)
                      setDraftSnapshot(null)
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                  <Button onClick={() => void saveDraft()} disabled={saving}>
                    {saving ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-1.5 h-4 w-4" />
                    )}
                    Save
                  </Button>
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Group name
                </span>
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                  value={draft.name}
                  onChange={(event) =>
                    setDraft((current) => (current ? { ...current, name: event.target.value } : current))
                  }
                />
              </label>

              <div className="mt-6">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">Members</h3>
                    <p className="mt-1 text-sm text-zinc-500">
                      {selectedGroupMemberCount} {selectedGroupMemberCount === 1 ? "person" : "people"} in this group
                    </p>
                  </div>
                  <Button variant="outline" onClick={addMemberRow}>
                    <UserPlus className="mr-1.5 h-4 w-4" />
                    Add person
                  </Button>
                </div>

                {draft.members.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
                    No members yet. Add the first recipient to this group.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {draft.members.map((member, index) => (
                      <div key={member.localId} className="rounded-2xl border border-zinc-200 p-4">
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                          <input
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                            placeholder="Person name"
                            value={member.name}
                            onChange={(event) =>
                              setDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      members: current.members.map((item) =>
                                        item.localId === member.localId ? { ...item, name: event.target.value } : item,
                                      ),
                                    }
                                  : current,
                              )
                            }
                          />
                          <input
                            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                            placeholder="email@example.com"
                            value={member.email}
                            onChange={(event) =>
                              setDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      members: current.members.map((item) =>
                                        item.localId === member.localId ? { ...item, email: event.target.value } : item,
                                      ),
                                    }
                                  : current,
                              )
                            }
                          />
                          <button
                            type="button"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-zinc-400 hover:bg-red-50 hover:text-red-600"
                            onClick={() => removeMemberRow(member.localId)}
                            aria-label={`Remove member ${index + 1}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card>
              <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-12 text-center text-sm text-zinc-500">
                Select a notification group on the left to edit its members, or create a new group.
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
