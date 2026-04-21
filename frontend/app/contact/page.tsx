"use client"

import { useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AuthShell } from "@/components/auth/AuthShell"

const BACKEND_BASE = process.env.NEXT_PUBLIC_BACKEND_BASE_URL

export default function ContactPage() {
  const [name, setName] = useState("")
  const [company, setCompany] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [numLocations, setNumLocations] = useState("")
  const [message, setMessage] = useState("")

  const [fieldErrors, setFieldErrors] = useState<{
    name?: string
    company?: string
    email?: string
    numLocations?: string
    message?: string
  }>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  function validate(): boolean {
    const errs: typeof fieldErrors = {}
    if (!name.trim()) errs.name = "Name is required"
    if (!company.trim()) errs.company = "Company is required"
    if (!email.trim()) errs.email = "Email is required"
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Please enter a valid email address"
    if (!numLocations) errs.numLocations = "Number of locations is required"
    else if (parseInt(numLocations, 10) < 1) errs.numLocations = "Must be at least 1"
    if (!message.trim()) errs.message = "Message is required"
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    if (!validate()) return
    setLoading(true)
    try {
      const res = await fetch(`${BACKEND_BASE}/api/v1/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          company: company.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          num_locations: parseInt(numLocations, 10),
          message: message.trim(),
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const msg = data?.message ?? "Something went wrong. Please try again."
        setError(msg)
        return
      }
      setSubmitted(true)
    } catch {
      setError("Unable to send your message. Please check your connection and try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <div className="w-full max-w-md">
        <Card className="p-8">
          {submitted ? (
            <div className="text-center py-4">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-violet-100">
                <svg className="h-6 w-6 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-zinc-900">Message sent!</h2>
              <p className="mt-2 text-sm text-zinc-600">Thanks for reaching out. We'll be in touch soon.</p>
              <Link
                href="/"
                className="mt-6 inline-block text-sm font-medium text-violet-700 hover:text-violet-800"
              >
                ← Back to home
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold text-zinc-900">Get in touch</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Have a question or not sure where to start?
              </p>

              <form className="mt-6 space-y-4" onSubmit={onSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-zinc-700">Name <span className="text-red-500">*</span></span>
                    <input
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500 ${
                        fieldErrors.name ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white"
                      }`}
                      autoComplete="name"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value)
                        if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: undefined }))
                      }}
                    />
                    {fieldErrors.name && <p className="mt-1 text-xs text-red-600">{fieldErrors.name}</p>}
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-zinc-700">Company <span className="text-red-500">*</span></span>
                    <input
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500 ${
                        fieldErrors.company ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white"
                      }`}
                      autoComplete="organization"
                      value={company}
                      onChange={(e) => {
                        setCompany(e.target.value)
                        if (fieldErrors.company) setFieldErrors((p) => ({ ...p, company: undefined }))
                      }}
                    />
                    {fieldErrors.company && <p className="mt-1 text-xs text-red-600">{fieldErrors.company}</p>}
                  </label>
                </div>

                <label className="block">
                  <span className="text-sm font-medium text-zinc-700">Email <span className="text-red-500">*</span></span>
                  <input
                    className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500 ${
                      fieldErrors.email ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white"
                    }`}
                    autoComplete="email"
                    inputMode="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined }))
                    }}
                  />
                  {fieldErrors.email && <p className="mt-1 text-xs text-red-600">{fieldErrors.email}</p>}
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-zinc-700">Phone <span className="text-zinc-400 font-normal">(optional)</span></span>
                    <input
                      className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500"
                      autoComplete="tel"
                      inputMode="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-zinc-700">No. of locations <span className="text-red-500">*</span></span>
                    <input
                      className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500 ${
                        fieldErrors.numLocations ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white"
                      }`}
                      type="number"
                      min={1}
                      value={numLocations}
                      onChange={(e) => {
                        setNumLocations(e.target.value)
                        if (fieldErrors.numLocations) setFieldErrors((p) => ({ ...p, numLocations: undefined }))
                      }}
                    />
                    {fieldErrors.numLocations && <p className="mt-1 text-xs text-red-600">{fieldErrors.numLocations}</p>}
                  </label>
                </div>

                <label className="block">
                  <span className="text-sm font-medium text-zinc-700">Message <span className="text-red-500">*</span></span>
                  <textarea
                    className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-500 resize-none ${
                      fieldErrors.message ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white"
                    }`}
                    rows={4}
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value)
                      if (fieldErrors.message) setFieldErrors((p) => ({ ...p, message: undefined }))
                    }}
                  />
                  {fieldErrors.message && <p className="mt-1 text-xs text-red-600">{fieldErrors.message}</p>}
                </label>

                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {error}
                  </div>
                )}

                <Button className="w-full" type="submit" disabled={loading}>
                  {loading ? "Sending…" : "Send message"}
                </Button>
                <p className="text-center">
                  <Link
                    href="/"
                    className="text-sm font-medium text-violet-700 hover:text-violet-800"
                  >
                    ← Back to home
                  </Link>
                </p>
              </form>
            </>
          )}
        </Card>
      </div>
    </AuthShell>
  )
}
