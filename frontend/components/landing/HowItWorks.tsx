'use client'

import { motion } from 'framer-motion'
import { QrCode, MessageSquare, Brain, Bell } from 'lucide-react'

const steps = [
  {
    number: '01',
    icon: QrCode,
    title: 'Scan a QR code',
    desc: 'Customers scan a QR code displayed at your venue — on tables, receipts, or screens.',
  },
  {
    number: '02',
    icon: MessageSquare,
    title: 'Leave feedback',
    desc: 'A short, branded survey opens instantly. No app download, no login required.',
  },
  {
    number: '03',
    icon: Brain,
    title: 'AI analyses sentiment',
    desc: 'Every response is scored automatically. Themes surface in seconds, not weeks.',
  },
  {
    number: '04',
    icon: Bell,
    title: 'Alerts fire instantly',
    desc: 'Your team is notified, reviewers are redirected, and workflows run on their own.',
  },
]

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
}

const stepVariant = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
}

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
          className="text-center mb-20"
        >
          <span
            className="inline-block text-xs font-bold tracking-[0.18em] uppercase text-violet-600 bg-violet-50 px-3 py-1.5 rounded-full mb-4"
          >
            How it works
          </span>
          <h2
            className="text-4xl lg:text-5xl font-extrabold text-zinc-900 leading-tight"
            style={{ fontFamily: 'var(--font-syne)' }}
          >
            Simple. Fast. Automated.
          </h2>
          <p
            className="mt-4 text-lg text-zinc-500 max-w-md mx-auto"
            style={{ fontFamily: 'var(--font-manrope)' }}
          >
            From scan to action in under 60 seconds.
          </p>
        </motion.div>

        {/* Steps */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative"
        >
          {/* Connecting line — desktop only */}
          <div
            className="hidden lg:block absolute top-10 left-[12.5%] right-[12.5%] h-px pointer-events-none"
            style={{
              background: 'repeating-linear-gradient(90deg, #E4E4E7 0, #E4E4E7 6px, transparent 6px, transparent 14px)',
            }}
          />

          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              variants={stepVariant}
              className="flex flex-col items-center text-center relative"
            >
              {/* Number + icon bubble */}
              <div className="relative mb-5">
                <div className="w-20 h-20 rounded-2xl bg-violet-50 ring-1 ring-violet-100 flex items-center justify-center relative z-10">
                  <step.icon className="w-8 h-8 text-violet-600" />
                </div>
                <span
                  className="absolute -top-2 -right-2 w-6 h-6 bg-violet-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center z-20"
                  style={{ fontFamily: 'var(--font-syne)' }}
                >
                  {i + 1}
                </span>
              </div>

              <h3
                className="text-base font-bold text-zinc-900 mb-2"
                style={{ fontFamily: 'var(--font-syne)' }}
              >
                {step.title}
              </h3>
              <p
                className="text-sm text-zinc-500 leading-relaxed max-w-[200px]"
                style={{ fontFamily: 'var(--font-manrope)' }}
              >
                {step.desc}
              </p>
            </motion.div>
          ))}
        </motion.div>

      </div>
    </section>
  )
}
