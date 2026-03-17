import {
  normalizeApiError,
  normalizeUnknownError,
  type NormalizedError,
} from "./errors"

export type { NormalizedError } from "./errors"
export {
  normalizeApiError,
  normalizeUnknownError,
  isNormalizedError,
  showError,
  extractErrorMessage,
} from "./errors"

const BACKEND_BASE = process.env.NEXT_PUBLIC_BACKEND_BASE_URL

// ------------------------------------------------------------------
// Core fetch wrapper
//
// Every request goes through this single function.  On a non-2xx
// response it parses the body and throws a NormalizedError.  Network
// failures and JSON parse errors are also converted to NormalizedError
// so callers always receive a consistent shape.
// ------------------------------------------------------------------
async function apiFetch<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(input, init)
  } catch (err) {
    throw normalizeUnknownError(err)
  }

  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    // Non-JSON or empty body – leave data as null
  }

  if (!res.ok) {
    throw normalizeApiError(data, res.status)
  }

  return data as T
}

// ------------------------------------------------------------------
// Interface Definitions
// ------------------------------------------------------------------
// Public survey responses
export interface SurveyRedirectResponse {
  valid: boolean
  redirect_url?: string
  error?: string
  session_id?: string
  qr_code_id?: string
  survey_version_id?: string
}

export interface SurveyForSessionResponse {
  survey_version_id: string
  schema: Record<string, unknown>
  company_name: string | null
}

export interface SurveySubmitResponse {
  success: boolean
  redirect_url: string
  thank_you_message: string
  company_name: string | null
}

export interface ThankYouDataResponse {
  thank_you_message: string
  company_name: string | null
}

export class SurveySubmissionValidationError extends Error {
  missingRequired: string[]

  constructor(message: string, missingRequired: string[]) {
    super(message)
    this.name = "SurveySubmissionValidationError"
    this.missingRequired = missingRequired
  }
}

// Auth
export interface UserResponse {
  id: string
  email: string
  first_name: string
  last_name: string
  onboarding_complete: boolean
  company_name?: string | null
  user_display_name?: string | null
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

// Locations
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

// Question Type
export interface QuestionTypeResponse {
  type: string
  category: string
  label: string
  is_numeric: boolean
}

// Settings Schema
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

export interface SurveyValidationErrorItem {
  question_id?: string
  setting?: string
  message: string
}

export class SurveyStructureValidationError extends Error {
  constructor(
    message: string,
    public readonly schemaErrors: SurveyValidationErrorItem[] = [],
  ) {
    super(message)
    this.name = "SurveyValidationError"
  }
}

// Survey lists
export interface SurveySummary {
  id: string
  name: string
  status: string
}

// QR Codes
export interface QRCodeResponse {
  id: string
  title: string
  survey_id: string | null
  survey_title: string | null
  location_id: string | null
  location_name: string | null
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

// Dashboard
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

// Survey API
export interface SurveyListItem {
  id: string
  title: string
  status: "draft" | "active" | "archived"
  latest_version: number
  updated_at: string
}

export interface SurveyWithSchema extends SurveyListItem {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  survey_schema_json: Record<string, any>
}

// Analytics
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

// ------------------------------------------------------------------
// Auth helpers
// ------------------------------------------------------------------
function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  }
}

function authGetHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` }
}

// ------------------------------------------------------------------
// Public Survey Completion (no auth)
// ------------------------------------------------------------------

/**
 * Validate a QR code and create a session.
 *
 * NOTE: The backend returns a *success* 200/404 body with a `valid` flag
 * (not a thrown error) for the QR redirect flow.  We intentionally do NOT
 * throw here so the caller can inspect `result.valid` and react accordingly.
 * Network failures will still throw a NormalizedError.
 */
export async function fetchSurveyRedirect(qrCodeId: string): Promise<SurveyRedirectResponse> {
  let res: Response
  try {
    res = await fetch(
      `${BACKEND_BASE}/api/v1/survey/redirect?r=${encodeURIComponent(qrCodeId)}`,
    )
  } catch (err) {
    throw normalizeUnknownError(err)
  }

  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    // empty body – handled below
  }

  if (!res.ok) {
    throw normalizeApiError(data, res.status)
  }

  return data as SurveyRedirectResponse
}

export async function fetchSurveyForSession(
  sessionId: string,
  qrCodeId: string,
): Promise<SurveyForSessionResponse> {
  return apiFetch<SurveyForSessionResponse>(
    `${BACKEND_BASE}/api/v1/survey?session=${encodeURIComponent(sessionId)}&qr=${encodeURIComponent(qrCodeId)}`,
  )
}

export async function submitSurvey(
  sessionId: string,
  qrCodeId: string,
  answers: Record<string, unknown>,
): Promise<SurveySubmitResponse> {
  let res: Response
  try {
    res = await fetch(`${BACKEND_BASE}/api/v1/survey/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, qr_code_id: qrCodeId, answers }),
    })
  } catch (err) {
    throw normalizeUnknownError(err)
  }

  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    // empty body
  }

  if (!res.ok) {
    const normalized = normalizeApiError(data, res.status)
    // Preserve the special SurveySubmissionValidationError path so that
    // PublicSurveyPageContent can highlight individual missing questions.
    if (
      res.status === 422 &&
      normalized.code === "MISSING_REQUIRED_ANSWERS" &&
      Array.isArray(normalized.details?.missing_required)
    ) {
      throw new SurveySubmissionValidationError(
        normalized.message,
        normalized.details!.missing_required as string[],
      )
    }
    throw normalized
  }

  return data as SurveySubmitResponse
}

export async function fetchThankYouData(
  sessionId: string,
  qrCodeId: string,
): Promise<ThankYouDataResponse> {
  return apiFetch<ThankYouDataResponse>(
    `${BACKEND_BASE}/api/v1/survey/thank-you?session=${encodeURIComponent(sessionId)}&qr=${encodeURIComponent(qrCodeId)}`,
  )
}

// ------------------------------------------------------------------
// Auth / User
// ------------------------------------------------------------------
export async function fetchUser(accessToken: string): Promise<UserResponse> {
  return apiFetch<UserResponse>(`${BACKEND_BASE}/api/v1/user`, {
    headers: authGetHeaders(accessToken),
  })
}

export async function setupAccount(
  accessToken: string,
  payload: SetupAccountPayload,
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`${BACKEND_BASE}/api/v1/setup-account`, {
    method: "POST",
    headers: authHeaders(accessToken),
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
}

// ------------------------------------------------------------------
// Locations
// ------------------------------------------------------------------
export async function fetchLocations(accessToken: string): Promise<LocationResponse[]> {
  return apiFetch<LocationResponse[]>(`${BACKEND_BASE}/api/v1/locations`, {
    headers: authGetHeaders(accessToken),
  })
}

export async function createLocation(
  accessToken: string,
  payload: LocationCreate,
): Promise<LocationResponse> {
  return apiFetch<LocationResponse>(`${BACKEND_BASE}/api/v1/locations`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  })
}

export async function updateLocation(
  accessToken: string,
  id: string,
  payload: LocationUpdate,
): Promise<LocationResponse> {
  return apiFetch<LocationResponse>(`${BACKEND_BASE}/api/v1/locations/${id}`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  })
}

export async function deleteLocation(accessToken: string, id: string): Promise<void> {
  await apiFetch<unknown>(`${BACKEND_BASE}/api/v1/locations/${id}`, {
    method: "DELETE",
    headers: authGetHeaders(accessToken),
  })
}

// ------------------------------------------------------------------
// Question Types
// ------------------------------------------------------------------
export async function fetchQuestionTypes(accessToken: string): Promise<QuestionTypeResponse[]> {
  return apiFetch<QuestionTypeResponse[]>(`${BACKEND_BASE}/api/v1/surveys/question-types`, {
    headers: authGetHeaders(accessToken),
  })
}

/** Public endpoint – no auth required. */
export async function fetchQuestionTypesPublic(): Promise<QuestionTypeResponse[]> {
  return apiFetch<QuestionTypeResponse[]>(`${BACKEND_BASE}/api/v1/survey/question-types`)
}

// ------------------------------------------------------------------
// Settings Schema (public)
// ------------------------------------------------------------------
export async function fetchSettingsSchema(): Promise<SettingsSchemaResponse> {
  return apiFetch<SettingsSchemaResponse>(`${BACKEND_BASE}/api/v1/survey/settings-schema`)
}

export async function fetchThemeSettingsSchema(): Promise<ThemeSettingsSchemaResponse> {
  return apiFetch<ThemeSettingsSchemaResponse>(`${BACKEND_BASE}/api/v1/survey/theme-settings-schema`)
}

// ------------------------------------------------------------------
// Surveys list (for QR code form)
// ------------------------------------------------------------------
export async function fetchSurveys(accessToken: string): Promise<SurveySummary[]> {
  return apiFetch<SurveySummary[]>(`${BACKEND_BASE}/api/v1/surveys`, {
    headers: authGetHeaders(accessToken),
  })
}

// ------------------------------------------------------------------
// QR Codes
// ------------------------------------------------------------------
export async function fetchQRCodes(accessToken: string): Promise<QRCodeResponse[]> {
  return apiFetch<QRCodeResponse[]>(`${BACKEND_BASE}/api/v1/qr-codes`, {
    headers: authGetHeaders(accessToken),
  })
}

export async function createQRCode(
  accessToken: string,
  payload: QRCodeCreate,
): Promise<QRCodeResponse> {
  return apiFetch<QRCodeResponse>(`${BACKEND_BASE}/api/v1/qr-codes`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  })
}

export async function updateQRCode(
  accessToken: string,
  id: string,
  payload: QRCodeUpdate,
): Promise<QRCodeResponse> {
  return apiFetch<QRCodeResponse>(`${BACKEND_BASE}/api/v1/qr-codes/${id}`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  })
}

export async function deleteQRCode(accessToken: string, id: string): Promise<void> {
  await apiFetch<unknown>(`${BACKEND_BASE}/api/v1/qr-codes/${id}`, {
    method: "DELETE",
    headers: authGetHeaders(accessToken),
  })
}

// ------------------------------------------------------------------
// Dashboard
// ------------------------------------------------------------------
export async function fetchDashboard(accessToken: string): Promise<DashboardData> {
  return apiFetch<DashboardData>(`${BACKEND_BASE}/api/v1/dashboard`, {
    headers: authGetHeaders(accessToken),
  })
}

export async function fetchDashboardSubmissionsByDate(
  accessToken: string,
  date: string,
): Promise<DashboardResponseSummary[]> {
  return apiFetch<DashboardResponseSummary[]>(
    `${BACKEND_BASE}/api/v1/dashboard/submissions?date=${encodeURIComponent(date)}`,
    { headers: authGetHeaders(accessToken) },
  )
}

// ------------------------------------------------------------------
// Survey API
// ------------------------------------------------------------------
function normalizeSurveyListItem(raw: Record<string, unknown>): SurveyListItem {
  const statusRaw = String(raw.status ?? "draft")
  const status =
    statusRaw === "active" || statusRaw === "archived" ? statusRaw : "draft"

  return {
    id: String(raw.id ?? ""),
    title: String(raw.title ?? raw.name ?? "Untitled Survey"),
    status,
    latest_version: Number(raw.latest_version ?? raw.latestVersion ?? 1),
    updated_at: String(raw.updated_at ?? raw.updatedAt ?? ""),
  }
}

async function surveyRequest<T>(
  accessToken: string,
  path: string,
  method = "GET",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: Record<string, any>,
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BACKEND_BASE}/api/v1${path}`, {
      method,
      headers: authHeaders(accessToken),
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    throw normalizeUnknownError(err)
  }

  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    // empty body
  }

  if (!res.ok) {
    const normalized = normalizeApiError(data, res.status)
    // Re-throw as SurveyStructureValidationError so the survey editor can
    // display per-question validation errors inline.
    if (
      res.status === 422 &&
      normalized.code === "INVALID_SURVEY_SCHEMA" &&
      Array.isArray(normalized.details?.schema_errors)
    ) {
      throw new SurveyStructureValidationError(
        normalized.message,
        normalized.details!.schema_errors as SurveyValidationErrorItem[],
      )
    }
    throw normalized
  }

  return data as T
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
  return apiFetch<T>(url, { headers: authGetHeaders(token) })
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

  let res: Response
  try {
    res = await fetch(url, { headers: authGetHeaders(token) })
  } catch (err) {
    throw normalizeUnknownError(err)
  }

  if (!res.ok) {
    let data: unknown = null
    try {
      data = await res.json()
    } catch {
      // empty body
    }
    throw normalizeApiError(data, res.status)
  }

  const blob = await res.blob()
  const a = document.createElement("a")
  a.href = URL.createObjectURL(blob)
  a.download = format === "csv" ? "analytics_responses.csv" : "analytics_responses.xlsx"
  a.click()
  URL.revokeObjectURL(a.href)
}
