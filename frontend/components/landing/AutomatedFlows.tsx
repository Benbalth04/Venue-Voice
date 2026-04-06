'use client'

import { motion } from 'framer-motion'
import { CheckCircle2, Zap, Star, Mail } from 'lucide-react'
import FlowAnimationMock from './FlowAnimationMock'

const bullets = [
  {
    icon: Zap,
    title: 'Trigger alerts for negative feedback',
    desc: 'Instantly notify your team when a customer rates below your threshold.',
  },
  {
    icon: Star,
    title: 'Route positive reviews to Google',
    desc: 'Happy customers are guided straight to your public review page.',
  },
  {
    icon: Mail,
    title: 'Automate internal notifications',
    desc: 'Create notification groups to alert the right people at the right time.',
  },
]

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
}

const bulletVariant = {
  hidden: { opacity: 0, x: 20 },
  show: { opacity: 1, x: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
}

export default function AutomatedFlows() {
  return (
    <section
      id="flows"
      className="relative py-32 overflow-hidden"
      style={{ background: '#0F0A1E' }}
    >
      {/* Background glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse, rgba(139,92,246,0.12) 0%, transparent 70%)',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-6">

        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <span
            className="inline-block text-xs font-bold tracking-[0.2em] uppercase mb-4 px-3 py-1.5 rounded-full"
            style={{
              color: '#A78BFA',
              background: 'rgba(139,92,246,0.15)',
              border: '1px solid rgba(139,92,246,0.25)',
            }}
          >
            Automated Flows
          </span>
          <h2
            className="text-4xl lg:text-5xl xl:text-6xl font-extrabold text-white leading-tight max-w-3xl mx-auto"
            style={{ fontFamily: 'var(--font-bricolage)' }}
          >
            Stop negative reviews
            <br />
            <span style={{ color: '#A78BFA' }}>before they go live.</span>
          </h2>
          <p
            className="mt-5 text-lg max-w-xl mx-auto leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-manrope)' }}
          >
            Build smart workflows that automatically route feedback, send alerts, and
            redirect happy customers to your Google review page.
          </p>
        </motion.div>

        {/* Main layout: screenshot + bullets */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-12 items-center">

          {/* Flow screenshot */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            style={{
              boxShadow: '0 0 80px rgba(139,92,246,0.25), 0 0 0 1px rgba(139,92,246,0.2)',
              borderRadius: 16,
            }}
          >
            <div className="w-full rounded-2xl overflow-hidden" style={{ background: '#1A1030' }}>
              {/* Window chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                <div className="w-3 h-3 rounded-full bg-red-500/70" />
                <div className="w-3 h-3 rounded-full bg-amber-500/70" />
                <div className="w-3 h-3 rounded-full bg-green-500/70" />
              </div>
              <FlowAnimationMock />
            </div>
          </motion.div>

          {/* Feature bullets */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            className="flex flex-col gap-6"
          >
            {bullets.map((b) => (
              <motion.div
                key={b.title}
                variants={bulletVariant}
                className="flex gap-4 items-start"
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)' }}
                >
                  <CheckCircle2 className="w-4.5 h-4.5 text-violet-400" />
                </div>
                <div>
                  <div
                    className="font-semibold text-white text-sm leading-snug"
                    style={{ fontFamily: 'var(--font-manrope)' }}
                  >
                    {b.title}
                  </div>
                  <div
                    className="text-sm mt-1 leading-relaxed"
                    style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'var(--font-manrope)' }}
                  >
                    {b.desc}
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  )
}
