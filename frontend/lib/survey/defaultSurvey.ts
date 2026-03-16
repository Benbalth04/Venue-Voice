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

  questions: [
    {
      id: crypto.randomUUID(),
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
        selected_colour: "#7C3AED",
      },
    },
  ],
}
