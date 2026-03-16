"use client"

import type { Survey } from "@/lib/survey/types"

const BROWSER_ID_KEY = "survey-browser-id"

export type SurveyDraft = {
  schema: Survey
  lastDatabaseVersion: number
  updatedAt: string
}

export function getBrowserId(): string {
  const existing = window.localStorage.getItem(BROWSER_ID_KEY)
  if (existing) return existing
  const generated = crypto.randomUUID()
  window.localStorage.setItem(BROWSER_ID_KEY, generated)
  return generated
}

export function getSurveyDraftKey(surveyId: string): string {
  return `draft-survey-${surveyId}-${getBrowserId()}`
}

export function loadSurveyDraft(surveyId: string): SurveyDraft | null {
  const key = getSurveyDraftKey(surveyId)
  const raw = window.localStorage.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SurveyDraft
  } catch {
    window.localStorage.removeItem(key)
    return null
  }
}

export function saveSurveyDraft(surveyId: string, draft: SurveyDraft) {
  const key = getSurveyDraftKey(surveyId)
  window.localStorage.setItem(key, JSON.stringify(draft))
}

export function deleteSurveyDraft(surveyId: string) {
  const key = getSurveyDraftKey(surveyId)
  window.localStorage.removeItem(key)
}
