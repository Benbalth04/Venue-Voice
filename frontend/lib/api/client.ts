const BACKEND_BASE =
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? "http://localhost:5000"

export interface MeResponse {
  id: string
  email: string
  first_name: string
  last_name: string
  onboarding_complete: boolean
  company_name?: string | null
  user_display_name?: string | null
}

export async function fetchMe(accessToken: string): Promise<MeResponse> {
  const res = await fetch(`${BACKEND_BASE}/api/v1/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) {
    throw new Error("Failed to fetch user")
  }
  return res.json()
}

export interface SetupAccountPayload {
  company_name: string
  location_name: string
  location_state?: string | null
  location_country?: string | null
  location_google_business_url?: string | null
  primary_industry?: string | null
  company_size?: string | null
  location_count?: number | null
  how_heard?: string | null
}

export async function setupAccount(
  accessToken: string,
  payload: SetupAccountPayload,
): Promise<{ ok: boolean }> {
  const res = await fetch(`${BACKEND_BASE}/api/v1/setup-account`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      company_name: payload.company_name,
      location_name: payload.location_name,
      location_state: payload.location_state ?? undefined,
      location_country: payload.location_country ?? undefined,
      location_google_business_url: payload.location_google_business_url ?? undefined,
      primary_industry: payload.primary_industry ?? undefined,
      company_size: payload.company_size ?? undefined,
      location_count: payload.location_count ?? undefined,
      how_heard: payload.how_heard ?? undefined,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? "Setup failed")
  }
  return res.json()
}

// --------------------------------------------------
// LOCATIONS
// --------------------------------------------------

export interface LocationResponse {
  id: string
  name: string
  is_active: boolean
  state: string | null
  country: string | null
  google_business_url: string | null
  created_at: string
  updated_at: string
}

export interface LocationCreate {
  name: string
  state?: string | null
  country?: string | null
  google_business_url?: string | null
}

export interface LocationUpdate {
  name?: string | null
  state?: string | null
  country?: string | null
  google_business_url?: string | null
  is_active?: boolean | null
}

export async function fetchLocations(accessToken: string): Promise<LocationResponse[]> {
  const res = await fetch(`${BACKEND_BASE}/api/v1/locations`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error("Failed to fetch locations")
  return res.json()
}

export async function createLocation(
  accessToken: string,
  payload: LocationCreate,
): Promise<LocationResponse> {
  const res = await fetch(`${BACKEND_BASE}/api/v1/locations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? "Failed to create location")
  }
  return res.json()
}

export async function updateLocation(
  accessToken: string,
  id: string,
  payload: LocationUpdate,
): Promise<LocationResponse> {
  const res = await fetch(`${BACKEND_BASE}/api/v1/locations/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? "Failed to update location")
  }
  return res.json()
}

export async function deleteLocation(accessToken: string, id: string): Promise<void> {
  const res = await fetch(`${BACKEND_BASE}/api/v1/locations/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? "Failed to delete location")
  }
}

// --------------------------------------------------
// SURVEYS LIST (for QR code form)
// --------------------------------------------------

export interface SurveySummary {
  id: string
  name: string
  status: string
}

export async function fetchSurveys(accessToken: string): Promise<SurveySummary[]> {
  const res = await fetch(`${BACKEND_BASE}/api/v1/surveys`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error("Failed to fetch surveys")
  return res.json()
}

// --------------------------------------------------
// QR CODES
// --------------------------------------------------

export interface QRCodeResponse {
  id: string
  slug: string
  survey_id: string
  location_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface QRCodeCreate {
  slug: string
  survey_id: string
  location_id?: string | null
}

export interface QRCodeUpdate {
  slug?: string | null
  survey_id?: string | null
  location_id?: string | null
  is_active?: boolean | null
}

export async function fetchQRCodes(accessToken: string): Promise<QRCodeResponse[]> {
  const res = await fetch(`${BACKEND_BASE}/api/v1/qr-codes`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error("Failed to fetch QR codes")
  return res.json()
}

export async function createQRCode(
  accessToken: string,
  payload: QRCodeCreate,
): Promise<QRCodeResponse> {
  const res = await fetch(`${BACKEND_BASE}/api/v1/qr-codes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? "Failed to create QR code")
  }
  return res.json()
}

export async function updateQRCode(
  accessToken: string,
  id: string,
  payload: QRCodeUpdate,
): Promise<QRCodeResponse> {
  const res = await fetch(`${BACKEND_BASE}/api/v1/qr-codes/${id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? "Failed to update QR code")
  }
  return res.json()
}

export async function deleteQRCode(accessToken: string, id: string): Promise<void> {
  const res = await fetch(`${BACKEND_BASE}/api/v1/qr-codes/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? "Failed to delete QR code")
  }
}

// --------------------------------------------------
// DASHBOARD
// --------------------------------------------------

export interface DashboardTrendPoint {
  label: string
  value: number
}

export interface DashboardSurveySummary {
  id: string
  title: string
  status: string
  question_count: number
}

export interface DashboardQRCodeSummary {
  id: string
  name: string
  survey_id: string
  location_id: string | null
  active: boolean
  scan_count: number
}

export interface DashboardLocationSummary {
  id: string
  name: string
}

export interface DashboardResponseSummary {
  id: string
  survey_version_id: string
  location_id: string | null
  submitted_at: string
}

export interface DashboardData {
  company_name: string
  user_display_name: string
  total_submissions: number
  total_scans: number
  active_surveys_count: number
  active_qr_codes_count: number
  active_locations_count: number
  submission_trend: DashboardTrendPoint[]
  scan_trend: DashboardTrendPoint[]
  active_surveys: DashboardSurveySummary[]
  active_qr_codes: DashboardQRCodeSummary[]
  active_locations: DashboardLocationSummary[]
}

export async function fetchDashboard(
  accessToken: string,
): Promise<DashboardData> {
  const res = await fetch(`${BACKEND_BASE}/api/v1/dashboard`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })
  if (!res.ok) {
    throw new Error("Failed to fetch dashboard")
  }
  return res.json()
}

export async function fetchDashboardSubmissionsByDate(
  accessToken: string,
  date: string,
): Promise<DashboardResponseSummary[]> {
  const res = await fetch(
    `${BACKEND_BASE}/api/v1/dashboard/submissions?date=${encodeURIComponent(date)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  )
  if (!res.ok) {
    throw new Error("Failed to fetch submissions")
  }
  return res.json()
}
