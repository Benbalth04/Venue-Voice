import type { Align } from "@/lib/survey/types"

export type Business = {
  id: number
  name: string
}

export type Location = {
  id: number
  name: string
  active: boolean
}

export type SurveySummary = {
  id: number
  title: string
  status: "draft" | "active" | "disabled"
  lastEdited: string
  questionCount: number
}

export type QRCode = {
  id: number
  name: string
  surveyId: number
  locationId: number | null
  active: boolean
  scanCount: number
  createdAt: string
}

export type Answer = {
  questionId: number
  type: "star" | "text"
  value: number | string
}

export type Response = {
  id: number
  surveyId: number
  qrCodeId: number
  locationId: number
  timestamp: string
  answers: Answer[]
}

export type ScanEvent = {
  id: number
  qrCodeId: number
  timestamp: string
}

export type AlertRule = {
  id: number
  surveyId: number
  questionId: number
  type: "rating-threshold" | "ai-negative-sentiment"
  condition: string
  email: string
  active: boolean
}

export type AlertEvent = {
  id: number
  time: string
  surveyId: number
  locationId: number
  qrCodeId: number
  responseSnippet: string
}

export const business: Business = {
  id: 1,
  name: "VenueVoice Demo Cafe Group",
}

export const locations: Location[] = [
  { id: 1, name: "Main Cafe", active: true },
  { id: 2, name: "Airport Cafe", active: true },
]

export const surveysSummary: SurveySummary[] = [
  {
    id: 1,
    title: "Customer Feedback",
    status: "active",
    lastEdited: "2026-03-10T09:30:00Z",
    questionCount: 5,
  },
  {
    id: 2,
    title: "Staff Friendliness Pulse",
    status: "draft",
    lastEdited: "2026-03-08T14:15:00Z",
    questionCount: 3,
  },
]

export const qrCodes: QRCode[] = [
  {
    id: 1,
    name: "Front Counter",
    surveyId: 1,
    locationId: 1,
    active: true,
    scanCount: 120,
    createdAt: "2026-03-01T10:00:00Z",
  },
  {
    id: 2,
    name: "Table 3",
    surveyId: 1,
    locationId: 1,
    active: true,
    scanCount: 45,
    createdAt: "2026-03-02T11:00:00Z",
  },
  {
    id: 3,
    name: "Table 7",
    surveyId: 1,
    locationId: 1,
    active: true,
    scanCount: 30,
    createdAt: "2026-03-02T11:05:00Z",
  },
  {
    id: 4,
    name: "Bathroom",
    surveyId: 1,
    locationId: 1,
    active: false,
    scanCount: 10,
    createdAt: "2026-03-03T09:00:00Z",
  },
  {
    id: 5,
    name: "Room 101",
    surveyId: 1,
    locationId: 2,
    active: true,
    scanCount: 22,
    createdAt: "2026-03-04T16:00:00Z",
  },
]

// Simple star/text mix for 10 responses.
export const responses: Response[] = Array.from({ length: 10 }, (_, i) => {
  const id = i + 1
  const surveyId = 1
  const qrCode = qrCodes[(i % qrCodes.length)]
  const locationId = qrCode.locationId ?? 1
  const baseTime = new Date("2026-03-05T09:00:00Z").getTime()
  const timestamp = new Date(baseTime + i * 60 * 60 * 1000).toISOString()

  const starValue = 3 + ((i * 2) % 3) // 3–5 stars
  const textValue =
    i % 3 === 0
      ? "Great coffee and friendly staff."
      : i % 3 === 1
        ? "Service was a bit slow but staff were polite."
        : "Not satisfied with cleanliness in the bathroom."

  return {
    id,
    surveyId,
    qrCodeId: qrCode.id,
    locationId,
    timestamp,
    answers: [
      { questionId: 1, type: "star", value: starValue },
      { questionId: 2, type: "text", value: textValue },
    ],
  }
})

export const scanEvents: ScanEvent[] = qrCodes.flatMap((qr) =>
  Array.from({ length: 5 }, (_, i) => {
    const baseTime = new Date("2026-03-05T08:00:00Z").getTime()
    return {
      id: qr.id * 10 + i,
      qrCodeId: qr.id,
      timestamp: new Date(baseTime + (qr.id + i) * 60 * 60 * 1000).toISOString(),
    }
  }),
)

export const alertRules: AlertRule[] = [
  {
    id: 1,
    surveyId: 1,
    questionId: 1,
    type: "rating-threshold",
    condition: "rating <= 2",
    email: "ops@venuevoice-demo.com",
    active: true,
  },
  {
    id: 2,
    surveyId: 1,
    questionId: 2,
    type: "ai-negative-sentiment",
    condition: "sentiment = negative",
    email: "cx@venuevoice-demo.com",
    active: true,
  },
]

export const alertEvents: AlertEvent[] = [
  {
    id: 1,
    time: "2026-03-09T10:15:00Z",
    surveyId: 1,
    locationId: 1,
    qrCodeId: 4,
    responseSnippet: "Not satisfied with cleanliness in the bathroom.",
  },
  {
    id: 2,
    time: "2026-03-10T18:22:00Z",
    surveyId: 1,
    locationId: 2,
    qrCodeId: 5,
    responseSnippet: "Room was noisy and staff were unhelpful.",
  },
]

