"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Settings, X, Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/lib/supabase/client"
import {
  fetchCompanyUsers,
  inviteCompanyUser,
  getViewerPermissions,
  setViewerPermissions,
  removeCompanyUser,
  extractErrorMessage,
  type CompanyMemberResponse,
  type ViewerPermissionsResponse,
} from "@/lib/api/client"
import { fetchSurveys, fetchLocations } from "@/lib/api/client"

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const router = useRouter()
  const { activeMembership, loading } = useAuth()

  // Redirect viewers
  useEffect(() => {
    if (!loading && activeMembership && activeMembership.role !== "company_admin") {
      router.replace("/dashboard")
    }
  }, [loading, activeMembership, router])

  const [members, setMembers] = useState<CompanyMemberResponse[]>([])
  const [membersLoading, setMembersLoading] = useState(true)
  const [membersError, setMembersError] = useState<string | null>(null)

  const [showInviteModal, setShowInviteModal] = useState(false)
  const [permissionsMember, setPermissionsMember] = useState<CompanyMemberResponse | null>(null)

  async function loadMembers() {
    const token = await getToken()
    if (!token) return
    setMembersLoading(true)
    setMembersError(null)
    try {
      const data = await fetchCompanyUsers(token)
      setMembers(data)
    } catch (e) {
      setMembersError(extractErrorMessage(e))
    } finally {
      setMembersLoading(false)
    }
  }

  useEffect(() => {
    loadMembers()
  }, [])

  if (loading || (activeMembership && activeMembership.role !== "company_admin")) {
    return null
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Team Members</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Manage who has access to your company&apos;s data.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowInviteModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
        >
          <Plus className="h-4 w-4" />
          Invite Viewer
        </button>
      </div>

      {membersError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {membersError}
        </div>
      )}

      {membersLoading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Name</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Email</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Role</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-500">Added</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {members.map((m) => (
                <tr key={m.membership_id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium text-zinc-900">
                    {m.first_name} {m.last_name}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{m.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={[
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        m.role === "company_admin"
                          ? "bg-violet-100 text-violet-700"
                          : "bg-zinc-100 text-zinc-700",
                      ].join(" ")}
                    >
                      {m.role === "company_admin" ? "Admin" : "Viewer"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{m.created_at}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {m.role === "viewer" && (
                        <button
                          type="button"
                          title="Edit permissions"
                          onClick={() => setPermissionsMember(m)}
                          className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                        >
                          <Settings className="h-4 w-4" />
                        </button>
                      )}
                      {m.role !== "company_admin" && (
                        <RemoveMemberButton
                          member={m}
                          onRemoved={loadMembers}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showInviteModal && (
        <InviteModal
          onClose={() => setShowInviteModal(false)}
          onInvited={() => { setShowInviteModal(false); loadMembers() }}
        />
      )}

      {permissionsMember && (
        <PermissionsModal
          member={permissionsMember}
          onClose={() => setPermissionsMember(null)}
          onSaved={() => setPermissionsMember(null)}
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
  const [removing, setRemoving] = useState(false)

  async function onRemove() {
    if (!confirm(`Remove ${member.first_name} ${member.last_name}?`)) return
    const token = await getToken()
    if (!token) return
    setRemoving(true)
    try {
      await removeCompanyUser(token, member.membership_id)
      onRemoved()
    } catch (e) {
      alert(extractErrorMessage(e))
    } finally {
      setRemoving(false)
    }
  }

  return (
    <button
      type="button"
      title="Remove member"
      onClick={onRemove}
      disabled={removing}
      className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
    >
      {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </button>
  )
}

// ─── Invite modal ─────────────────────────────────────────────────────────────

function InviteModal({
  onClose,
  onInvited,
}: {
  onClose: () => void
  onInvited: () => void
}) {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const token = await getToken()
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      await inviteCompanyUser(token, { first_name: firstName, last_name: lastName, email })
      onInvited()
    } catch (err) {
      setError(extractErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Invite Viewer</h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
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

          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Send Invite
            </button>
          </div>
        </form>
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
  onSaved: () => void
}) {
  const [perms, setPerms] = useState<ViewerPermissionsResponse | null>(null)
  const [surveys, setSurveys] = useState<{ id: string; name: string }[]>([])
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([])
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
        setPerms(p)
        setSurveys(sv.map((s) => ({ id: s.id, name: s.name })))
        setLocations(lc.map((l) => ({ id: l.id, name: l.name })))
      } catch (e) {
        setError(extractErrorMessage(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [member.membership_id])

  function toggleSurvey(id: string) {
    if (!perms) return
    const ids = perms.survey_ids.includes(id)
      ? perms.survey_ids.filter((x) => x !== id)
      : [...perms.survey_ids, id]
    setPerms({ ...perms, survey_ids: ids })
  }

  function toggleLocation(id: string) {
    if (!perms) return
    const ids = perms.location_ids.includes(id)
      ? perms.location_ids.filter((x) => x !== id)
      : [...perms.location_ids, id]
    setPerms({ ...perms, location_ids: ids })
  }

  async function onSave() {
    if (!perms) return
    const token = await getToken()
    if (!token) return
    setSaving(true)
    setError(null)
    try {
      await setViewerPermissions(token, member.membership_id, {
        all_surveys: perms.all_surveys,
        all_locations: perms.all_locations,
        survey_ids: perms.all_surveys ? [] : perms.survey_ids,
        location_ids: perms.all_locations ? [] : perms.location_ids,
      })
      onSaved()
    } catch (e) {
      setError(extractErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex h-[80vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">
            Permissions — {member.first_name} {member.last_name}
          </h2>
          <button type="button" onClick={onClose} className="text-zinc-400 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : perms ? (
            <div className="space-y-6">
              {/* Surveys */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-zinc-900">Surveys</p>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-600">
                    <input
                      type="checkbox"
                      checked={perms.all_surveys}
                      onChange={(e) => setPerms({ ...perms, all_surveys: e.target.checked })}
                      className="h-4 w-4 rounded accent-violet-600"
                    />
                    All surveys
                  </label>
                </div>
                {!perms.all_surveys && (
                  <div className="space-y-1 rounded-xl border border-zinc-200 p-3">
                    {surveys.length === 0 && (
                      <p className="text-xs text-zinc-400">No surveys found.</p>
                    )}
                    {surveys.map((s) => (
                      <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
                        <input
                          type="checkbox"
                          checked={perms.survey_ids.includes(s.id)}
                          onChange={() => toggleSurvey(s.id)}
                          className="h-4 w-4 rounded accent-violet-600"
                        />
                        {s.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Locations */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-zinc-900">Locations</p>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-600">
                    <input
                      type="checkbox"
                      checked={perms.all_locations}
                      onChange={(e) => setPerms({ ...perms, all_locations: e.target.checked })}
                      className="h-4 w-4 rounded accent-violet-600"
                    />
                    All locations
                  </label>
                </div>
                {!perms.all_locations && (
                  <div className="space-y-1 rounded-xl border border-zinc-200 p-3">
                    {locations.length === 0 && (
                      <p className="text-xs text-zinc-400">No locations found.</p>
                    )}
                    {locations.map((l) => (
                      <label key={l.id} className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
                        <input
                          type="checkbox"
                          checked={perms.location_ids.includes(l.id)}
                          onChange={() => toggleLocation(l.id)}
                          className="h-4 w-4 rounded accent-violet-600"
                        />
                        {l.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {error && (
                <p className="text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-red-600">{error ?? "Failed to load permissions."}</p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-100 px-6 py-4">
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
            disabled={saving || loading || !perms}
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
