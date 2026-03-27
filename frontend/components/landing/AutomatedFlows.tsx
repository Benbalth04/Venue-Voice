'use client'

import { motion } from 'framer-motion'
import { CheckCircle2, Zap, Mail, Star, ArrowRight } from 'lucide-react'

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
    desc: 'Email, Slack, or webhook — reach your team however they work.',
  },
]

function MockFlowBuilder() {
  return (
    <div className="w-full rounded-2xl overflow-hidden" style={{ background: '#1A1030' }}>
      {/* Window chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="w-3 h-3 rounded-full bg-red-500/70" />
        <div className="w-3 h-3 rounded-full bg-amber-500/70" />
        <div className="w-3 h-3 rounded-full bg-green-500/70" />
        <span className="ml-3 text-xs font-mono text-white/30">Flow Editor — Alert on Low Rating</span>
      </div>

      {/* Flow canvas */}
      <div className="p-6 relative" style={{ minHeight: 320 }}>

        {/* SVG connecting lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
          {/* Trigger → Condition */}
          <line x1="160" y1="80" x2="260" y2="80" stroke="rgba(139,92,246,0.4)" strokeWidth="2" strokeDasharray="6 4" />
          {/* Condition → Action 1 */}
          <line x1="400" y1="70" x2="500" y2="50" stroke="rgba(139,92,246,0.4)" strokeWidth="2" strokeDasharray="6 4" />
          {/* Condition → Action 2 */}
          <line x1="400" y1="90" x2="500" y2="130" stroke="rgba(34,197,94,0.3)" strokeWidth="2" strokeDasharray="6 4" />
        </svg>

        <div className="relative z-10 flex flex-col gap-8">
          {/* Row 1: Trigger node */}
          <div className="flex items-start gap-8 flex-wrap">
            <FlowNode
              label="TRIGGER"
              title="Survey Submitted"
              color="violet"
              icon="⚡"
            />
            <div className="flex items-center self-center text-white/20">
              <ArrowRight className="w-5 h-5" />
            </div>
            <FlowNode
              label="CONDITION"
              title="Rating ≤ 2 stars"
              color="amber"
              icon="⚖️"
            />
          </div>

          {/* Row 2: Action nodes */}
          <div className="flex items-start gap-6 flex-wrap ml-0 lg:ml-48">
            <FlowNode
              label="ACTION"
              title="Send Email Alert"
              subtitle="ops@venue.com"
              color="red"
              icon="📧"
            />
            <FlowNode
              label="ACTION"
              title="Create Internal Note"
              subtitle="Manager notified"
              color="emerald"
              icon="📋"
            />
          </div>
        </div>

        {/* Execution badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6 }}
          className="absolute bottom-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold"
          style={{ background: 'rgba(34,197,94,0.15)', color: '#4ADE80', border: '1px solid rgba(34,197,94,0.25)' }}
        >
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          Flow active — 14 executions today
        </motion.div>
      </div>
    </div>
  )
}

function FlowNode({
  label,
  title,
  subtitle,
  color,
  icon,
}: {
  label: string
  title: string
  subtitle?: string
  color: 'violet' | 'amber' | 'red' | 'emerald'
  icon: string
}) {
  const colors = {
    violet: { bg: 'rgba(139,92,246,0.15)', border: 'rgba(139,92,246,0.35)', label: '#A78BFA' },
    amber: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', label: '#FCD34D' },
    red: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', label: '#FCA5A5' },
    emerald: { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.3)', label: '#6EE7B7' },
  }
  const c = colors[color]

  return (
    <div
      className="rounded-xl px-4 py-3 min-w-[150px] max-w-[180px]"
      style={{ background: c.bg, border: `1px solid ${c.border}` }}
    >
      <div className="text-[9px] font-bold tracking-widest mb-1.5" style={{ color: c.label }}>
        {label}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <div>
          <div className="text-xs font-semibold text-white leading-tight">{title}</div>
          {subtitle && <div className="text-[10px] text-white/40 mt-0.5">{subtitle}</div>}
        </div>
      </div>
    </div>
  )
}

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

        {/* Section header — centered */}
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
              textShadow: '0 0 20px rgba(139,92,246,0.5)',
            }}
          >
            Automated Flows
          </span>
          <h2
            className="text-4xl lg:text-5xl xl:text-6xl font-extrabold text-white leading-tight max-w-3xl mx-auto"
            style={{ fontFamily: 'var(--font-syne)' }}
          >
            Automate your entire
            <br />
            <span style={{ color: '#A78BFA' }}>feedback pipeline.</span>
          </h2>
          <p
            className="mt-5 text-lg max-w-xl mx-auto leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-manrope)' }}
          >
            Instantly respond to customer sentiment with smart workflows. Route feedback,
            trigger alerts, and take action without lifting a finger.
          </p>
        </motion.div>

        {/* Main layout: flow builder + bullets */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-12 items-center">

          {/* Flow builder screenshot */}
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
            <MockFlowBuilder />
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
