'use client'

import { motion } from 'framer-motion'
import { CheckCircle2, ArrowRight } from 'lucide-react'
import { ReactNode } from 'react'

export interface FeatureSectionProps {
  id?: string
  label: string
  headline: string
  body: string
  bullets?: string[]
  screenshot: ReactNode
  reverse?: boolean
  tint?: boolean
  cta?: { label: string; href: string }
}

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
}

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
}

export default function FeatureSection({
  id,
  label,
  headline,
  body,
  bullets,
  screenshot,
  reverse = false,
  tint = false,
  cta,
}: FeatureSectionProps) {
  return (
    <section
      id={id}
      className={`py-24 ${tint ? 'bg-violet-50/40' : 'bg-white'}`}
    >
      <div className="max-w-7xl mx-auto px-6">
        <div
          className={`grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center ${
            reverse ? 'lg:grid-flow-dense' : ''
          }`}
        >
          {/* Text block */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
            className={`flex flex-col gap-5 ${reverse ? 'lg:col-start-2' : ''}`}
          >
            <motion.span
              variants={fadeUp}
              className="inline-block self-start text-xs font-bold tracking-[0.18em] uppercase text-violet-600 bg-violet-50 px-3 py-1.5 rounded-full"
            >
              {label}
            </motion.span>

            <motion.h2
              variants={fadeUp}
              className="text-3xl lg:text-4xl font-extrabold text-zinc-900 leading-tight"
              style={{ fontFamily: 'var(--font-bricolage)' }}
            >
              {headline}
            </motion.h2>

            <motion.p
              variants={fadeUp}
              className="text-base text-zinc-500 leading-relaxed"
              style={{ fontFamily: 'var(--font-manrope)' }}
            >
              {body}
            </motion.p>

            {bullets && bullets.length > 0 && (
              <motion.ul variants={containerVariants} className="flex flex-col gap-3">
                {bullets.map((b) => (
                  <motion.li
                    key={b}
                    variants={fadeUp}
                    className="flex items-start gap-3 text-sm text-zinc-600"
                    style={{ fontFamily: 'var(--font-manrope)' }}
                  >
                    <CheckCircle2 className="w-4.5 h-4.5 text-violet-500 shrink-0 mt-0.5" />
                    {b}
                  </motion.li>
                ))}
              </motion.ul>
            )}

            {cta && (
              <motion.div variants={fadeUp}>
                <motion.a
                  href={cta.href}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  className="inline-flex items-center gap-2 h-10 px-5 bg-violet-600 text-white text-sm font-semibold rounded-full hover:bg-violet-700 transition-colors duration-200 self-start"
                  style={{ fontFamily: 'var(--font-manrope)' }}
                >
                  {cta.label}
                  <ArrowRight className="w-3.5 h-3.5" />
                </motion.a>
              </motion.div>
            )}
          </motion.div>

          {/* Screenshot block */}
          <motion.div
            initial={{ opacity: 0, x: reverse ? -30 : 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            className={`relative ${reverse ? 'lg:col-start-1 lg:row-start-1' : ''}`}
          >
            <div className="rounded-2xl overflow-hidden shadow-xl ring-1 ring-zinc-200">
              {screenshot}
            </div>
            {/* Decorative shadow blob */}
            <div
              className="absolute -z-10 inset-4 rounded-2xl blur-2xl opacity-20"
              style={{ background: 'radial-gradient(circle, #8B5CF6, transparent)' }}
            />
          </motion.div>
        </div>
      </div>
    </section>
  )
}

/* ── Screenshot components ─────────────────────────── */

export function SentimentMock() {
  const items = [
    { label: 'Positive', pct: 68, color: 'bg-emerald-500' },
    { label: 'Neutral', pct: 22, color: 'bg-zinc-300' },
    { label: 'Negative', pct: 10, color: 'bg-red-400' },
  ]
  const comments = [
    { text: 'Staff were incredibly attentive', sentiment: 'positive' },
    { text: 'Food arrived cold and late', sentiment: 'negative' },
    { text: 'Decent spot, nothing special', sentiment: 'neutral' },
  ]
  return (
    <div className="bg-white p-6">
      <div className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-4">Sentiment Overview</div>
      <div className="flex flex-col gap-3 mb-6">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <span className="text-xs text-zinc-500 w-16">{item.label}</span>
            <div className="flex-1 bg-zinc-100 rounded-full h-2.5 overflow-hidden">
              <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
            </div>
            <span className="text-xs font-semibold text-zinc-700 w-8 text-right">{item.pct}%</span>
          </div>
        ))}
      </div>
      <div className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-3">Recent Highlights</div>
      <div className="flex flex-col gap-2">
        {comments.map((c, i) => (
          <div key={i} className="flex items-start gap-2.5 text-xs text-zinc-600 bg-zinc-50 rounded-xl p-2.5">
            <span
              className={`shrink-0 mt-0.5 w-2 h-2 rounded-full ${
                c.sentiment === 'positive' ? 'bg-emerald-400' : c.sentiment === 'negative' ? 'bg-red-400' : 'bg-zinc-400'
              }`}
            />
            {c.text}
          </div>
        ))}
      </div>
    </div>
  )
}

export function PhotoQuestionMock() {
  return (
    <div className="bg-white p-6">
      <div className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-4">Survey Preview</div>
      <div className="rounded-2xl bg-zinc-50 border border-zinc-100 p-5">
        <div className="text-sm font-semibold text-zinc-800 mb-1" style={{ fontFamily: 'var(--font-bricolage)' }}>
          How does your table look right now?
        </div>
        <div className="text-xs text-zinc-400 mb-4">Take a quick photo to help us improve.</div>
        <div className="border-2 border-dashed border-violet-200 rounded-xl h-28 flex flex-col items-center justify-center gap-2 bg-violet-50/30 cursor-pointer hover:bg-violet-50 transition-colors">
          <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center">
            <span className="text-violet-500 text-lg">📷</span>
          </div>
          <span className="text-xs text-violet-500 font-medium">Tap to upload photo</span>
        </div>
      </div>
      <div className="mt-4 flex gap-3">
        <div className="flex-1 bg-zinc-50 rounded-xl p-3 text-xs text-zinc-500">Skip this question</div>
        <div className="flex-1 bg-violet-600 rounded-xl p-3 text-xs text-white font-semibold text-center">
          Next →
        </div>
      </div>
    </div>
  )
}

export function QRMock() {
  return (
    <div className="bg-white p-6">
      <div className="text-xs font-bold text-zinc-500 uppercase tracking-wide mb-4">QR + Review Flow</div>
      <div className="flex gap-4 items-start">
        {/* QR placeholder */}
        <div className="w-24 h-24 rounded-xl bg-zinc-100 ring-1 ring-zinc-200 flex items-center justify-center shrink-0 relative overflow-hidden">
          <div className="grid grid-cols-5 gap-0.5 p-2">
            {Array.from({ length: 25 }).map((_, i) => (
              <div
                key={i}
                className={`w-2.5 h-2.5 rounded-[1px] ${[0,2,4,6,10,12,14,18,20,22,24,1,3,7,9,11,13,17,19,23].includes(i) ? 'bg-zinc-800' : 'bg-transparent'}`}
              />
            ))}
          </div>
        </div>
        {/* Flow */}
        <div className="flex flex-col gap-2 flex-1">
          {[
            { label: 'Customer scans QR', color: 'bg-violet-100 text-violet-700' },
            { label: 'Completes survey', color: 'bg-zinc-100 text-zinc-600' },
            { label: '4–5 stars → Google Reviews', color: 'bg-emerald-100 text-emerald-700' },
            { label: '1–3 stars → Private inbox', color: 'bg-red-50 text-red-600' },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              {i > 0 && <div className="w-px h-2 bg-zinc-200 ml-3 -mt-2" />}
              <div className={`text-xs font-medium px-2.5 py-1.5 rounded-lg ${step.color}`}>
                {step.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
