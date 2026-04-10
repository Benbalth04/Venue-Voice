"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Settings, X, Loader2, ArrowRightLeft, ShieldPlus, Check } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase/client"
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable"
import { ConfirmDialog } from "@/components/ui/ConfirmDialog"
import {
  fetchCompanyUsers,
  fetchSubscriptionStatus,
  inviteCompanyUser,
  getViewerPermissions,
  setViewerPermissions,
  removeCompanyUser,
  transferOwnership,
  promoteToAdmin,
  extractErrorMessage,
  type CompanyMemberResponse,
} from "@/lib/api/client"
import { fetchSurveys, fetchLocations } from "@/lib/api/client"

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

function formatInTimezone(
  isoDate: string | null | undefined,
  timezone: string | null | undefined,
  options: Intl.DateTimeFormatOptions
): string {
  if (!isoDate) return "Never"
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return "—"

  try {
    return new Intl.DateTimeFormat(undefined, {
      ...options,
      timeZone: timezone || undefined,
    }).format(date)
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(date)
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const router = useRouter()
  const { activeMembership, loading } = useAuth()

  // Redirect viewers
  useEffect(() => {
    if (
      !loading &&
      activeMembership &&
      activeMembership.role !== "company_admin" &&
      activeMembership.role !== "company_owner"
    ) {
      router.replace("/dashboard")
    }
  }, [loading, activeMembership, router])

  const [members, setMembers] = useState<CompanyMemberResponse[]>([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [membersError, setMembersError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [canInviteUsers, setCanInviteUsers] = useState(true)

  const [showInviteModal, setShowInviteModal] = useState(false)
  const [permissionsMember, setPermissionsMember] = useState<CompanyMemberResponse | null>(null)

  async function loadMembers() {
    const token = await getToken()
    if (!token) return
    setMembersLoading(true)
    setMembersError(null)
    try {
      const [data, status] = await Promise.all([
        fetchCompanyUsers(token),
        fetchSubscriptionStatus(token),
      ])
      setMembers(data)
      setCanInviteUsers(status.can_invite_users)
    } catch (e) {
      setMembersError(extractErrorMessage(e))
    } finally {
      setMembersLoading(false)
    }
  }

  useEffect(() => {
    loadMembers()
  }, [])

  useEffect(() => {
    if (!successMessage) return
    const timer = window.setTimeout(() => setSuccessMessage(null), 4000)
    return () => window.clearTimeout(timer)
  }, [successMessage])

  const isOwner = activeMembership?.role === "company_owner"
  const memberColumns: DataTableColumn<CompanyMemberResponse>[] = [
    {
      key: "name",
      label: "Name",
      align: "left",
      render: (m) => (
        <span className="font-medium text-zinc-900">
          {m.first_name} {m.last_name}
        </span>
      ),
    },
    {
      key: "email",
      label: "Email",
      align: "left",
      render: (m) => m.email,
      cellClassName: "text-zinc-600",
    },
    {
      key: "role",
      label: "Role",
      align: "left",
      render: (m) => (
        <span
          className={[
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            m.role === "company_owner"
              ? "bg-amber-100 text-amber-700"
              : m.role === "company_admin"
                ? "bg-violet-100 text-violet-700"
                : "bg-zinc-100 text-zinc-700",
          ].join(" ")}
        >
          {m.role === "company_owner"
            ? "Owner"
            : m.role === "company_admin"
              ? "Admin"
              : "Viewer"}
        </span>
      ),
    },
    {
      key: "joined_on",
      label: "Joined On",
      align: "left",
      render: (m) =>
        formatInTimezone(m.created_at, m.timezone, {
          month: "short",
          day: "numeric",
        }),
      cellClassName: "text-zinc-500",
    },
    {
      key: "last_login",
      label: "Last Login",
      align: "left",
      render: (m) =>
        formatInTimezone(m.last_login_at, m.timezone, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
      cellClassName: "text-zinc-500",
    },
    {
      key: "invited_by",
      label: "Invited By",
      align: "left",
      render: (m) => m.invited_by_name ?? "—",
      cellClassName: "text-zinc-500",
    },
    {
      key: "actions",
      label: "",
      align: "right",
      headerClassName: "w-[1%]",
      render: (m) => (
        <div className="flex items-center justify-end gap-2">
          {m.role === "viewer" && (
            <button
              type="button"
              title="Edit permissions"
              onClick={() => {
                setSuccessMessage(null)
                setPermissionsMember(m)
              }}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              <Settings className="h-4 w-4" />
            </button>
          )}
          {m.role === "viewer" && (
            <PromoteToAdminButton
              member={m}
              onPromoted={(msg) => {
                setSuccessMessage(msg)
                loadMembers()
              }}
            />
          )}
          {isOwner && m.role === "company_admin" && (
            <TransferOwnershipButton
              member={m}
              onTransferred={loadMembers}
            />
          )}
          {m.role !== "company_owner" &&
            !(m.role === "company_admin" && !isOwner) && (
              <RemoveMemberButton
                member={m}
                onRemoved={loadMembers}
              />
            )}
        </div>
      ),
    },
  ]

  if (
    loading ||
    (activeMembership &&
      activeMembership.role !== "company_admin" &&
      activeMembership.role !== "company_owner")
  ) {
    return null
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">User Management</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage who has access to your company.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            disabled={!canInviteUsers}
            onClick={() => {
              setSuccessMessage(null)
              setShowInviteModal(true)
            }}
            title={!canInviteUsers ? "User limit reached — upgrade your plan to invite more members" : undefined}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {isOwner ? "Invite Member" : "Invite Viewer"}
          </button>
          {!canInviteUsers && (
            <p className="text-xs text-zinc-500">User limit reached — upgrade to add more</p>
          )}
        </div>
      </div>

      {membersError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {membersError}
        </div>
      )}
      {successMessage && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      )}

      <DataTable
        data={members}
        columns={memberColumns}
        getRowKey={(m) => m.membership_id}
        loading={membersLoading}
        emptyMessage="No users found."
      />

      {showInviteModal && (
        <InviteModal
          isOwner={isOwner}
          onClose={() => setShowInviteModal(false)}
          onInvited={(message) => {
            setSuccessMessage(message)
            setShowInviteModal(false)
            loadMembers()
          }}
        />
      )}

      {permissionsMember && (
        <PermissionsModal
          member={permissionsMember}
          onClose={() => setPermissionsMember(null)}
          onSaved={(message) => {
            setSuccessMessage(message)
            setPermissionsMember(null)
            loadMembers()
          }}
        />
      )}
    </div>
  )
}

// ─── Remove button ────────────────────────────────────────────────────────────

function RemoveMemberButton({
  member,
  onRemoved,
}: {
  member: CompanyMemberResponse
  onRemoved: () => void
}) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [dialogNonce, setDialogNonce] = useState(0)
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openModal() {
    setError(null)
    setDialogNonce((n) => n + 1)
    setShowConfirm(true)
  }

  function closeModal() {
    if (removing) return
    setShowConfirm(false)
    setError(null)
  }

  async function onConfirmRemove() {
    const token = await getToken()
    if (!token) return
    setRemoving(true)
    setError(null)
    try {
      await removeCompanyUser(token, member.membership_id)
      setShowConfirm(false)
      onRemoved()
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        title="Remove member"
        onClick={openModal}
        className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500"
      >
        <Trash2 className="h-4 w-4" />
      </button>

      <ConfirmDialog
        key={dialogNonce}
        open={showConfirm}
        title={`Remove ${member.first_name} ${member.last_name}?`}
        message="This will revoke their access immediately. This action cannot be undone."
        confirmLabel="Remove Member"
        cancelLabel="Cancel"
        variant="danger"
        requiredConfirmText="Confirm"
        errorMessage={error}
        pending={removing}
        onCancel={closeModal}
        onConfirm={onConfirmRemove}
      />
    </>
  )
}

// ─── Transfer ownership button ────────────────────────────────────────────────

function TransferOwnershipButton({
  member,
  onTransferred,
}: {
  member: CompanyMemberResponse
  onTransferred: () => void
}) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [dialogNonce, setDialogNonce] = useState(0)
  const [transferring, setTransferring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openModal() {
    setError(null)
    setDialogNonce((n) => n + 1)
    setShowConfirm(true)
  }

  function closeModal() {
    if (transferring) return
    setShowConfirm(false)
    setError(null)
  }

  async function onConfirmTransfer() {
    const token = await getToken()
    if (!token) return
    setTransferring(true)
    setError(null)
    try {
      await transferOwnership(token, member.membership_id)
      setShowConfirm(false)
      onTransferred()
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setTransferring(false)
    }
  }

  return (
    <>
      <button
        type="button"
        title="Transfer ownership"
        onClick={openModal}
        className="rounded-lg p-1.5 text-zinc-400 hover:bg-amber-50 hover:text-amber-600"
      >
        <ArrowRightLeft className="h-4 w-4" />
      </button>

      <ConfirmDialog
        key={dialogNonce}
        open={showConfirm}
        title={`Transfer ownership to ${member.first_name} ${member.last_name}?`}
        message="They will become the company owner. You will become a company admin."
        confirmLabel="Transfer Ownership"
        cancelLabel="Cancel"
        variant="warning"
        requiredConfirmText="Confirm"
        errorMessage={error}
        pending={transferring}
        onCancel={closeModal}
        onConfirm={onConfirmTransfer}
      />
    </>
  )
}

// ─── Promote to admin button ──────────────────────────────────────────────────

function PromoteToAdminButton({
  member,
  onPromoted,
}: {
  member: CompanyMemberResponse
  onPromoted: (message: string) => void
}) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [promoting, setPromoting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function openModal() {
    setError(null)
    setShowConfirm(true)
  }

  function closeModal() {
    if (promoting) return
    setShowConfirm(false)
    setError(null)
  }

  async function onConfirmPromote() {
    const token = await getToken()
    if (!token) return
    setPromoting(true)
    setError(null)
    try {
      await promoteToAdmin(token, member.membership_id)
      setShowConfirm(false)
      onPromoted(`${member.first_name} ${member.last_name} is now a company admin.`)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setPromoting(false)
    }
  }

  return (
    <>
      <button
        type="button"
        title="Promote to admin"
        onClick={openModal}
        className="rounded-lg p-1.5 text-zinc-400 hover:bg-violet-50 hover:text-violet-600"
      >
        <ShieldPlus className="h-4 w-4" />
      </button>

      <ConfirmDialog
        open={showConfirm}
        title={`Promote ${member.first_name} ${member.last_name} to admin?`}
        message="They will become a company admin with full access to all surveys and locations."
        confirmLabel="Promote to Admin"
        cancelLabel="Cancel"
        variant="default"
        errorMessage={error}
        pending={promoting}
        onCancel={closeModal}
        onConfirm={onConfirmPromote}
      />
    </>
  )
}

// ─── Invite modal ─────────────────────────────────────────────────────────────

function InviteModal({
  isOwner,
  onClose,
  onInvited,
}: {
  isOwner: boolean
  onClose: () => void
  onInvited: (message: string) => void
}) {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"viewer" | "company_admin">("viewer")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const token = await getToken()
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      await inviteCompanyUser(token, { first_name: firstName, last_name: lastName, email, role })
      onInvited(`Invite sent to ${email}.`)
    } catch (err) {
      setError(extractErrorMessage(err, "Could not send invite."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">
              {isOwner ? "Invite Member" : "Invite Viewer"}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              An invitation email will be sent to their inbox.
            </p>
          </div>
          <button type="button" onClick={onClose} className="ml-4 flex-shrink-0 text-zinc-400 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form id="invite-form" onSubmit={onSubmit} className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">First name</label>
              <input
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">Last name</label>
              <input
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>

          {isOwner && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-700">Role</label>
              <div className="inline-flex w-full rounded-xl border border-zinc-200 p-0.5">
                {(["viewer", "company_admin"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={[
                      "flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors",
                      role === r
                        ? "bg-violet-600 text-white shadow-sm"
                        : "text-zinc-600 hover:text-zinc-900",
                    ].join(" ")}
                  >
                    {r === "viewer" ? "Viewer" : "Admin"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </form>

        <div className="flex justify-end gap-2 border-t border-zinc-100 bg-zinc-50/60 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="invite-form"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Send Invite
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Permissions modal ────────────────────────────────────────────────────────

function PermissionsModal({
  member,
  onClose,
  onSaved,
}: {
  member: CompanyMemberResponse
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [surveys, setSurveys] = useState<{ id: string; name: string }[]>([])
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
  // Each entry is "locationId|surveyId" — a pair is selected when the user has
  // access to that survey at that location.
  const [selectedPairs, setSelectedPairs] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const token = await getToken()
      if (!token) return
      try {
        const [p, sv, lc] = await Promise.all([
          getViewerPermissions(token, member.membership_id),
          fetchSurveys(token),
          fetchLocations(token),
        ])
        const surveyList = sv.map((s) => ({ id: s.id, name: s.name }))
        const locationList = lc.map((l) => ({ id: l.id, name: l.name }))
        setSurveys(surveyList)
        setLocations(locationList)

        // Derive selected pairs from the saved permissions.
        // all_surveys / all_locations expand to every item in the respective list.
        const allowedSurveys = p.all_surveys
          ? surveyList.map((s) => s.id)
          : p.survey_ids
        const allowedLocations = p.all_locations
          ? locationList.map((l) => l.id)
          : p.location_ids
        const pairs = new Set<string>()
        for (const locId of allowedLocations) {
          for (const survId of allowedSurveys) {
            pairs.add(`${locId}|${survId}`)
          }
        }
        setSelectedPairs(pairs)
      } catch (e) {
        setError(extractErrorMessage(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [member.membership_id])

  // ── Derived state helpers ──────────────────────────────────────────────────

  function isSelected(locationId: string, surveyId: string) {
    return selectedPairs.has(`${locationId}|${surveyId}`)
  }

  function isRowAllSelected(locationId: string) {
    return surveys.length > 0 && surveys.every((s) => selectedPairs.has(`${locationId}|${s.id}`))
  }

  function isColAllSelected(surveyId: string) {
    return locations.length > 0 && locations.every((l) => selectedPairs.has(`${l.id}|${surveyId}`))
  }

  function isAllSelected() {
    return (
      surveys.length > 0 &&
      locations.length > 0 &&
      locations.every((l) => surveys.every((s) => selectedPairs.has(`${l.id}|${s.id}`)))
    )
  }

  // ── Toggle helpers ─────────────────────────────────────────────────────────

  function toggleCell(locationId: string, surveyId: string) {
    const key = `${locationId}|${surveyId}`
    const next = new Set(selectedPairs)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelectedPairs(next)
  }

  function toggleRow(locationId: string) {
    const next = new Set(selectedPairs)
    if (isRowAllSelected(locationId)) {
      for (const s of surveys) next.delete(`${locationId}|${s.id}`)
    } else {
      for (const s of surveys) next.add(`${locationId}|${s.id}`)
    }
    setSelectedPairs(next)
  }

  function toggleCol(surveyId: string) {
    const next = new Set(selectedPairs)
    if (isColAllSelected(surveyId)) {
      for (const l of locations) next.delete(`${l.id}|${surveyId}`)
    } else {
      for (const l of locations) next.add(`${l.id}|${surveyId}`)
    }
    setSelectedPairs(next)
  }

  function toggleAll() {
    if (isAllSelected()) {
      setSelectedPairs(new Set())
    } else {
      const next = new Set<string>()
      for (const l of locations)
        for (const s of surveys)
          next.add(`${l.id}|${s.id}`)
      setSelectedPairs(next)
    }
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function onSave() {
    const token = await getToken()
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      // Derive independent survey_ids / location_ids from the selected pairs.
      const surveyIds = new Set<string>()
      const locationIds = new Set<string>()
      for (const pair of selectedPairs) {
        const sep = pair.indexOf("|")
        locationIds.add(pair.slice(0, sep))
        surveyIds.add(pair.slice(sep + 1))
      }
      const all_surveys = surveyIds.size === surveys.length
      const all_locations = locationIds.size === locations.length
      await setViewerPermissions(token, member.membership_id, {
        all_surveys,
        all_locations,
        survey_ids: all_surveys ? [] : Array.from(surveyIds),
        location_ids: all_locations ? [] : Array.from(locationIds),
      })
      onSaved(`Permissions updated for ${member.first_name} ${member.last_name}.`)
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const allSelected = isAllSelected()
  const hasData = surveys.length > 0 && locations.length > 0
  const totalPairs = surveys.length * locations.length
  const selectedCount = selectedPairs.size

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl">

        {/* Header */}
        <div className="flex items-start justify-between border-b border-zinc-100 px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">
              Permissions — {member.first_name} {member.last_name}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Select which surveys and locations this viewer can access.
            </p>
          </div>
          <div className="ml-4 flex flex-shrink-0 items-center gap-3">
            {!loading && hasData && (
              <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700">
                {selectedCount} / {totalPairs} selected
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : !hasData ? (
            <p className="text-sm text-zinc-500">
              {surveys.length === 0 && locations.length === 0
                ? "No surveys or locations found."
                : surveys.length === 0
                  ? "No surveys found."
                  : "No locations found."}
            </p>
          ) : (
            /* Horizontally scrollable grid — sticky first column for mobile */
            <div className="overflow-x-auto rounded-xl border border-zinc-200">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">

                    {/* Top-left: location label + toggle all */}
                    <th className="sticky left-0 z-20 min-w-[148px] border-r border-zinc-200 bg-zinc-50 px-3 py-3 text-left font-normal">
                      <div className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                        Location
                      </div>
                      <button
                        type="button"
                        onClick={toggleAll}
                        className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium transition-colors hover:bg-zinc-100"
                      >
                        <span
                          className={[
                            "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors",
                            allSelected
                              ? "border-violet-500 bg-violet-500"
                              : "border-zinc-300 bg-white",
                          ].join(" ")}
                        >
                          {allSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                        </span>
                        <span className={allSelected ? "text-violet-700" : "text-zinc-500"}>
                          Select all
                        </span>
                      </button>
                    </th>

                    {/* Column headers — one per survey */}
                    {surveys.map((s) => {
                      const colAll = isColAllSelected(s.id)
                      return (
                        <th
                          key={s.id}
                          className="min-w-[110px] border-r border-zinc-200 px-2 py-3 text-center font-normal last:border-r-0"
                        >
                          <button
                            type="button"
                            onClick={() => toggleCol(s.id)}
                            title={s.name}
                            className="group flex w-full flex-col items-center gap-1.5 rounded-lg px-1 py-1 text-xs transition-colors hover:bg-zinc-100"
                          >
                            <span
                              className={[
                                "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors",
                                colAll
                                  ? "border-violet-500 bg-violet-500"
                                  : "border-zinc-300 bg-white group-hover:border-violet-300",
                              ].join(" ")}
                            >
                              {colAll && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                            </span>
                            <span
                              className={[
                                "line-clamp-2 max-w-[96px] text-center leading-tight",
                                colAll ? "font-medium text-violet-700" : "text-zinc-600",
                              ].join(" ")}
                            >
                              {s.name}
                            </span>
                          </button>
                        </th>
                      )
                    })}
                  </tr>
                </thead>

                <tbody>
                  {locations.map((l, li) => {
                    const rowAll = isRowAllSelected(l.id)
                    const rowBg = li % 2 === 0 ? "bg-white" : "bg-zinc-50/60"
                    return (
                      <tr key={l.id} className={rowBg}>

                        {/* Row header — location name + row-toggle */}
                        <td
                          className={[
                            "sticky left-0 z-10 border-r border-zinc-200 px-3 py-2",
                            rowBg,
                          ].join(" ")}
                        >
                          <button
                            type="button"
                            onClick={() => toggleRow(l.id)}
                            title={l.name}
                            className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-zinc-100"
                          >
                            <span
                              className={[
                                "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border transition-colors",
                                rowAll
                                  ? "border-violet-500 bg-violet-500"
                                  : "border-zinc-300 bg-white group-hover:border-violet-300",
                              ].join(" ")}
                            >
                              {rowAll && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                            </span>
                            <span
                              className={[
                                "max-w-[104px] truncate leading-tight",
                                rowAll ? "font-medium text-violet-700" : "font-medium text-zinc-700",
                              ].join(" ")}
                            >
                              {l.name}
                            </span>
                          </button>
                        </td>

                        {/* Cells */}
                        {surveys.map((s) => {
                          const checked = isSelected(l.id, s.id)
                          return (
                            <td
                              key={s.id}
                              className="border-r border-zinc-200 px-2 py-2.5 text-center last:border-r-0"
                            >
                              <button
                                type="button"
                                onClick={() => toggleCell(l.id, s.id)}
                                aria-label={`${l.name} × ${s.name}`}
                                className={[
                                  "mx-auto flex h-5 w-5 items-center justify-center rounded border transition-colors",
                                  checked
                                    ? "border-violet-500 bg-violet-500 hover:border-violet-600 hover:bg-violet-600"
                                    : "border-zinc-300 bg-white hover:border-violet-400 hover:bg-violet-50",
                                ].join(" ")}
                              >
                                {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                              </button>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {error && (
            <p className="mt-4 text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-zinc-100 bg-zinc-50/60 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Permissions
          </button>
        </div>
      </div>
    </div>
  )
}
