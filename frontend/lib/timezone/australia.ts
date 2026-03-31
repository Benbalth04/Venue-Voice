/** Keep in sync with backend `AUSTRALIA_TIMEZONE_IDS` in `app/core/timezone_australia.py`. */

export const AUSTRALIA_TIMEZONE_IDS: readonly string[] = [
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Perth",
  "Australia/Adelaide",
  "Australia/Darwin",
  "Australia/Hobart",
  "Australia/Broken_Hill",
  "Australia/Eucla",
  "Australia/Lord_Howe",
  "Australia/Lindeman",
  "Australia/Currie",
] as const

export const DEFAULT_USER_TIMEZONE = "Australia/Sydney"

export const AUSTRALIA_TIMEZONE_OPTIONS: { value: string; label: string }[] =
  AUSTRALIA_TIMEZONE_IDS.map((id) => ({
    value: id,
    label: id.replace(/^Australia\//, "").replace(/_/g, " "),
  }))

export function guessBrowserAustraliaTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz && (AUSTRALIA_TIMEZONE_IDS as readonly string[]).includes(tz)) return tz
  } catch {
    /* ignore */
  }
  return DEFAULT_USER_TIMEZONE
}
