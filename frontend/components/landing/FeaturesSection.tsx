'use client'

import { motion } from 'framer-motion'
import {
  GitBranch,
  QrCode,
  BellRing,
  Sparkles,
  Building2,
  Users,
} from 'lucide-react'

const FEATURES = [
  {
    icon: GitBranch,
    title: 'Smart Feedback Routing',
    description:
      'Automatically route feedback based on sentiment. Direct happy customers to leave Google reviews while capturing negative feedback privately — before it impacts your rating.',
  },
  {
    icon: QrCode,
    title: 'Flexible QR Codes',
    description:
      'Create QR codes once and reuse them forever. Update what each code links to without ever reprinting materials, saving time and cost while staying agile.',
  },
  {
    icon: BellRing,
    title: 'Real-Time Alerts',
    description:
      'Set custom rules to trigger instant alerts when negative feedback arrives. Your team knows exactly when and where to act — before small issues become big problems.',
  },
  {
    icon: Sparkles,
    title: 'AI Sentiment Analysis',
    description:
      'Turn messy text responses into clear insights. Venue Voice uses AI to automatically identify sentiment across all feedback, so you can spot trends and act faster.',
  },
  {
    icon: Building2,
    title: 'Multi-Location Management',
    description:
      'Manage feedback across every venue from one central dashboard. Deploy surveys, compare location performance, and identify underperforming sites instantly.',
  },
  {
    icon: Users,
    title: 'Team Access & Roles',
    description:
      'Give every team member the right level of access. From operations managers who configure surveys to staff who only need to view results — everyone gets what they need.',
  },
]

const easeOutExpo: [number, number, number, number] = [0.16, 1, 0.3, 1]

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.07,
    },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      ease: easeOutExpo,
    },
  },
}

const headerVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: easeOutExpo,
    },
  },
}

export default function FeaturesSection() {
  return (
    <section
      id="features"
      style={{
        background:
          'linear-gradient(to bottom, #F4F4F5 0%, #F7F4FF 28%, #FAFAF9 62%, #F4F4F5 100%)',
      }}
      className="relative overflow-hidden py-24 sm:py-32"
    >
      {/* Ambient blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-0 right-0 w-[700px] h-[700px] rounded-full"
        style={{
          background: 'radial-gradient(circle at 70% 30%, rgba(139,92,246,0.13) 0%, transparent 70%)',
          transform: 'translate(15%, -15%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 w-[520px] h-[520px] rounded-full"
        style={{
          background: 'radial-gradient(circle at 30% 70%, rgba(139,92,246,0.09) 0%, transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 w-[580px] h-[580px] rounded-full"
        style={{
          background: 'radial-gradient(circle at 50% 50%, rgba(139,92,246,0.07) 0%, transparent 68%)',
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6">
        {/* Section header */}
        <motion.div
          className="mb-16 text-center"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={headerVariants}
        >
          <span
            className="mb-4 inline-block rounded-full border border-violet-200 bg-violet-50 px-3.5 py-1 text-xs font-semibold uppercase tracking-widest text-violet-600"
            style={{ fontFamily: 'var(--font-manrope)' }}
          >
            Platform Features
          </span>
          <h2
            className="mt-3 text-4xl font-extrabold tracking-tight text-zinc-900 sm:text-5xl"
            style={{ fontFamily: 'var(--font-bricolage)' }}
          >
            Everything you need to master{' '}
            <span className="text-violet-600">customer feedback</span>
          </h2>
          <p
            className="mx-auto mt-4 max-w-2xl text-base text-zinc-500 sm:text-lg"
            style={{ fontFamily: 'var(--font-manrope)' }}
          >
            One platform to collect, analyse, and act on customer feedback across every
            venue, team member, and customer interaction.
          </p>
        </motion.div>

        {/* Feature grid */}
        <motion.div
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={containerVariants}
        >
          {FEATURES.map((feature) => {
            const Icon = feature.icon
            return (
              <motion.div
                key={feature.title}
                variants={cardVariants}
                whileHover={{ y: -4, transition: { duration: 0.2, ease: 'easeOut' } }}
                className="group flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white/70 p-6 shadow-sm backdrop-blur-sm transition-shadow duration-200 hover:shadow-lg"
              >
                {/* Icon badge */}
                <div className="w-fit rounded-xl bg-violet-50 p-2.5 text-violet-600 transition-colors duration-200 group-hover:bg-violet-100">
                  <Icon size={22} strokeWidth={1.8} />
                </div>

                {/* Text */}
                <div className="flex flex-col gap-1.5">
                  <h3
                    className="text-base font-semibold text-zinc-900"
                    style={{ fontFamily: 'var(--font-bricolage)' }}
                  >
                    {feature.title}
                  </h3>
                  <p
                    className="text-sm leading-relaxed text-zinc-500"
                    style={{ fontFamily: 'var(--font-manrope)' }}
                  >
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
