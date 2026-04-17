import type { Survey } from "@/lib/survey/types"

export const defaultSurvey: Survey = {
  version: 1,

  title: {
    text: "Customer Feedback",
    style: { size: "h1" },
  },

  subtitle: {
    text: "Tell us about your experience",
    style: { size: "body" },
  },

  theme: {
    primaryColor: "#7C3AED",
    backgroundColor: "#FFFFFF",
    textColor: "#1E1E1E",
    fontFamily: "Inter",
  },

  settings: {
    contentAlign: "left",
    showProgressBar: true,
    progressBarColor: "#7C3AED",
  },

  questions: [],

  thankYou: {
    title: "Thank you!",
    content: "Your feedback has been received.",
  },
}
