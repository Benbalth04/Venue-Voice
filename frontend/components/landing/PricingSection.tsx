'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, ArrowRight } from 'lucide-react'
import { SUBSCRIBE_PLANS } from '@/lib/subscription/plans'

type BillingInterval = 'monthly' | 'yearly'

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
}

const cardVariant = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
}

export default function PricingSection() {
  const [billing, setBilling] = useState<BillingInterval>('monthly')

  return (
    <section id="pricing" className="py-28 bg-white">
      <div className="max-w-6xl mx-auto px-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-14"
        >
          <span className="inline-block text-xs font-bold tracking-[0.18em] uppercase text-violet-600 bg-violet-50 px-3 py-1.5 rounded-full mb-4">
            Pricing
          </span>
          <h2
            className="text-4xl lg:text-5xl font-extrabold text-zinc-900 leading-tight"
            style={{ fontFamily: 'var(--font-bricolage)' }}
          >
            Simple, transparent pricing.
          </h2>
          <p
            className="mt-4 text-lg text-zinc-500 max-w-md mx-auto"
            style={{ fontFamily: 'var(--font-manrope)' }}
          >
            Every plan includes a 7-day free trial. No charge until the trial ends.
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

        {/* Plan cards */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch"
        >
          {SUBSCRIBE_PLANS.map((plan) => {
            const isYearly = billing === 'yearly'
            const displayPrice = isYearly ? plan.yearlyMonthlyEquiv : plan.monthlyPrice

            return (
              <motion.div
                key={plan.id}
                variants={cardVariant}
                className={`relative flex flex-col rounded-2xl p-7 transition-shadow duration-200 ${
                  plan.popular
                    ? 'bg-violet-600 shadow-2xl shadow-violet-200 ring-2 ring-violet-600 scale-[1.02]'
                    : 'bg-white border border-zinc-200 hover:shadow-lg'
                }`}
              >
                {/* Most popular badge */}
                {plan.popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="inline-block text-xs font-bold tracking-wide text-white bg-zinc-900 px-3 py-1 rounded-full">
                      Most Popular
                    </span>
                  </div>
                )}

                {/* Plan name & best for */}
                <div className="mb-6">
                  <div
                    className={`text-lg font-extrabold mb-1 ${plan.popular ? 'text-white' : 'text-zinc-900'}`}
                    style={{ fontFamily: 'var(--font-bricolage)' }}
                  >
                    {plan.name}
                  </div>
                  <div
                    className={`text-xs leading-relaxed ${plan.popular ? 'text-white/70' : 'text-zinc-500'}`}
                    style={{ fontFamily: 'var(--font-manrope)' }}
                  >
                    {plan.bestFor}
                  </div>
                </div>

                {/* Price */}
                <div className="mb-2">
                  <div className="flex items-end gap-1">
                    <span
                      className={`text-5xl font-extrabold leading-none ${plan.popular ? 'text-white' : 'text-zinc-900'}`}
                      style={{ fontFamily: 'var(--font-bricolage)' }}
                    >
                      ${displayPrice}
                    </span>
                    <span
                      className={`text-sm mb-1.5 ${plan.popular ? 'text-white/60' : 'text-zinc-400'}`}
                      style={{ fontFamily: 'var(--font-manrope)' }}
                    >
                      /mo
                    </span>
                  </div>
                  {isYearly && (
                    <div
                      className={`text-xs mt-1 ${plan.popular ? 'text-white/60' : 'text-zinc-400'}`}
                      style={{ fontFamily: 'var(--font-manrope)' }}
                    >
                      ${plan.yearlyPrice}/year billed annually
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className={`my-5 h-px ${plan.popular ? 'bg-white/20' : 'bg-zinc-100'}`} />

                {/* Features */}
                <ul className="flex flex-col gap-3 flex-1 mb-7">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className={`flex items-start gap-2.5 text-sm ${plan.popular ? 'text-white/90' : 'text-zinc-600'}`}
                      style={{ fontFamily: 'var(--font-manrope)' }}
                    >
                      <CheckCircle2
                        className={`w-4 h-4 shrink-0 mt-0.5 ${plan.popular ? 'text-white' : 'text-violet-500'}`}
                      />
                      {feature}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <motion.a
                  href="/signup"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className={`flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold transition-colors duration-200 ${
                    plan.popular
                      ? 'bg-white text-violet-700 hover:bg-violet-50'
                      : 'bg-violet-600 text-white hover:bg-violet-700'
                  }`}
                  style={{ fontFamily: 'var(--font-manrope)' }}
                >
                  Get started free
                  <ArrowRight className="w-3.5 h-3.5" />
                </motion.a>
              </motion.div>
            )
          })}
        </motion.div>

        {/* Bottom note */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="text-center text-xs text-zinc-400 mt-8"
          style={{ fontFamily: 'var(--font-manrope)' }}
        >
          All plans include a 7-day free trial.
        </motion.p>

      </div>
    </section>
  )
}
