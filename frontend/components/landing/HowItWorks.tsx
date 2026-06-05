'use client'

import { motion } from 'framer-motion'
import { ArrowRight, LayoutTemplate } from 'lucide-react'
import Image from 'next/image'

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
}

const fadeLeft = {
  hidden: { opacity: 0, x: -32 },
  show: { opacity: 1, x: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
}

const fadeRight = {
  hidden: { opacity: 0, x: 32 },
  show: { opacity: 1, x: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
}

// Step 1 screenshot — inline JSX mock (no image available)
function SurveyMock() {
  return (
    <div className="bg-white rounded-2xl shadow-xl ring-1 ring-zinc-200 overflow-hidden">
      {/* Browser chrome */}
      <div className="bg-zinc-50 border-b border-zinc-100 px-4 py-2.5 flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
        <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
        <span className="ml-3 text-xs text-zinc-400 font-mono">Survey Builder</span>
      </div>
      {/* Content */}
      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-zinc-800" style={{ fontFamily: 'var(--font-bricolage)' }}>Monthly Dining Survey</div>
            <div className="text-xs text-zinc-400 mt-0.5">4 questions · Published</div>
          </div>
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">Active</span>
        </div>
        <div className="flex flex-col gap-2">
          {[
            { q: 'How would you rate your experience?', type: 'Rating' },
            { q: 'What did you enjoy most?', type: 'Text' },
            { q: 'Would you recommend us?', type: 'Yes / No' },
          ].map((item, i) => (
            <div key={i} className="flex items-center justify-between bg-zinc-50 rounded-xl px-3 py-2.5 gap-3">
              <span className="text-xs text-zinc-700 flex-1 truncate">{item.q}</span>
              <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-md shrink-0">{item.type}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 border-2 border-dashed border-violet-200 rounded-xl px-3 py-2.5 text-xs text-violet-400 cursor-pointer hover:bg-violet-50/40 transition-colors">
            <LayoutTemplate className="w-3.5 h-3.5" />
            Add a question…
          </div>
        </div>
      </div>
    </div>
  )
}

const steps = [
  {
    number: '01',
    headline: 'Create your survey',
    desc: 'Build a fully branded survey in minutes. Choose from rating scales, open text, yes/no, and photo questions. No technical skills needed.',
    imageNode: <SurveyMock />,
    isImage: false,
  },
  {
    number: '02',
    headline: 'Place QR codes at every location',
    desc: 'Print reusable QR codes and place them on tables, receipts, or screens. Customers scan and submit feedback instantly — no app, no login.',
    imageSrc: '/landing_page/locations_image.png',
    imageAlt: 'QR codes placed across multiple venue locations',
    isImage: true,
  },
  {
    number: '03',
    headline: 'Set smart automations',
    desc: 'Route unhappy customers to your private inbox. Send happy ones straight to your Google review page. Trigger alerts for your team when anything needs attention.',
    imageSrc: '/landing_page/flow_image.png',
    imageAlt: 'Automation flow builder showing feedback routing rules',
    isImage: true,
  },
  {
    number: '04',
    headline: 'Watch insights roll in',
    desc: 'See every response in one dashboard. Track sentiment trends, spot underperforming locations, and make decisions backed by real customer data.',
    imageSrc: '/landing_page/dashboard_image.png',
    imageAlt: 'Dashboard showing feedback analytics and sentiment trends',
    isImage: true,
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-28 bg-white">
      <div className="max-w-7xl mx-auto px-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-24"
        >
          <span className="inline-block text-xs font-bold tracking-[0.18em] uppercase text-violet-600 bg-violet-50 px-3 py-1.5 rounded-full mb-4">
            How it works
          </span>
          <h2
            className="text-4xl lg:text-5xl font-extrabold text-zinc-900 leading-tight"
            style={{ fontFamily: 'var(--font-bricolage)' }}
          >
            Set it up once. Let it run.
          </h2>
          <p
            className="mt-4 text-lg text-zinc-500 max-w-md mx-auto"
            style={{ fontFamily: 'var(--font-manrope)' }}
          >
            From your first survey to automated review growth — in four simple steps.
          </p>
        </motion.div>

        {/* Steps — alternating layout */}
        <div className="flex flex-col gap-24 lg:gap-32">
          {steps.map((step, i) => {
            const isReverse = i % 2 !== 0
            return (
              <div
                key={step.number}
                className={`grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center ${
                  isReverse ? 'lg:grid-flow-dense' : ''
                }`}
              >
                {/* Text block */}
                <motion.div
                  variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: '-60px' }}
                  className={`flex flex-col gap-4 ${isReverse ? 'lg:col-start-2' : ''}`}
                >
                  <motion.span
                    variants={fadeUp}
                    className="text-7xl lg:text-8xl font-extrabold leading-none"
                    style={{ fontFamily: 'var(--font-bricolage)', color: 'rgba(139,92,246,0.15)' }}
                  >
                    {step.number}
                  </motion.span>
                  <motion.h3
                    variants={fadeUp}
                    className="text-2xl lg:text-3xl font-extrabold text-zinc-900 leading-tight -mt-4"
                    style={{ fontFamily: 'var(--font-bricolage)' }}
                  >
                    {step.headline}
                  </motion.h3>
                  <motion.p
                    variants={fadeUp}
                    className="text-base text-zinc-500 leading-relaxed max-w-sm"
                    style={{ fontFamily: 'var(--font-manrope)' }}
                  >
                    {step.desc}
                  </motion.p>
                </motion.div>

                {/* Screenshot block */}
                <motion.div
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: '-60px' }}
                  variants={isReverse ? fadeRight : fadeLeft}
                  className={`relative ${isReverse ? 'lg:col-start-1 lg:row-start-1' : ''}`}
                >
                  {step.isImage ? (
                    <div className="rounded-2xl overflow-hidden shadow-xl ring-1 ring-zinc-200">
                      <Image
                        src={step.imageSrc!}
                        alt={step.imageAlt!}
                        width={720}
                        height={460}
                        className="w-full h-auto"
                      />
                    </div>
                  ) : (
                    step.imageNode
                  )}
                  {/* Decorative violet glow */}
                  <div
                    className="absolute -z-10 inset-4 rounded-2xl blur-2xl opacity-15"
                    style={{ background: 'radial-gradient(circle, #8B5CF6, transparent)' }}
                  />
                </motion.div>
              </div>
            )
          })}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mt-24"
        >
          <motion.a
            href="/contact"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 h-13 px-8 py-3.5 bg-violet-600 text-white text-base font-semibold rounded-full hover:bg-violet-700 transition-colors duration-200"
            style={{ fontFamily: 'var(--font-manrope)' }}
          >
            Get in Contact
            <ArrowRight className="w-4 h-4" />
          </motion.a>
        </motion.div>

      </div>
    </section>
  )
}
