export type Survey = {
  id: number
  version: number

  title: TextContent
  subtitle?: TextContent

  theme: SurveyTheme

  settings: SurveySettings

  questions: Question[]
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
  starSelectedColor: string
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

export type Question = {
  id: number
  version: number
  type: "star" | "text"

  title: TextContent
  description?: TextContent

  optional: boolean
  contentAlign?: Align

  settings: QuestionSettings
}

export type QuestionSettings = StarQuestionSettings | TextQuestionSettings

export type StarQuestionSettings = {
  starCount: number
}

export type TextQuestionSettings = {
  placeholder?: string
}

