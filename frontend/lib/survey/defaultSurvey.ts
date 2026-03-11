import type { Survey } from "@/lib/survey/types"

export const defaultSurvey: Survey = {
  id: 1,
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
    starSelectedColor: "#7C3AED",
  },

  settings: {
    contentAlign: "left",
    showProgressBar: true,
    progressBarColor: "#7C3AED",
  },

  questions: [
    {
      id: 1,
      version: 1,
      type: "star",
      title: {
        text: "How was your experience?",
        style: { size: "h2" },
      },
      description: {
        text: "Please rate your overall experience",
        style: { size: "body" },
      },
      optional: false,
      settings: {
        starCount: 5,
      },
    },
  ],
}

