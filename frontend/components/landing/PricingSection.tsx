'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'

type BillingInterval = 'monthly' | 'yearly'

const FEATURES = [
  'Capture real-time feedback from every customer',
  'Quickly identify underperforming locations',
  'Turn happy customers into 5-star Google reviews',
  'Spot recurring issues before they impact revenue',
  'Compare performance across all your venues',
  'Get instant alerts when something goes wrong',
  'Understand customer sentiment automatically with AI',
  'Unlimited users across your company',
]

export default function PricingSection() {
  const [billing, setBilling] = useState<BillingInterval>('yearly')

  const isYearly = billing === 'yearly'
  const monthlyDisplay = isYearly ? '$8' : '$10'
  const exampleCost = isYearly ? '$40/month' : '$50/month'

  return (
    <section
      id="pricing"
      className="relative overflow-hidden pt-28 pb-12"
      style={{ background: 'linear-gradient(to bottom, #F4F4F5 0%, #F7F4FF 28%, #FAFAF9 62%, #F4F4F5 100%)' }}
    >
      {/* Ambient blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 w-[650px] h-[650px] rounded-full"
        style={{
          background: 'radial-gradient(circle at 30% 30%, rgba(139,92,246,0.12) 0%, transparent 70%)',
          transform: 'translate(-20%, -20%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 w-[720px] h-[720px] rounded-full"
        style={{
          background: 'radial-gradient(circle at 70% 70%, rgba(139,92,246,0.09) 0%, transparent 70%)',
          transform: 'translate(20%, 20%)',
        }}
      />

      <div className="relative z-10 max-w-5xl mx-auto px-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <span className="inline-block text-xs font-bold tracking-[0.18em] uppercase text-violet-600 bg-violet-50 px-3 py-1.5 rounded-full mb-4">
            Pricing
          </span>
          <h2
            className="text-4xl lg:text-5xl font-extrabold text-zinc-900 leading-tight"
            style={{ fontFamily: 'var(--font-bricolage)' }}
          >
            Understand and improve every location
          </h2>
          <p
            className="mt-4 text-lg text-zinc-500 max-w-xl mx-auto"
            style={{ fontFamily: 'var(--font-manrope)' }}
          >
            Capture real-time customer feedback and compare performance across all your venues
          </p>

          {/* Billing toggle */}
          <div className="mt-8 inline-flex items-center gap-1 bg-zinc-100 rounded-full p-1">
            <button
              onClick={() => setBilling('monthly')}
              className={`px-5 py-2 text-sm font-semibold rounded-full transition-all duration-200 ${
                billing === 'monthly'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
              style={{ fontFamily: 'var(--font-manrope)' }}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling('yearly')}
              className={`px-5 py-2 text-sm font-semibold rounded-full transition-all duration-200 flex items-center gap-1.5 ${
                billing === 'yearly'
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
              style={{ fontFamily: 'var(--font-manrope)' }}
            >
              Yearly
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                Save 20%
              </span>
            </button>
          </div>
        </motion.div>

        {/* Single pricing card */}
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="relative bg-white rounded-2xl border border-zinc-200 shadow-xl overflow-hidden"
        >
          {/* Top accent bar */}
          <div className="h-1 w-full bg-gradient-to-r from-violet-500 to-violet-400" />

          <div className="p-8 md:p-12 flex flex-col items-center text-center">

            {/* Price */}
            <div
              className="text-xl font-extrabold text-zinc-900 mb-1"
              style={{ fontFamily: 'var(--font-bricolage)' }}
            >
              Per-location pricing
            </div>
            <p
              className="text-sm text-zinc-500 mb-8"
              style={{ fontFamily: 'var(--font-manrope)' }}
            >
              Scale up or down as your business grows
            </p>

            <div className="mb-2">
              <div className="flex items-end justify-center gap-1.5">
                <span
                  className="text-7xl font-extrabold leading-none text-zinc-900"
                  style={{ fontFamily: 'var(--font-bricolage)' }}
                >
                  {monthlyDisplay}
                </span>
                <div
                  className="mb-2 text-zinc-400 text-sm leading-snug text-left"
                  style={{ fontFamily: 'var(--font-manrope)' }}
                >
                  <div>per location</div>
                  <div>/ month</div>
                </div>
              </div>
              {isYearly ? (
                <p
                  className="text-sm text-zinc-500 mt-2"
                  style={{ fontFamily: 'var(--font-manrope)' }}
                >
                  Billed annually ($96 per location / year)
                </p>
              ) : (
                <p
                  className="text-sm text-zinc-500 mt-2"
                  style={{ fontFamily: 'var(--font-manrope)' }}
                >
                  Billed monthly — switch to yearly to save 20%
                </p>
              )}
            </div>

            <div className="mt-5 inline-flex items-center gap-2 bg-violet-50 text-violet-700 text-sm font-medium px-4 py-2.5 rounded-xl"
              style={{ fontFamily: 'var(--font-manrope)' }}
            >
              <span className="opacity-60 text-xs">e.g.</span>
              5 locations = {exampleCost}
            </div>

            {/* Divider */}
            <div className="my-8 h-px bg-zinc-100 w-full" />

            {/* Features */}
            <p
              className="text-xs font-bold tracking-widest uppercase text-zinc-400 mb-5"
              style={{ fontFamily: 'var(--font-manrope)' }}
            >
              Everything included
            </p>
            <ul className="grid sm:grid-cols-2 gap-x-10 gap-y-3.5 text-left w-full mb-8">
              {FEATURES.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-3 text-sm text-zinc-700"
                  style={{ fontFamily: 'var(--font-manrope)' }}
                >
                  <span className="mt-0.5 shrink-0 flex items-center justify-center w-4 h-4 rounded-full bg-violet-100">
                    <Check className="w-2.5 h-2.5 text-violet-600 stroke-[3]" />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>

            {/* Divider */}
            <div className="mb-8 h-px bg-zinc-100 w-full" />

            {/* CTA */}
            <motion.a
              href="/signup"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center justify-center h-12 w-full max-w-sm rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 transition-colors duration-200"
              style={{ fontFamily: 'var(--font-manrope)' }}
            >
              Start capturing feedback
            </motion.a>
            <p
              className="text-xs text-zinc-400 mt-3"
              style={{ fontFamily: 'var(--font-manrope)' }}
            >
              Set up in minutes. No contracts.
            </p>

          </div>
        </motion.div>

      </div>
    </section>
  )
}
