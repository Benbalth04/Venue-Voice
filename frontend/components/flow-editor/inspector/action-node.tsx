"use client"

import { AlertTriangle } from "lucide-react"
import Link from "next/link"
import { SingleSelectDropdown } from "@/components/ui/DropdownSelect"
import type { FlowActionType, LocationSurveyResponse, NotificationGroupResponse } from "@/lib/api/client"
import { canonicalParentId, redirectActionCountOnPathFromRootTo } from "../draftUtils"
import type { DraftNode } from "../types"

export function FlowActionInspector(props: {
  draftNodes: DraftNode[]
  selectedNode: DraftNode
  selectedActionConfig: Record<string, unknown> | null
  selectedTriggerLocations: LocationSurveyResponse[]
  notificationGroups: NotificationGroupResponse[]
  updateSelectedNode: (update: (node: DraftNode) => DraftNode) => void
}) {
  const {
    draftNodes,
    selectedNode,
    selectedActionConfig,
    selectedTriggerLocations,
    notificationGroups,
    updateSelectedNode,
  } = props

  const parentId = canonicalParentId(selectedNode.parent_id)
  const redirectsEarlierOnPath = parentId ? redirectActionCountOnPathFromRootTo(draftNodes, parentId) : 0
  const redirectOptionLocked = redirectsEarlierOnPath >= 1

  const locationsWithoutGoogleUrl = selectedTriggerLocations.filter((ls) => !ls.location_google_business_url)
  const locationsWithoutNotifGroups = selectedTriggerLocations.filter(
    (ls) => !notificationGroups.some((ng) => ng.location_ids.includes(ls.location_id)),
  )
  const showGoogleUrlAlert =
    selectedNode.action_type === "redirect" &&
    String(selectedActionConfig?.target ?? "google_business_url") === "google_business_url" &&
    locationsWithoutGoogleUrl.length > 0
  const showNotifGroupsAlert =
    selectedNode.action_type === "email" &&
    String(selectedActionConfig?.target ?? "location_notification_groups") === "location_notification_groups" &&
    locationsWithoutNotifGroups.length > 0

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-zinc-700">Action type</span>
        <div className="mt-1">
          <SingleSelectDropdown
            options={[
              { value: "redirect", label: "Webpage redirect", disabled: redirectOptionLocked },
              { value: "email", label: "Send an email" },
            ]}
            value={selectedNode.action_type ?? "redirect"}
            onChange={(value) =>
              updateSelectedNode((node) => ({
                ...node,
                action_type: value as FlowActionType,
                config:
                  value === "redirect"
                    ? { target: "google_business_url" }
                    : { target: "location_notification_groups" },
              }))
            }
          />
        </div>
        {redirectOptionLocked ? (
          <p className="mt-2 text-sm text-zinc-500">Redirect already triggered on the path</p>
        ) : null}
      </label>

      {selectedNode.action_type === "redirect" ? (
        <>
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Redirect source</span>
            <div className="mt-1">
              <SingleSelectDropdown
                options={[
                  { value: "google_business_url", label: "Use the trigger location's Google Business URL" },
                  { value: "custom_url", label: "Use a custom redirect URL" },
                ]}
                value={String(selectedActionConfig?.target ?? "google_business_url")}
                onChange={(value) =>
                  updateSelectedNode((node) => ({
                    ...node,
                    config:
                      value === "custom_url"
                        ? { target: "custom_url", url: String(selectedActionConfig?.url ?? "") }
                        : { target: "google_business_url" },
                  }))
                }
              />
            </div>
          </label>
          {showGoogleUrlAlert ? (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">
                  {locationsWithoutGoogleUrl.length === 1
                    ? `1 trigger location is missing a Google Business URL`
                    : `${locationsWithoutGoogleUrl.length} trigger locations are missing a Google Business URL`}
                </p>
                <Link
                  href="/dashboard/locations"
                  className="mt-0.5 inline-block underline underline-offset-2 hover:text-red-900"
                >
                  Go to Locations to fix {locationsWithoutGoogleUrl.length === 1 ? "it" : "them"}
                </Link>
              </div>
            </div>
          ) : null}
          {selectedActionConfig?.target === "custom_url" ? (
            <label className="block">
              <span className="text-sm font-medium text-zinc-700">Custom URL</span>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                value={String(selectedActionConfig.url ?? "")}
                onChange={(event) =>
                  updateSelectedNode((node) => ({
                    ...node,
                    config: { target: "custom_url", url: event.target.value },
                  }))
                }
              />
            </label>
          ) : (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
              {selectedTriggerLocations.length === 0 ? (
                <p>Select trigger locations to preview the Google Business URLs used by this action.</p>
              ) : (
                <div className="space-y-2">
                  {selectedTriggerLocations.map((location) => (
                    <div key={location.id}>
                      <p className="font-medium text-zinc-700">{location.location_name}</p>
                      <p className={location.location_google_business_url ? "text-zinc-500" : "text-red-600"}>
                        {location.location_google_business_url || "Missing Google Business URL"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <label className="block">
            <span className="text-sm font-medium text-zinc-700">Send email to</span>
            <div className="mt-1">
              <SingleSelectDropdown
                options={[
                  { value: "custom_email", label: "A custom email address" },
                  { value: "notification_group", label: "A single notification group" },
                  {
                    value: "location_notification_groups",
                    label: "All notification groups at the submission location",
                  },
                ]}
                value={String(selectedActionConfig?.target ?? "location_notification_groups")}
                onChange={(value) =>
                  updateSelectedNode((node) => ({
                    ...node,
                    config:
                      value === "custom_email"
                        ? { target: "custom_email", email: "" }
                        : value === "notification_group"
                          ? { target: "notification_group", notification_group_id: "" }
                          : { target: "location_notification_groups" },
                  }))
                }
              />
            </div>
          </label>

          {selectedActionConfig?.target === "custom_email" ? (
            <label className="block">
              <span className="text-sm font-medium text-zinc-700">Email address</span>
              <input
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                value={String(selectedActionConfig.email ?? "")}
                onChange={(event) =>
                  updateSelectedNode((node) => ({
                    ...node,
                    config: { target: "custom_email", email: event.target.value },
                  }))
                }
              />
            </label>
          ) : null}

          {selectedActionConfig?.target === "notification_group" ? (
            <>
              <label className="block">
                <span className="text-sm font-medium text-zinc-700">Notification group</span>
                <div className="mt-1">
                  <SingleSelectDropdown
                    options={notificationGroups.map((group) => ({ value: group.id, label: group.name }))}
                    value={String(selectedActionConfig.notification_group_id ?? "")}
                    onChange={(value) =>
                      updateSelectedNode((node) => ({
                        ...node,
                        config: { target: "notification_group", notification_group_id: value },
                      }))
                    }
                  />
                </div>
              </label>
              {(() => {
                const group = notificationGroups.find(
                  (g) => g.id === String(selectedActionConfig.notification_group_id ?? ""),
                )
                return group ? (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                    <p className="font-medium text-zinc-700">{group.name}</p>
                    <p className="mt-0.5">
                      {group.members.length} member{group.members.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                ) : null
              })()}
            </>
          ) : null}

          {showNotifGroupsAlert ? (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">
                  {locationsWithoutNotifGroups.length === 1
                    ? `1 trigger location has no notification groups assigned`
                    : `${locationsWithoutNotifGroups.length} trigger locations have no notification groups assigned`}
                </p>
                <Link
                  href="/dashboard/automations/notification_groups"
                  className="mt-0.5 inline-block underline underline-offset-2 hover:text-red-900"
                >
                  Go to Notification Groups to fix {locationsWithoutNotifGroups.length === 1 ? "it" : "them"}
                </Link>
              </div>
            </div>
          ) : null}
          {selectedActionConfig?.target === "location_notification_groups" ? (
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
              {selectedTriggerLocations.length === 0 ? (
                <p>Select trigger locations to preview which notification groups will receive this email.</p>
              ) : (
                <div className="space-y-4">
                  {selectedTriggerLocations.map((location) => {
                    const groupsHere = notificationGroups.filter((ng) => ng.location_ids.includes(location.location_id))
                    return (
                      <div key={location.id} className="border-b border-zinc-200 pb-3 last:border-b-0 last:pb-0">
                        <p className="font-medium text-zinc-800">{location.location_name}</p>
                        {groupsHere.length === 0 ? (
                          <p className="mt-1 text-red-600">No notification groups linked to this location.</p>
                        ) : (
                          <ul className="mt-2 space-y-2">
                            {groupsHere.map((group) => (
                              <li key={group.id} className="rounded-lg border border-zinc-100 bg-white px-3 py-2">
                                <p className="font-medium text-zinc-700">{group.name}</p>
                                <p className="mt-0.5 text-zinc-500">
                                  {group.members.length} member{group.members.length !== 1 ? "s" : ""}
                                </p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
