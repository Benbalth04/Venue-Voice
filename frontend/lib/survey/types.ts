export type SurveyThankYou = {
  title: string
  content: string
}

export type Survey = {
  /** Local change counter – incremented on every edit so components re-render.
   *  This is NOT the server-side latest_version. */
  version: number

  title: TextContent
  subtitle?: TextContent

  theme: SurveyTheme
  settings: SurveySettings

  questions: Question[]
  thankYou?: SurveyThankYou
}

export type Align = "left" | "center" | "right"

export type SurveySettings = {
  contentAlign: Align
  showProgressBar: boolean
  progressBarColor: string
}

export type SurveyTheme = {
  primaryColor: string
  backgroundColor: string
  textColor: string
  fontFamily: string
}

export type TextContent = {
  text: string
  style: TextStyle
}

export type TextStyle = {
  bold?: boolean
  underline?: boolean
  size: "h1" | "h2" | "h3" | "body"
}

export type QuestionType =
  | "star"
  | "text"
  | "long_text"
  | "nps"
  | "multiple_choice"
  | "checkbox"
  | "yes_no"
  | "email"
  | "phone"
  | "photo"

export type Question = {
  /** UUID – unique within the survey schema */
  id: string
  version: number
  type: QuestionType

  title: TextContent
  description?: TextContent

  optional: boolean
  contentAlign?: Align

  settings: QuestionSettings
}

export type QuestionSettings =
  | StarQuestionSettings
  | TextQuestionSettings
  | LongTextQuestionSettings
  | NpsQuestionSettings
  | MultipleChoiceSettings
  | CheckboxSettings
  | YesNoSettings
  | EmailQuestionSettings
  | PhoneQuestionSettings
  | PhotoQuestionSettings

export type StarQuestionSettings = {
  starCount: number
  selected_colour?: string
}

export type TextQuestionSettings = {
  placeholder?: string
}

export type LongTextQuestionSettings = {
  placeholder?: string
}

export type NpsQuestionSettings = {
  max_score?: number
  min_label?: string
  max_label?: string
  minLabel?: string
  maxLabel?: string
  selected_colour?: string
}

export type MultipleChoiceSettings = {
  options: string[]
  selected_colour?: string
}

export type CheckboxSettings = {
  options: string[]
  selected_colour?: string
}

export type YesNoSettings = {
  yesLabel?: string
  noLabel?: string
  selected_colour?: string
}

export type EmailQuestionSettings = {
  placeholder?: string
}

export type PhoneQuestionSettings = {
  placeholder?: string
}

export type PhotoQuestionSettings = Record<string, never>
