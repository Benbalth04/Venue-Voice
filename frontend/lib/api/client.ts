import {
  normalizeApiError,
  normalizeUnknownError,
} from "./errors"

export type { NormalizedError } from "./errors"
export {
  normalizeApiError,
  normalizeUnknownError,
  isNormalizedError,
  isStaleObjectError,
  showError,
  extractErrorMessage,
} from "./errors"

const BACKEND_BASE = process.env.NEXT_PUBLIC_BACKEND_BASE_URL

if (!BACKEND_BASE) {
  throw new Error(
    "Missing NEXT_PUBLIC_BACKEND_BASE_URL environment variable",
  )
}

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
  company_name: string | null
}

export interface ThankYouDataResponse {
  thank_you_title: string
  thank_you_content: string
  company_name: string | null
  /** Hex colour from the submitted survey version theme (e.g. #7C3AED). */
  primary_color: string
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
export interface MembershipSummary {
  membership_id: string
  company_id: string
  company_name: string
  role: "company_owner" | "company_admin" | "viewer"
  all_surveys: boolean
  all_locations: boolean
}

export interface UserResponse {
  id: string
  email: string
  first_name: string
  last_name: string
  email_verified: boolean
  onboarding_complete: boolean
  invite_pending: boolean
  timezone: string
  subscription_plan_name?: string | null
  company_name?: string | null
  user_display_name?: string | null
  memberships: MembershipSummary[]
}

export interface SetupAccountPayload {
  company_name: string
  location_name: string
  timezone: string
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
  archived_at?: string | null
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
  updated_at: string
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

export interface LocationSurveyResponse {
  id: string
  location_id: string
  location_name: string
  location_google_business_url: string | null
  location_is_active: boolean
  survey_id: string
  survey_name: string
  survey_is_published: boolean
  is_active: boolean
  start_date: string
  end_date: string | null
  /** Assignment lifecycle: active | scheduled | inactive | deleted */
  status: "active" | "scheduled" | "inactive" | "deleted"
  created_at: string
  updated_at: string
}

// QR Codes
export interface QRCodeAssetUrls {
  svg: string
  png: string
}

export interface QRCodeResponse {
  id: string
  title: string
  location_survey_id: string
  survey_id: string
  survey_title: string | null
  /** QR code only: active | inactive | archived | deleted */
  qr_status: "active" | "inactive" | "archived" | "deleted"
  /** Linked assignment: active | scheduled | inactive | deleted */
  location_survey_status: "active" | "scheduled" | "inactive" | "deleted"
  /** Survey published (active) and location active; independent of dates / QR toggle. */
  accepting_submissions_by_survey_and_location: boolean
  location_id: string
  location_name: string | null
  start_date: string | null
  end_date: string | null
  is_active: boolean
  /** URL encoded in the stored QR assets (null for legacy rows). */
  redirect_url: string | null
  /** Hex color used for QR modules, e.g. #000000. */
  color: string
  /** Supabase signed URLs when generated server-side. */
  assets: QRCodeAssetUrls | null
  created_at: string
  updated_at: string
  archived_at?: string | null
  /** @deprecated use location_survey_status */
  location_status?: string | null
  /** @deprecated use location_survey_status */
  assignment_status?: string | null
}

export interface QRCodeCreate {
  title: string
  location_id: string
  survey_id: string
  /** If omitted, backend uses NEXT_PUBLIC_APP_ORIGIN /r/{id} */
  redirect_url?: string | null
  /** Hex color for QR modules. Defaults to #000000. */
  color?: string
}

export interface QRCodeUpdate {
  title?: string | null
  location_id?: string | null
  survey_id?: string | null
  is_active?: boolean | null
  /** Hex color for QR modules; when changed, server regenerates stored assets. */
  color?: string | null
  updated_at: string
}

// Dashboard
export interface DashboardTrendPoint {
  label: string
  value: number
}

export interface DashboardRateTrendPoint {
  label: string
  value: number | null
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
  completion_rate_trend: DashboardRateTrendPoint[]
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
  last_edited_by: string | null
  updated_at: string
  /** ISO-ish instant when archived; null if never archived */
  archived_at?: string | null
}

export interface SurveyWithSchema extends SurveyListItem {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  survey_schema_json: Record<string, any>
}

export type LogicActionType = "none"
export type LogicConnector = "AND" | "OR"
export type LogicOperator =
  | "group"
  | "<"
  | "<="
  | "="
  | ">="
  | ">"
  | "not_blank"
  | "sentiment_positive"
  | "sentiment_negative"

export interface LogicQuestionOption {
  id: string
  question_key: string
  question_text: string
  question_type: string
  is_numeric: boolean
  position: number
  config?: Record<string, unknown> | null
}

export interface LogicConditionPayload {
  id?: string | null
  question_id: string | null
  operator: LogicOperator
  threshold_value: number | null
  logical_connector: LogicConnector
  children: LogicConditionPayload[]
}

export interface LogicConditionResponse {
  id: string
  question_id: string | null
  operator: LogicOperator
  threshold_value: number | null
  logical_connector: LogicConnector
  parent_condition_id: string | null
  position: number
  question_text: string | null
  question_type: string | null
  children: LogicConditionResponse[]
}

export interface LogicRulePayload {
  name: string
  description: string | null
  enabled: boolean
  action_type: LogicActionType
  conditions: LogicConditionPayload[]
}

export interface LogicRuleResponse {
  id: string
  survey_id: string
  name: string
  description: string | null
  enabled: boolean
  action_type: LogicActionType
  conditions: LogicConditionResponse[]
  status: "active" | "broken"
  created_at: string
  updated_at: string
}

export interface LogicRuleBundleResponse {
  survey_id: string
  questions: LogicQuestionOption[]
  rules: LogicRuleResponse[]
}

export type RuleConditionType =
  | "rating"
  | "nps"
  | "sentiment"
  | "not_empty"
  | "checkbox"
  | "multiple_choice"
  | "yes_no"
export type RuleOperatorApi = "lt" | "lte" | "eq" | "gte" | "gt" | "is"
export type FlowNodeType = "rule" | "branch" | "action" | "terminate"
export type FlowBranchType = "TRUE" | "FALSE"
export type FlowActionType = "redirect" | "email"
export type FlowBranchMatchType = "all" | "any"
export type FlowRedirectTargetType = "google_business_url" | "custom_url"
export type FlowEmailTargetType =
  | "custom_email"
  | "notification_group"
  | "location_notification_groups"

interface RuleGroupApi {
  id?: string | null
  operator: LogicConnector
}

interface RuleConditionApi {
  id?: string | null
  condition_type: RuleConditionType
  question_id: string | null
  operator: RuleOperatorApi | null
  value: string | string[] | null
  group_id: string | null
  created_at?: string
}

// ------------------------------------------------------------------
// Direct API types — used by the rules page (no legacy conversion)
// ------------------------------------------------------------------

export interface RuleConditionData {
  id?: string | null
  condition_type: RuleConditionType
  question_id: string | null
  operator: RuleOperatorApi | null
  value: string | string[] | null
  group_id?: string | null
  created_at?: string
}

export interface RuleGroupData {
  id: string
  operator: "AND" | "OR"
  created_at: string
}

export interface BrokenReason {
  type: string
  condition_id: string
  question_id: string | null
  message: string
}

export interface RuleData {
  id: string
  company_id: string
  survey_id: string
  name: string
  description: string | null
  operator: "AND" | "OR"
  groups: RuleGroupData[]
  conditions: RuleConditionData[]
  status: "active" | "broken"
  broken_reasons: BrokenReason[]
  created_at: string
  updated_at: string
}

export interface RuleBundleData {
  survey_id: string
  questions: LogicQuestionOption[]
  rules: RuleData[]
}

export interface RuleCreatePayload {
  name: string
  description: string | null
  operator: "AND" | "OR"
  groups: Array<{ id?: string | null; operator: "AND" | "OR" }>
  conditions: Array<{
    id?: string | null
    condition_type: RuleConditionType
    question_id: string | null
    operator: RuleOperatorApi | null
    value: string | string[] | null
    group_id?: string | null
  }>
}

export interface RuleUpdatePayload extends RuleCreatePayload {
  updated_at: string
}

interface RuleApiResponse {
  id: string
  company_id: string
  survey_id: string
  name: string
  description: string | null
  operator: LogicConnector
  groups: Array<{ id: string; operator: LogicConnector; created_at: string }>
  conditions: RuleConditionApi[]
  status: "active" | "broken"
  broken_reasons: BrokenReason[]
  created_at: string
  updated_at: string
}

interface RuleApiBundleResponse {
  survey_id: string
  questions: LogicQuestionOption[]
  rules: RuleApiResponse[]
}

interface RuleApiPayload {
  name: string
  description: string | null
  operator: LogicConnector
  groups: RuleGroupApi[]
  conditions: RuleConditionApi[]
}

export interface NotificationGroupMemberResponse {
  id: string
  name: string
  email: string
  created_at: string
}

export interface NotificationGroupResponse {
  id: string
  company_id: string
  name: string
  created_at: string
  updated_at: string
  members: NotificationGroupMemberResponse[]
  location_ids: string[]
}

export interface FlowNodePayload {
  id?: string | null
  parent_id: string | null
  node_type: FlowNodeType
  rule_id?: string | null
  branch_type?: FlowBranchType | null
  action_type?: FlowActionType | null
  config?: Record<string, unknown> | null
  position: number
}

export interface FlowPayload {
  name: string
  description: string | null
  is_active: boolean
  location_survey_ids: string[]
  nodes: FlowNodePayload[]
}

export interface FlowUpdatePayload extends FlowPayload {
  updated_at: string
}

export interface FlowNodeResponse {
  id: string
  parent_id: string | null
  node_type: FlowNodeType
  rule_id: string | null
  branch_type: FlowBranchType | null
  action_type: FlowActionType | null
  config: Record<string, unknown> | null
  position: number
  created_at: string
}

export interface FlowResponse {
  id: string
  company_id: string
  survey_id: string
  survey_name: string
  name: string
  description: string | null
  is_active: boolean
  status: string
  broken_reasons: Record<string, unknown>[]
  location_survey_ids: string[]
  nodes: FlowNodeResponse[]
  created_at: string
  updated_at: string
}

export interface FlowTestResponse {
  execution_trace: Record<string, unknown>
  action: {
    type: FlowActionType
    url?: string | null
    notification_group_id?: string | null
    recipient_email?: string | null
  } | null
  actions?: Array<{
    type: FlowActionType
    url?: string | null
    notification_group_id?: string | null
    recipient_email?: string | null
  }>
}

export interface FlowRunAction {
  id: string
  action_type: "redirect" | "email"
  config: Record<string, unknown>
  created_at: string
}

export interface FlowRunResponse {
  id: string
  company_id: string
  flow_id: string
  flow_name: string
  survey_id: string
  survey_name: string
  response_id: string | null
  success: boolean
  location_survey_id: string | null
  location_id: string | null
  location_name: string | null
  qr_code_id: string | null
  qr_code_title: string | null
  actions: FlowRunAction[]
  runtime_ms: number | null
  execution_trace: Record<string, unknown>
  created_at: string
}

export interface FlowRunListResponse {
  items: FlowRunResponse[]
  total: number
  page: number
  page_size: number
}

function ruleApiConditionToLegacy(
  condition: RuleConditionApi,
  connector: LogicConnector,
): LogicConditionResponse {
  let operator: LogicOperator = "not_blank"
  let threshold_value: number | null = null

  if (condition.condition_type === "rating") {
    operator =
      condition.operator === "gt"
        ? ">"
        : condition.operator === "gte"
          ? ">="
          : condition.operator === "lt"
            ? "<"
            : condition.operator === "lte"
              ? "<="
              : "="
    threshold_value = condition.value != null ? Number(condition.value) : null
  } else if (condition.condition_type === "sentiment") {
    operator = String(condition.value).toLowerCase() === "positive" ? "sentiment_positive" : "sentiment_negative"
  }

  return {
    id: String(condition.id ?? ""),
    question_id: condition.question_id,
    operator,
    threshold_value,
    logical_connector: connector,
    parent_condition_id: condition.group_id,
    position: 0,
    question_text: null,
    question_type: null,
    children: [],
  }
}

function ruleApiToLegacy(rule: RuleApiResponse): LogicRuleResponse {
  const grouped = new Map<string, LogicConditionResponse[]>()
  const topLevel: LogicConditionResponse[] = []

  for (const condition of rule.conditions) {
    if (condition.group_id) {
      const group = rule.groups.find((item) => item.id === condition.group_id)
      const list = grouped.get(condition.group_id) ?? []
      list.push(ruleApiConditionToLegacy(condition, list.length === 0 ? "AND" : group?.operator ?? "AND"))
      grouped.set(condition.group_id, list)
      continue
    }
    topLevel.push(ruleApiConditionToLegacy(condition, topLevel.length === 0 ? "AND" : rule.operator))
  }

  for (const group of rule.groups) {
    topLevel.push({
      id: group.id,
      question_id: null,
      operator: "group",
      threshold_value: null,
      logical_connector: topLevel.length === 0 ? "AND" : rule.operator,
      parent_condition_id: null,
      position: 0,
      question_text: null,
      question_type: null,
      children: grouped.get(group.id) ?? [],
    })
  }

  return {
    id: rule.id,
    survey_id: rule.survey_id,
    name: rule.name,
    description: rule.description,
    enabled: true,
    action_type: "none",
    conditions: topLevel,
    status: rule.status,
    created_at: rule.created_at,
    updated_at: rule.updated_at,
  }
}

function logicPayloadToRuleApi(payload: LogicRulePayload): RuleApiPayload {
  const groups: RuleGroupApi[] = []
  const conditions: RuleConditionApi[] = []

  for (const item of payload.conditions) {
    if (item.operator === "group") {
      const groupId = item.id ?? crypto.randomUUID()
      groups.push({
        id: groupId,
        operator: item.children[1]?.logical_connector ?? "AND",
      })
      for (const child of item.children) {
        conditions.push(logicLeafToRuleApi(child, groupId))
      }
      continue
    }
    conditions.push(logicLeafToRuleApi(item, null))
  }

  return {
    name: payload.name,
    description: payload.description,
    operator: payload.conditions[1]?.logical_connector ?? "AND",
    groups,
    conditions,
  }
}

function logicLeafToRuleApi(condition: LogicConditionPayload, group_id: string | null): RuleConditionApi {
  if (condition.operator === "not_blank") {
    return {
      id: condition.id ?? null,
      condition_type: "not_empty",
      question_id: condition.question_id,
      operator: null,
      value: null,
      group_id,
    }
  }
  if (condition.operator === "sentiment_positive" || condition.operator === "sentiment_negative") {
    return {
      id: condition.id ?? null,
      condition_type: "sentiment",
      question_id: condition.question_id,
      operator: "is",
      value: condition.operator === "sentiment_positive" ? "positive" : "negative",
      group_id,
    }
  }
  const mappedOperator =
    condition.operator === ">"
      ? "gt"
      : condition.operator === ">="
        ? "gte"
        : condition.operator === "<"
          ? "lt"
          : condition.operator === "<="
            ? "lte"
            : "eq"
  return {
    id: condition.id ?? null,
    condition_type: "rating",
    question_id: condition.question_id,
    operator: mappedOperator,
    value: condition.threshold_value != null ? String(condition.threshold_value) : null,
    group_id,
  }
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
  is_archived?: boolean
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
  is_archived?: boolean
}

export interface AnalyticsFiltersResponse {
  surveys: AnalyticsFilterOption[]
  qr_codes: AnalyticsFilterOption[]
  locations: AnalyticsFilterOption[]
}

export interface AnalyticsAnswerDetail {
  question_text: string
  answer_value: string
  has_photo?: boolean
  question_id?: string | null
  position: number
  question_type?: string | null
  sentiment?: string | null
}

export interface PhotoSignedUrlResponse {
  signed_url: string
  expires_in_seconds: number
}

export interface AnalyticsResponseDetail {
  response_id: string
  survey_name: string
  answers: AnalyticsAnswerDetail[]
  /** Flow automation runs for this submission (from API; may be absent on stale caches). */
  flow_runs?: FlowRunResponse[]
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
  include_archived?: boolean
}

// Advanced filter types — mirror the backend AdvancedFilterPayload schema

export interface AdvFilterConditionPayload {
  condition_type: RuleConditionType
  question_id: string
  operator: RuleOperatorApi | null
  value: string | string[] | null
  group_local_id: string | null
}

export interface AdvFilterGroupPayload {
  local_id: string
  operator: "AND" | "OR"
}

export interface AdvancedFilterApiPayload {
  survey_id: string
  operator: "AND" | "OR"
  groups: AdvFilterGroupPayload[]
  conditions: AdvFilterConditionPayload[]
}

// ------------------------------------------------------------------
// Auth helpers
// ------------------------------------------------------------------
// ------------------------------------------------------------------
// Active company ID — injected into every authenticated request
// ------------------------------------------------------------------
let _activeCompanyId: string | null = null

export function setApiCompanyId(id: string | null): void {
  _activeCompanyId = id
}

function companyHeader(): Record<string, string> {
  return _activeCompanyId ? { "X-Company-ID": _activeCompanyId } : {}
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...companyHeader(),
  }
}

function authGetHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}`, ...companyHeader() }
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
export async function fetchSurveyRedirect(
  qrCodeId: string,
  idempotencyKey?: string,
): Promise<SurveyRedirectResponse> {
  const headers: Record<string, string> = {}
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey
  return apiFetch<SurveyRedirectResponse>(
    `${BACKEND_BASE}/api/v1/survey/redirect?r=${encodeURIComponent(qrCodeId)}`,
    { headers },
  )
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
  photoFiles: Record<string, File> = {},
): Promise<SurveySubmitResponse> {
  const form = new FormData()
  form.append("session_id", sessionId)
  form.append("qr_code_id", qrCodeId)
  form.append("answers_json", JSON.stringify(answers))
  for (const [questionId, file] of Object.entries(photoFiles)) {
    form.append(`photo_${questionId}`, file)
  }

  let res: Response
  try {
    // Do NOT set Content-Type header — the browser sets it automatically with
    // the correct multipart boundary when using FormData.
    res = await fetch(`${BACKEND_BASE}/api/v1/survey/submit`, {
      method: "POST",
      body: form,
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

export async function recordRedirectConfirmation(
  sessionId: string,
  qrCodeId: string,
): Promise<{ recorded: boolean }> {
  return apiFetch<{ recorded: boolean }>(
    `${BACKEND_BASE}/api/v1/survey/redirect-confirmation?session=${encodeURIComponent(sessionId)}&qr=${encodeURIComponent(qrCodeId)}`,
    { method: "POST" },
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

export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`${BACKEND_BASE}/api/v1/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  })
}

export async function confirmEmail(accessToken: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`${BACKEND_BASE}/api/v1/user/confirm-email`, {
    method: "POST",
    headers: authHeaders(accessToken),
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
      timezone: payload.timezone,
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

export async function completeJoin(accessToken: string): Promise<UserResponse> {
  return apiFetch<UserResponse>(`${BACKEND_BASE}/api/v1/me/complete-join`, {
    method: "POST",
    headers: authHeaders(accessToken),
  })
}

export interface CompleteInviteRequest {
  first_name: string
  last_name: string
  timezone: string
}

export async function completeInviteSetup(
  accessToken: string,
  payload: CompleteInviteRequest,
): Promise<UserResponse> {
  return apiFetch<UserResponse>(`${BACKEND_BASE}/api/v1/me/complete-invite`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify(payload),
  })
}

export async function patchUserTimezone(
  accessToken: string,
  timezone: string,
): Promise<UserResponse> {
  return apiFetch<UserResponse>(`${BACKEND_BASE}/api/v1/user/timezone`, {
    method: "PATCH",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ timezone }),
  })
}

// ------------------------------------------------------------------
// Locations
// ------------------------------------------------------------------
export async function fetchLocations(
  accessToken: string,
  options?: { archived?: boolean },
): Promise<LocationResponse[]> {
  const q = options?.archived === true ? "?archived=true" : ""
  return apiFetch<LocationResponse[]>(`${BACKEND_BASE}/api/v1/locations${q}`, {
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

export async function archiveLocation(
  accessToken: string,
  id: string,
  updatedAt: string,
): Promise<LocationResponse> {
  return apiFetch<LocationResponse>(`${BACKEND_BASE}/api/v1/locations/${id}/archive`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ updated_at: updatedAt }),
  })
}

export async function unarchiveLocation(
  accessToken: string,
  id: string,
  updatedAt: string,
): Promise<LocationResponse> {
  return apiFetch<LocationResponse>(`${BACKEND_BASE}/api/v1/locations/${id}/unarchive`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ updated_at: updatedAt }),
  })
}

export async function deleteArchivedLocation(
  accessToken: string,
  id: string,
  updatedAt: string,
): Promise<void> {
  await apiFetch<unknown>(`${BACKEND_BASE}/api/v1/locations/${id}/delete`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ updated_at: updatedAt }),
  })
}

export async function syncLocationNotificationGroups(
  accessToken: string,
  locationId: string,
  groupIds: string[],
  locationUpdatedAt: string,
): Promise<NotificationGroupResponse[]> {
  return apiFetch<NotificationGroupResponse[]>(
    `${BACKEND_BASE}/api/v1/locations/${locationId}/notification-groups`,
    {
      method: "PUT",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ group_ids: groupIds, location_updated_at: locationUpdatedAt }),
    },
  )
}

export interface LocationFlowDependencies {
  google_business_url_flows: { id: string; name: string }[]
  notification_group_flows: { id: string; name: string }[]
}

export async function getLocationFlowDependencies(
  accessToken: string,
  locationId: string,
): Promise<LocationFlowDependencies> {
  return apiFetch<LocationFlowDependencies>(
    `${BACKEND_BASE}/api/v1/locations/${locationId}/flow-dependencies`,
    { headers: authGetHeaders(accessToken) },
  )
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
export async function fetchSurveys(
  accessToken: string,
  options?: { activeOnly?: boolean },
): Promise<SurveySummary[]> {
  const url = options?.activeOnly
    ? `${BACKEND_BASE}/api/v1/surveys?status=active`
    : `${BACKEND_BASE}/api/v1/surveys`
  const raw = await apiFetch<Array<{ id: string; title?: string; name?: string; status: string }>>(
    url,
    { headers: authGetHeaders(accessToken) },
  )
  return raw.map(({ id, title, name, status }) => ({
    id,
    name: name ?? title ?? "Untitled",
    status,
  }))
}

// ------------------------------------------------------------------
// Location Surveys
// ------------------------------------------------------------------
export async function fetchLocationSurveys(
  accessToken: string,
  filters?: { survey_id?: string; location_id?: string },
): Promise<LocationSurveyResponse[]> {
  const params = new URLSearchParams()
  if (filters?.survey_id) params.set("survey_id", filters.survey_id)
  if (filters?.location_id) params.set("location_id", filters.location_id)
  const suffix = params.toString() ? `?${params.toString()}` : ""
  return apiFetch<LocationSurveyResponse[]>(`${BACKEND_BASE}/api/v1/location-surveys${suffix}`, {
    headers: authGetHeaders(accessToken),
  })
}

// ------------------------------------------------------------------
// QR Codes
// ------------------------------------------------------------------
export async function fetchQRCodes(
  accessToken: string,
  options?: { archived?: boolean },
): Promise<QRCodeResponse[]> {
  const q = options?.archived === true ? "?archived=true" : ""
  return apiFetch<QRCodeResponse[]>(`${BACKEND_BASE}/api/v1/qr-codes${q}`, {
    headers: authGetHeaders(accessToken),
  })
}

export async function fetchQRSubmissionBlockedSummary(
  accessToken: string,
): Promise<{ submission_blocked_active_qr_count: number }> {
  return apiFetch<{ submission_blocked_active_qr_count: number }>(
    `${BACKEND_BASE}/api/v1/qr-codes/submission-blocked-summary`,
    { headers: authGetHeaders(accessToken) },
  )
}

export async function fetchQRCode(accessToken: string, id: string): Promise<QRCodeResponse> {
  return apiFetch<QRCodeResponse>(`${BACKEND_BASE}/api/v1/qr-codes/${id}`, {
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

export async function archiveQRCode(
  accessToken: string,
  id: string,
  updatedAt: string,
): Promise<QRCodeResponse> {
  return apiFetch<QRCodeResponse>(`${BACKEND_BASE}/api/v1/qr-codes/${id}/archive`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ updated_at: updatedAt }),
  })
}

export async function unarchiveQRCode(
  accessToken: string,
  id: string,
  updatedAt: string,
): Promise<QRCodeResponse> {
  return apiFetch<QRCodeResponse>(`${BACKEND_BASE}/api/v1/qr-codes/${id}/unarchive`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ updated_at: updatedAt }),
  })
}

export async function deleteArchivedQRCode(
  accessToken: string,
  id: string,
  updatedAt: string,
): Promise<void> {
  await apiFetch<unknown>(`${BACKEND_BASE}/api/v1/qr-codes/${id}/delete`, {
    method: "POST",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ updated_at: updatedAt }),
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
    last_edited_by: raw.last_edited_by != null ? String(raw.last_edited_by) : null,
    updated_at: String(raw.updated_at ?? raw.updatedAt ?? ""),
    archived_at:
      raw.archived_at != null && String(raw.archived_at).trim() !== ""
        ? String(raw.archived_at)
        : null,
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

export function fetchSurveyLogicRules(
  token: string,
  surveyId: string,
): Promise<LogicRuleBundleResponse> {
  return surveyRequest<RuleApiBundleResponse>(token, `/surveys/${surveyId}/rules`).then((bundle) => ({
    survey_id: bundle.survey_id,
    questions: bundle.questions,
    rules: bundle.rules.map(ruleApiToLegacy),
  }))
}

export function createSurveyLogicRule(
  token: string,
  surveyId: string,
  payload: LogicRulePayload,
): Promise<LogicRuleResponse> {
  return surveyRequest<RuleApiResponse>(
    token,
    `/surveys/${surveyId}/rules`,
    "POST",
    logicPayloadToRuleApi(payload),
  ).then(ruleApiToLegacy)
}

export function updateSurveyLogicRule(
  token: string,
  surveyId: string,
  ruleId: string,
  payload: LogicRulePayload,
): Promise<LogicRuleResponse> {
  return surveyRequest<RuleApiResponse>(
    token,
    `/surveys/${surveyId}/rules/${ruleId}`,
    "PUT",
    logicPayloadToRuleApi(payload),
  ).then(ruleApiToLegacy)
}

export async function deleteSurveyLogicRule(
  token: string,
  surveyId: string,
  ruleId: string,
  updatedAt: string,
): Promise<void> {
  await surveyRequest<unknown>(token, `/surveys/${surveyId}/rules/${ruleId}`, "DELETE", { updated_at: updatedAt })
}

// Direct API functions (no legacy conversion) used by the rules page
export function fetchRuleBundleDirect(token: string, surveyId: string): Promise<RuleBundleData> {
  return surveyRequest<RuleBundleData>(token, `/surveys/${surveyId}/rules`)
}

export function fetchCompanyBrokenRuleSummary(
  token: string,
): Promise<{ broken_rule_count: number }> {
  return surveyRequest<{ broken_rule_count: number }>(token, "/rules/broken-summary")
}

export function fetchCompanyBrokenFlowSummary(
  token: string,
): Promise<{ broken_flow_count: number }> {
  return surveyRequest<{ broken_flow_count: number }>(token, "/flows/broken-summary")
}

export function createRuleDirect(
  token: string,
  surveyId: string,
  payload: RuleCreatePayload,
): Promise<RuleData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return surveyRequest<RuleData>(token, `/surveys/${surveyId}/rules`, "POST", payload as any)
}

export function updateRuleDirect(
  token: string,
  surveyId: string,
  ruleId: string,
  payload: RuleUpdatePayload,
): Promise<RuleData> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return surveyRequest<RuleData>(token, `/surveys/${surveyId}/rules/${ruleId}`, "PUT", payload as any)
}

export function fetchSurveyFlows(
  token: string,
  surveyId: string,
): Promise<FlowResponse[]> {
  return surveyRequest<FlowResponse[]>(token, `/surveys/${surveyId}/flows`)
}

export function fetchFlows(token: string): Promise<FlowResponse[]> {
  return surveyRequest<FlowResponse[]>(token, "/flows")
}

export function fetchFlow(token: string, flowId: string): Promise<FlowResponse> {
  return surveyRequest<FlowResponse>(token, `/flows/${flowId}`)
}

export function createSurveyFlow(
  token: string,
  surveyId: string,
  payload: FlowPayload,
): Promise<FlowResponse> {
  return surveyRequest<FlowResponse>(
    token,
    `/surveys/${surveyId}/flows`,
    "POST",
    payload,
  )
}

export function updateSurveyFlow(
  token: string,
  surveyId: string,
  flowId: string,
  payload: FlowUpdatePayload,
): Promise<FlowResponse> {
  return surveyRequest<FlowResponse>(
    token,
    `/surveys/${surveyId}/flows/${flowId}`,
    "PUT",
    payload,
  )
}

/** Toggle flow availability without sending the full node graph. */
export function setSurveyFlowActive(
  token: string,
  surveyId: string,
  flowId: string,
  body: { is_active: boolean; updated_at: string },
): Promise<FlowResponse> {
  return surveyRequest<FlowResponse>(
    token,
    `/surveys/${surveyId}/flows/${flowId}/active`,
    "PATCH",
    body,
  )
}

export async function deleteSurveyFlow(
  token: string,
  surveyId: string,
  flowId: string,
  updatedAt: string,
): Promise<void> {
  await surveyRequest<unknown>(token, `/surveys/${surveyId}/flows/${flowId}`, "DELETE", { updated_at: updatedAt })
}

export function fetchFlowDeletePreview(
  token: string,
  surveyId: string,
  flowId: string,
): Promise<{ assignment_count: number }> {
  return surveyRequest<{ assignment_count: number }>(token, `/surveys/${surveyId}/flows/${flowId}/delete-preview`)
}

export function testFlow(
  token: string,
  flowId: string,
  payload: { mock_response: Record<string, unknown>; location_survey_id: string; qr_code_id?: string | null },
): Promise<FlowTestResponse> {
  return surveyRequest<FlowTestResponse>(
    token,
    `/flows/${flowId}/test`,
    "POST",
    payload,
  )
}

export function fetchNotificationGroups(
  token: string,
): Promise<NotificationGroupResponse[]> {
  return surveyRequest<NotificationGroupResponse[]>(token, "/notification-groups")
}

export function createNotificationGroup(
  token: string,
  payload: { name: string },
): Promise<NotificationGroupResponse> {
  return surveyRequest<NotificationGroupResponse>(
    token,
    "/notification-groups",
    "POST",
    payload,
  )
}

export function updateNotificationGroup(
  token: string,
  groupId: string,
  payload: { name: string; members: Array<{ name: string; email: string }>; updated_at: string },
): Promise<NotificationGroupResponse> {
  return surveyRequest<NotificationGroupResponse>(
    token,
    `/notification-groups/${groupId}`,
    "PUT",
    payload,
  )
}

export function addNotificationGroupMember(
  token: string,
  groupId: string,
  payload: { name: string; email: string },
): Promise<NotificationGroupResponse> {
  return surveyRequest<NotificationGroupResponse>(
    token,
    `/notification-groups/${groupId}/members`,
    "POST",
    payload,
  )
}

export function assignNotificationGroupToLocation(
  token: string,
  locationId: string,
  payload: { group_id: string },
): Promise<NotificationGroupResponse> {
  return surveyRequest<NotificationGroupResponse>(
    token,
    `/locations/${locationId}/notification-groups`,
    "POST",
    payload,
  )
}

export async function deleteNotificationGroup(
  token: string,
  groupId: string,
  updatedAt: string,
): Promise<void> {
  await surveyRequest<unknown>(token, `/notification-groups/${groupId}`, "DELETE", { updated_at: updatedAt })
}

export const FLOW_RUNS_PAGE_SIZE = 20

export function fetchFlowRuns(
  token: string,
  options?: { page?: number; pageSize?: number },
): Promise<FlowRunListResponse> {
  const page = options?.page ?? 1
  const pageSize = Math.min(
    FLOW_RUNS_PAGE_SIZE,
    Math.max(1, options?.pageSize ?? FLOW_RUNS_PAGE_SIZE),
  )
  const q = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  })
  return surveyRequest<FlowRunListResponse>(token, `/flow-runs?${q.toString()}`)
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
  data: { title?: string; status?: string; updated_at: string },
): Promise<SurveyListItem> {
  return surveyRequest<SurveyListItem>(token, `/surveys/${id}`, "PATCH", data)
}

export function publishSurvey(token: string, id: string, updatedAt: string): Promise<SurveyListItem> {
  return surveyRequest<SurveyListItem>(token, `/surveys/${id}/publish`, "PATCH", { updated_at: updatedAt })
}

export function archiveSurvey(token: string, id: string, updatedAt: string): Promise<SurveyListItem> {
  return surveyRequest<SurveyListItem>(token, `/surveys/${id}/archive`, "PATCH", { updated_at: updatedAt })
}

export function unpublishSurvey(token: string, id: string, updatedAt: string): Promise<SurveyListItem> {
  return surveyRequest<SurveyListItem>(token, `/surveys/${id}/unpublish`, "PATCH", { updated_at: updatedAt })
}

export function unarchiveSurvey(token: string, id: string, updatedAt: string): Promise<SurveyListItem> {
  return surveyRequest<SurveyListItem>(token, `/surveys/${id}/unarchive`, "PATCH", { updated_at: updatedAt })
}

export async function deleteArchivedSurvey(token: string, id: string, updatedAt: string): Promise<void> {
  await surveyRequest<unknown>(token, `/surveys/${id}/delete`, "POST", { updated_at: updatedAt })
}

export function duplicateSurvey(token: string, id: string): Promise<SurveyWithSchema> {
  return surveyRequest<SurveyWithSchema>(token, `/surveys/${id}/duplicate`, "POST")
}

// ------------------------------------------------------------------
// Analytics
// ------------------------------------------------------------------
function _buildAnalyticsParams(
  filters: AnalyticsFilters,
  advancedFilter?: AdvancedFilterApiPayload | null,
): URLSearchParams {
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
  if (filters.include_archived === true) p.set("include_archived", "true")
  if (advancedFilter && advancedFilter.conditions.length > 0) {
    p.set("advanced_filter", JSON.stringify(advancedFilter))
  }
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

export function fetchHasUnreadReviews(token: string): Promise<{ has_unread: boolean }> {
  return _analyticsRequest<{ has_unread: boolean }>(token, "/analytics/has-unread")
}

export function fetchUnreadResponseCount(token: string): Promise<{ count: number }> {
  return _analyticsRequest<{ count: number }>(token, "/analytics/unread-count")
}

export interface NewResponseNotification {
  response_id: string
  survey_name: string
  location_name: string
  qr_code_title: string
  submitted_at: string
}

export function fetchNewResponses(
  token: string,
  since: string,
): Promise<{ responses: NewResponseNotification[] }> {
  return _analyticsRequest<{ responses: NewResponseNotification[] }>(
    token,
    `/analytics/new-responses?since=${encodeURIComponent(since)}`,
  )
}

export function fetchAnalyticsFilters(token: string): Promise<AnalyticsFiltersResponse> {
  return _analyticsRequest<AnalyticsFiltersResponse>(token, "/analytics/filters")
}

export function fetchAnalyticsResponses(
  token: string,
  filters: AnalyticsFilters,
  advancedFilter?: AdvancedFilterApiPayload | null,
): Promise<AnalyticsResponseList> {
  return _analyticsRequest<AnalyticsResponseList>(
    token,
    "/analytics/responses",
    _buildAnalyticsParams(filters, advancedFilter),
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

export function fetchPhotoSignedUrl(
  token: string,
  responseId: string,
  questionId: string,
): Promise<PhotoSignedUrlResponse> {
  return _analyticsRequest<PhotoSignedUrlResponse>(
    token,
    `/analytics/response/${responseId}/photo/${questionId}`,
  )
}

export async function deleteAnalyticsResponse(
  accessToken: string,
  responseId: string,
  confirmation: string,
): Promise<void> {
  await apiFetch<unknown>(`${BACKEND_BASE}/api/v1/analytics/response/${responseId}`, {
    method: "DELETE",
    headers: authHeaders(accessToken),
    body: JSON.stringify({ confirmation }),
  })
}

// ------------------------------------------------------------------
// Survey Dashboard
// ------------------------------------------------------------------

export interface SurveyDashboardAPIParams {
  location_ids?: string[]
  qr_code_ids?: string[]
  date_start?: string
  date_end?: string
  include_archived?: boolean
}

function buildDashboardQueryString(params: SurveyDashboardAPIParams): string {
  const p = new URLSearchParams()
  params.location_ids?.forEach((id) => p.append("location_ids", id))
  params.qr_code_ids?.forEach((id) => p.append("qr_code_ids", id))
  if (params.date_start) p.set("date_start", params.date_start)
  if (params.date_end) p.set("date_end", params.date_end)
  if (params.include_archived === true) p.set("include_archived", "true")
  return p.toString()
}

export async function getSurveyDashboard<T = unknown>(
  token: string,
  surveyId: string,
  params: SurveyDashboardAPIParams
): Promise<T> {
  const qs = buildDashboardQueryString(params)
  return apiFetch<T>(`${BACKEND_BASE}/api/v1/surveys/${surveyId}/dashboard?${qs}`, {
    headers: authGetHeaders(token),
  })
}

export async function getSurveyDashboardOldQuestions<T = unknown>(
  token: string,
  surveyId: string,
  params: SurveyDashboardAPIParams
): Promise<T> {
  const qs = buildDashboardQueryString(params)
  return apiFetch<T>(
    `${BACKEND_BASE}/api/v1/surveys/${surveyId}/dashboard/old-questions?${qs}`,
    { headers: authGetHeaders(token) }
  )
}

export async function getQuestionBreakdown<T = unknown>(
  token: string,
  surveyId: string,
  params: SurveyDashboardAPIParams & { question_id: string; breakdown_by: "location" | "qr_code" }
): Promise<T> {
  const p = new URLSearchParams(buildDashboardQueryString(params))
  p.set("question_id", params.question_id)
  p.set("breakdown_by", params.breakdown_by)
  return apiFetch<T>(
    `${BACKEND_BASE}/api/v1/surveys/${surveyId}/dashboard/question-breakdown?${p.toString()}`,
    { headers: authGetHeaders(token) }
  )
}

export async function getEngagementBreakdown<T = unknown>(
  token: string,
  surveyId: string,
  params: SurveyDashboardAPIParams & { breakdown_by: "location" | "qr_code" }
): Promise<T> {
  const p = new URLSearchParams(buildDashboardQueryString(params))
  p.set("breakdown_by", params.breakdown_by)
  return apiFetch<T>(
    `${BACKEND_BASE}/api/v1/surveys/${surveyId}/dashboard/engagement-breakdown?${p.toString()}`,
    { headers: authGetHeaders(token) }
  )
}

// ------------------------------------------------------------------
// Billing
// ------------------------------------------------------------------

export interface SubscriptionResponse {
  status: string
  trial_end: string | null
  current_period_end: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  plan_display_name: string | null
  billing_interval: string | null
  cancel_at_period_end: boolean
  location_count: number | null
  is_active: boolean
}

export async function fetchSubscription(
  accessToken: string
): Promise<SubscriptionResponse> {
  return apiFetch<SubscriptionResponse>(
    `${BACKEND_BASE}/api/v1/billing/subscription`,
    { headers: authGetHeaders(accessToken) }
  )
}

export interface SubscriptionWarning {
  type: string  // "OVER_LIMIT" | "FEATURE_DOWNGRADED"
  feature: string  // "locations" | "active_surveys" | "active_flows" | "photo_feedback"
  message: string
  limit?: number
  current?: number
}

export interface SubscriptionStatusResponse {
  plan: string | null
  over_limit: Record<string, boolean>
  warnings: SubscriptionWarning[]
  can_invite_users: boolean
  max_company_members: number
}

export async function fetchSubscriptionStatus(
  accessToken: string
): Promise<SubscriptionStatusResponse> {
  return apiFetch<SubscriptionStatusResponse>(
    `${BACKEND_BASE}/api/v1/me/subscription/status`,
    { headers: authGetHeaders(accessToken) }
  )
}

export type CheckoutBillingInterval = "monthly" | "yearly"

export interface CreateCheckoutSessionBody {
  locationCount: number
  billingInterval: CheckoutBillingInterval
}

export async function createCheckoutSession(
  accessToken: string,
  body: CreateCheckoutSessionBody
): Promise<{ checkout_url: string }> {
  return apiFetch<{ checkout_url: string }>(
    `${BACKEND_BASE}/api/v1/billing/checkout`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        location_count: body.locationCount,
        billing_interval: body.billingInterval,
      }),
    }
  )
}

export async function createPortalSession(
  accessToken: string
): Promise<{ portal_url: string }> {
  return apiFetch<{ portal_url: string }>(
    `${BACKEND_BASE}/api/v1/billing/portal`,
    { method: "POST", headers: authHeaders(accessToken) }
  )
}

export async function recordCheckoutFailed(
  accessToken: string
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(
    `${BACKEND_BASE}/api/v1/billing/checkout-failed`,
    { method: "POST", headers: authHeaders(accessToken) }
  )
}

export interface SyncSubscriptionResponse extends SubscriptionResponse {
  /** True when Stripe was reachable and the sync completed. False when Stripe
   *  was unavailable — the returned subscription data reflects the last known
   *  DB state and has not been updated. */
  sync_successful: boolean
}

export async function syncSubscription(
  accessToken: string
): Promise<SyncSubscriptionResponse> {
  return apiFetch<SyncSubscriptionResponse>(
    `${BACKEND_BASE}/api/v1/billing/sync-subscription`,
    { method: "POST", headers: authHeaders(accessToken) }
  )
}

export async function verifyCheckoutSession(
  accessToken: string,
  sessionId: string
): Promise<{ ok: boolean }> {
  const q = new URLSearchParams({ session_id: sessionId })
  return apiFetch<{ ok: boolean }>(
    `${BACKEND_BASE}/api/v1/billing/verify-checkout-session?${q.toString()}`,
    { headers: authGetHeaders(accessToken) }
  )
}

// ------------------------------------------------------------------
// Company User Management
// ------------------------------------------------------------------

export interface CompanyMemberResponse {
  membership_id: string
  user_id: string
  email: string
  first_name: string
  last_name: string
  role: "company_owner" | "company_admin" | "viewer"
  all_surveys: boolean
  all_locations: boolean
  invited_by_name: string | null
  timezone: string
  last_login_at: string | null
  created_at: string
}

export interface InviteUserRequest {
  email: string
  first_name: string
  last_name: string
  role?: "viewer" | "company_admin"
}

export interface ViewerPermissionsResponse {
  membership_id: string
  all_surveys: boolean
  all_locations: boolean
  survey_ids: string[]
  location_ids: string[]
}

export interface SetViewerPermissionsRequest {
  all_surveys: boolean
  all_locations: boolean
  survey_ids: string[]
  location_ids: string[]
}

export async function fetchCompanyUsers(
  accessToken: string
): Promise<CompanyMemberResponse[]> {
  return apiFetch<CompanyMemberResponse[]>(
    `${BACKEND_BASE}/api/v1/company/users`,
    { headers: authGetHeaders(accessToken) }
  )
}

export async function inviteCompanyUser(
  accessToken: string,
  payload: InviteUserRequest
): Promise<CompanyMemberResponse> {
  return apiFetch<CompanyMemberResponse>(
    `${BACKEND_BASE}/api/v1/company/users/invite`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  )
}

export async function getViewerPermissions(
  accessToken: string,
  membershipId: string
): Promise<ViewerPermissionsResponse> {
  return apiFetch<ViewerPermissionsResponse>(
    `${BACKEND_BASE}/api/v1/company/users/${membershipId}/permissions`,
    { headers: authGetHeaders(accessToken) }
  )
}

export async function setViewerPermissions(
  accessToken: string,
  membershipId: string,
  payload: SetViewerPermissionsRequest
): Promise<ViewerPermissionsResponse> {
  return apiFetch<ViewerPermissionsResponse>(
    `${BACKEND_BASE}/api/v1/company/users/${membershipId}/permissions`,
    {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify(payload),
    }
  )
}

export async function removeCompanyUser(
  accessToken: string,
  membershipId: string
): Promise<void> {
  await apiFetch<void>(
    `${BACKEND_BASE}/api/v1/company/users/${membershipId}`,
    { method: "DELETE", headers: authGetHeaders(accessToken) }
  )
}

export async function transferOwnership(
  accessToken: string,
  membershipId: string
): Promise<void> {
  await apiFetch<{ ok: boolean }>(
    `${BACKEND_BASE}/api/v1/company/users/${membershipId}/transfer-ownership`,
    { method: "POST", headers: authGetHeaders(accessToken) }
  )
}

export async function promoteToAdmin(
  accessToken: string,
  membershipId: string
): Promise<CompanyMemberResponse> {
  return apiFetch<CompanyMemberResponse>(
    `${BACKEND_BASE}/api/v1/company/users/${membershipId}/promote-to-admin`,
    { method: "POST", headers: authGetHeaders(accessToken) }
  )
}

