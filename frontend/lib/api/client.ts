const BACKEND_BASE =
  process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? "http://localhost:5000"

// ------------------------------------------------------------------
// Public Survey Completion (no auth)
// ------------------------------------------------------------------

export interface SurveyRedirectResponse {
  valid: boolean
  redirect_url?: string
  error?: string
  session_id?: string
  qr_code_id?: string
  survey_version_id?: string
}

export async function fetchSurveyRedirect(qrCodeId: string): Promise<SurveyRedirectResponse> {
  const res = await fetch(
    `${BACKEND_BASE}/api/v1/survey/redirect?r=${encodeURIComponent(qrCodeId)}`,
  )
  return res.json()
}

export interface SurveyForSessionResponse {
  survey_version_id: string
  schema: Record<string, unknown>
  company_name: string | null
}

export async function fetchSurveyForSession(
  sessionId: string,
  qrCodeId: string,
): Promise<SurveyForSessionResponse> {
  const res = await fetch(
    `${BACKEND_BASE}/api/v1/survey?session=${encodeURIComponent(sessionId)}&qr=${encodeURIComponent(qrCodeId)}`,
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? "Failed to load survey")
  }
  return res.json()
}

export interface SurveySubmitResponse {
  success: boolean
  redirect_url: string
  thank_you_message: string
  company_name: string | null
}

export async function submitSurvey(
  sessionId: string,
  qrCodeId: string,
  answers: Record<string, unknown>,
): Promise<SurveySubmitResponse> {
  const res = await fetch(`${BACKEND_BASE}/api/v1/survey/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      qr_code_id: qrCodeId,
      answers,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.detail ?? "Failed to submit survey")
  }
  return data
}

export interface ThankYouDataResponse {
  thank_you_message: string
  company_name: string | null
}

export async function fetchThankYouData(
  sessionId: string,
  qrCodeId: string,
): Promise<ThankYouDataResponse> {
  const res = await fetch(
    `${BACKEND_BASE}/api/v1/survey/thank-you?session=${encodeURIComponent(sessionId)}&qr=${encodeURIComponent(qrCodeId)}`,
  )
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? "Failed to load thank-you page")
  }
  return res.json()
}

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
// QUESTION TYPES (from question_types table)
// --------------------------------------------------

export interface QuestionTypeResponse {
  type: string
  category: string
  label: string
  is_numeric: boolean
}

export async function fetchQuestionTypes(accessToken: string): Promise<QuestionTypeResponse[]> {
  const res = await fetch(`${BACKEND_BASE}/api/v1/surveys/question-types`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error("Failed to fetch question types")
  return res.json()
}

/** Public endpoint - no auth required. Use for survey creator. */
export async function fetchQuestionTypesPublic(): Promise<QuestionTypeResponse[]> {
  const res = await fetch(`${BACKEND_BASE}/api/v1/survey/question-types`)
  if (!res.ok) throw new Error("Failed to fetch question types")
  return res.json()
}

// --------------------------------------------------
// SETTINGS SCHEMA (centralised survey settings - no auth)
// --------------------------------------------------

export interface QuestionSettingDefinition {
  key: string
  label: string
  type: string
  required: boolean
  default_value: unknown
  allowed_values: string[] | null
  validation_rules: Record<string, unknown> | null
}

export interface QuestionTypeSettingsSchema {
  question_type: string
  settings: QuestionSettingDefinition[]
}

export interface SettingsSchemaResponse {
  question_types: QuestionTypeSettingsSchema[]
}

export async function fetchSettingsSchema(): Promise<SettingsSchemaResponse> {
  const res = await fetch(`${BACKEND_BASE}/api/v1/survey/settings-schema`)
  if (!res.ok) throw new Error("Failed to fetch settings schema")
  return res.json()
}

export interface ThemeSettingDefinition {
  key: string
  label: string
  type: string
  default_value: unknown
  allowed_values: string[] | null
}

export interface ThemeSettingsSchemaResponse {
  settings: ThemeSettingDefinition[]
}

export async function fetchThemeSettingsSchema(): Promise<ThemeSettingsSchemaResponse> {
  const res = await fetch(`${BACKEND_BASE}/api/v1/survey/theme-settings-schema`)
  if (!res.ok) throw new Error("Failed to fetch theme settings schema")
  return res.json()
}

export interface SurveyValidationErrorItem {
  question_id?: string
  setting?: string
  message: string
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
  title: string
  survey_id: string
  location_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface QRCodeCreate {
  title: string
  survey_id: string
  location_id?: string | null
}

export interface QRCodeUpdate {
  title?: string | null
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
  title: string
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

// ------------------------------------------------------------------
// Survey API
// ------------------------------------------------------------------

export interface SurveyListItem {
  id: string
  title: string
  status: "draft" | "active" | "archived"
  latest_version: number
  created_at: string
  updated_at: string
}

export interface SurveyWithSchema extends SurveyListItem {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  survey_schema_json: Record<string, any>
}

function normalizeSurveyListItem(raw: Record<string, unknown>): SurveyListItem {
  const statusRaw = String(raw.status ?? "draft")
  const status =
    statusRaw === "active" || statusRaw === "archived" ? statusRaw : "draft"

  return {
    id: String(raw.id ?? ""),
    title: String(raw.title ?? raw.name ?? "Untitled Survey"),
    status,
    latest_version: Number(raw.latest_version ?? raw.latestVersion ?? 1),
    created_at: String(raw.created_at ?? raw.createdAt ?? ""),
    updated_at: String(raw.updated_at ?? raw.updatedAt ?? ""),
  }
}

export class SurveyValidationError extends Error {
  constructor(
    message: string,
    public readonly schemaErrors: SurveyValidationErrorItem[] = [],
  ) {
    super(message)
    this.name = "SurveyValidationError"
  }
}

async function surveyRequest<T>(
  accessToken: string,
  path: string,
  method = "GET",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: Record<string, any>,
): Promise<T> {
  const res = await fetch(`${BACKEND_BASE}/api/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const detail = data?.detail
    if (res.status === 422 && detail && Array.isArray(detail.schema_errors)) {
      throw new SurveyValidationError(
        "Survey validation failed",
        detail.schema_errors as SurveyValidationErrorItem[],
      )
    }
    const msg = typeof detail === "string" ? detail : detail?.detail ?? `Request failed (${res.status})`
    throw new Error(msg)
  }
  return res.json()
}

export function fetchSurveysList(token: string): Promise<SurveyListItem[]> {
  return surveyRequest<Record<string, unknown>[]>(token, "/surveys").then((rows) =>
    rows.map((row) => normalizeSurveyListItem(row)),
  )
}

export function fetchSurveyLatest(token: string, id: string): Promise<SurveyWithSchema> {
  return surveyRequest<Record<string, unknown>>(token, `/surveys/${id}/latest`).then(
    (row) => ({
      ...normalizeSurveyListItem(row),
      survey_schema_json: (row.survey_schema_json ?? {}) as Record<string, unknown>,
    }),
  )
}

export function createSurvey(
  token: string,
  title: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  survey_schema_json: Record<string, any>,
): Promise<SurveyWithSchema> {
  return surveyRequest<SurveyWithSchema>(token, "/surveys", "POST", { title, survey_schema_json })
}

export function saveSurveyVersion(
  token: string,
  id: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  survey_schema_json: Record<string, any>,
  version: number,
): Promise<SurveyWithSchema> {
  return surveyRequest<SurveyWithSchema>(token, `/surveys/${id}/versions`, "POST", {
    survey_schema_json,
    version,
  })
}

export function updateSurveyMeta(
  token: string,
  id: string,
  data: { title?: string; status?: string },
): Promise<SurveyListItem> {
  return surveyRequest<SurveyListItem>(token, `/surveys/${id}`, "PATCH", data)
}

export function publishSurvey(token: string, id: string): Promise<SurveyListItem> {
  return surveyRequest<SurveyListItem>(token, `/surveys/${id}/publish`, "PATCH")
}

export function archiveSurvey(token: string, id: string): Promise<SurveyListItem> {
  return surveyRequest<SurveyListItem>(token, `/surveys/${id}/archive`, "PATCH")
}

export function duplicateSurvey(token: string, id: string): Promise<SurveyWithSchema> {
  return surveyRequest<SurveyWithSchema>(token, `/surveys/${id}/duplicate`, "POST")
}

// ------------------------------------------------------------------
// Analytics
// ------------------------------------------------------------------

export interface AnalyticsResponseRow {
  response_id: string
  session_id: string
  survey_name: string
  qr_code_name: string
  location_name: string | null
  scan_time: string
  completed: boolean
  time_to_complete_seconds: number | null
  questions_answered: number
  survey_version_id: string
  unread: boolean
}

export interface AnalyticsResponseList {
  rows: AnalyticsResponseRow[]
  total_count: number
  page: number
  page_size: number
}

export interface AnalyticsFilterOption {
  id: string
  name: string
}

export interface AnalyticsFiltersResponse {
  surveys: AnalyticsFilterOption[]
  qr_codes: AnalyticsFilterOption[]
  locations: AnalyticsFilterOption[]
}

export interface AnalyticsAnswerDetail {
  question_text: string
  answer_value: string
}

export interface AnalyticsResponseDetail {
  response_id: string
  survey_name: string
  answers: AnalyticsAnswerDetail[]
}

export interface AnalyticsFilters {
  page?: number
  page_size?: number
  survey_id?: string
  qr_code_id?: string
  location_id?: string
  completed?: boolean
  date_start?: string
  date_end?: string
  sort_column?: string
  sort_direction?: "asc" | "desc"
}

function _buildAnalyticsParams(filters: AnalyticsFilters): URLSearchParams {
  const p = new URLSearchParams()
  if (filters.page != null) p.set("page", String(filters.page))
  if (filters.page_size != null) p.set("page_size", String(filters.page_size))
  if (filters.survey_id) p.set("survey_id", filters.survey_id)
  if (filters.qr_code_id) p.set("qr_code_id", filters.qr_code_id)
  if (filters.location_id) p.set("location_id", filters.location_id)
  if (filters.completed != null) p.set("completed", String(filters.completed))
  if (filters.date_start) p.set("date_start", filters.date_start)
  if (filters.date_end) p.set("date_end", filters.date_end)
  if (filters.sort_column) p.set("sort_column", filters.sort_column)
  if (filters.sort_direction) p.set("sort_direction", filters.sort_direction)
  return p
}

async function _analyticsRequest<T>(
  token: string,
  path: string,
  params?: URLSearchParams,
): Promise<T> {
  const url = `${BACKEND_BASE}/api/v1${path}${params && params.toString() ? `?${params}` : ""}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(detail?.detail ?? `Analytics request failed (${res.status})`)
  }
  return res.json()
}

export function fetchAnalyticsFilters(token: string): Promise<AnalyticsFiltersResponse> {
  return _analyticsRequest<AnalyticsFiltersResponse>(token, "/analytics/filters")
}

export function fetchAnalyticsResponses(
  token: string,
  filters: AnalyticsFilters,
): Promise<AnalyticsResponseList> {
  return _analyticsRequest<AnalyticsResponseList>(
    token,
    "/analytics/responses",
    _buildAnalyticsParams(filters),
  )
}

export function fetchAnalyticsResponseDetail(
  token: string,
  responseId: string,
): Promise<AnalyticsResponseDetail> {
  return _analyticsRequest<AnalyticsResponseDetail>(
    token,
    `/analytics/response/${responseId}`,
  )
}

export function analyticsExportUrl(
  token: string,
  format: "csv" | "excel",
  filters: AnalyticsFilters,
): string {
  const params = _buildAnalyticsParams(filters)
  return `${BACKEND_BASE}/api/v1/analytics/responses/export/${format}?${params}`
}

export async function downloadAnalyticsExport(
  token: string,
  format: "csv" | "excel",
  filters: AnalyticsFilters,
): Promise<void> {
  const params = _buildAnalyticsParams(filters)
  const url = `${BACKEND_BASE}/api/v1/analytics/responses/export/${format}?${params}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) throw new Error(`Export failed (${res.status})`)
  const blob = await res.blob()
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = format === "csv" ? "analytics_responses.csv" : "analytics_responses.xlsx"
  a.click()
  URL.revokeObjectURL(a.href)
}
