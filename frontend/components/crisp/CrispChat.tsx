"use client"

import { useEffect, useRef, useState } from "react"
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
  const [hovered, setHovered] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [visible, setVisible] = useState(false)
  const readyRef = useRef(false)

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

  // Track chat open/close and widget ready state
  useEffect(() => {
    if (typeof window === "undefined") return
    const interval = setInterval(() => {
      if (window.$crisp && !readyRef.current) {
        readyRef.current = true
        window.$crisp.push(["on", "chat:opened", () => setChatOpen(true)])
        window.$crisp.push(["on", "chat:closed", () => setChatOpen(false)])
        clearInterval(interval)
      }
    }, 300)
    return () => clearInterval(interval)
  }, [])

  // Identify user when auth data becomes available; reset and hide on logout
  useEffect(() => {
    if (typeof window === "undefined" || !window.$crisp) return
    if (!user) {
      window.$crisp.push(["do", "session:reset"])
      window.$crisp.push(["do", "chat:hide"])
      setVisible(false)
      return
    }
    window.$crisp.push(["set", "user:email", [user.email]])
    window.$crisp.push(["set", "user:nickname", [`${user.first_name} ${user.last_name}`]])
    window.$crisp.push(["set", "session:data", [[
      ["user_id", user.id],
      ["company_name", user.company_name ?? ""],
      ["email_verified", String(user.email_verified)],
      ["onboarding_complete", String(user.onboarding_complete)],
    ]]])
    window.$crisp.push(["do", "chat:show"])
    setVisible(true)
  }, [user])

  if (typeof window !== "undefined" && window.self !== window.top) return null
  if (!visible || chatOpen) return null

  return (
    <div
      className="fixed bottom-5 right-5 w-16 h-16 z-[9999999] cursor-pointer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => window.$crisp?.push(["do", "chat:open"])}
      aria-label="Chat with our local support team"
    >
      {hovered && (
        <div className="absolute bottom-full right-0 mb-3 whitespace-nowrap pointer-events-none">
          <span className="bg-fuchsia-600 text-white text-sm font-medium px-3 py-1.5 rounded-full shadow-lg">
            Chat with our local support team
          </span>
        </div>
      )}
    </div>
  )
}
