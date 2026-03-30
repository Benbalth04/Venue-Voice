"use client"

import { useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"

declare global {
  interface Window {
    $crisp: any[]
    CRISP_WEBSITE_ID: string
  }
}

const CRISP_WEBSITE_ID = "9393c163-16cc-4983-ac2b-7a9a0c2671ca"

export function CrispChat() {
  const { user } = useAuth()

  // Load Crisp script once on mount
  useEffect(() => {
    if (typeof window === "undefined" || window.$crisp) return
    window.$crisp = []
    window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID
    const s = document.createElement("script")
    s.src = "https://client.crisp.chat/l.js"
    s.async = true
    document.head.appendChild(s)
  }, [])

  // Identify user when auth data becomes available
  useEffect(() => {
    if (!user || typeof window === "undefined" || !window.$crisp) return
    window.$crisp.push(["set", "user:email", [user.email]])
    window.$crisp.push(["set", "user:nickname", [`${user.first_name} ${user.last_name}`]])
    window.$crisp.push(["set", "session:data", [[
      ["user_id", user.id],
      ["company_name", user.company_name ?? ""],
      ["email_verified", String(user.email_verified)],
      ["onboarding_complete", String(user.onboarding_complete)],
    ]]])
  }, [user])

  return null
}
