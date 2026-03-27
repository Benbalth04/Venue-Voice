'use client'

import { motion } from 'framer-motion'
import { Star, TrendingUp, MessageSquare, ArrowUpRight } from 'lucide-react'
import WaitlistForm from './WaitlistForm'

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
}

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
}

const floatAnimate = { y: [0, -10, 0] }
const floatTransition = { duration: 4, ease: 'easeInOut' as const, repeat: Infinity }

function MockDashboard() {
  const responses = [
    { name: 'The Kensington Bar', rating: 5, text: 'Outstanding service tonight', time: '2m ago' },
    { name: 'City Centre Cafe', rating: 2, text: 'Long wait, staff seemed distracted', time: '8m ago', alert: true },
    { name: 'Rooftop Lounge', rating: 4, text: 'Great atmosphere, loved the cocktails', time: '15m ago' },
    { name: 'Harbor Grill', rating: 5, text: 'Best meal we had all trip', time: '22m ago' },
  ]

  return (
    <div className="bg-white rounded-2xl shadow-2xl ring-1 ring-zinc-200 overflow-hidden w-full">
      {/* Dashboard header bar */}
      <div className="bg-zinc-50 border-b border-zinc-100 px-4 py-3 flex items-center gap-2">
        <div className="w-3 h-3 rounded-full bg-red-400" />
        <div className="w-3 h-3 rounded-full bg-amber-400" />
        <div className="w-3 h-3 rounded-full bg-green-400" />
        <span className="ml-3 text-xs text-zinc-400 font-mono">venue-voice / dashboard</span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-0 border-b border-zinc-100">
        {[
          { label: 'Avg. Rating', value: '4.3', icon: Star, color: 'text-amber-500', bg: 'bg-amber-50' },
          { label: 'This Week', value: '247', icon: MessageSquare, color: 'text-violet-500', bg: 'bg-violet-50' },
          { label: 'Trend', value: '+18%', icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-50' },
        ].map((stat) => (
          <div key={stat.label} className="px-4 py-4 border-r border-zinc-100 last:border-r-0">
            <div className={`w-7 h-7 rounded-lg ${stat.bg} flex items-center justify-center mb-2`}>
              <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
            </div>
            <div className="text-lg font-bold text-zinc-900" style={{ fontFamily: 'var(--font-syne)' }}>
              {stat.value}
            </div>
            <div className="text-xs text-zinc-400 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Recent responses */}
      <div className="p-4">
        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
          Live Responses
        </div>
        <div className="flex flex-col gap-2">
          {responses.map((r, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 p-2.5 rounded-xl ${
                r.alert ? 'bg-red-50 ring-1 ring-red-100' : 'bg-zinc-50'
              }`}
            >
              <div className="flex shrink-0 mt-0.5">
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star
                    key={s}
                    className={`w-3 h-3 ${s < r.rating ? 'text-amber-400 fill-amber-400' : 'text-zinc-200 fill-zinc-200'}`}
                  />
                ))}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-zinc-700 truncate">{r.name}</div>
                <div className="text-xs text-zinc-500 truncate">{r.text}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {r.alert && (
                  <span className="text-[10px] font-semibold text-red-500 bg-red-100 px-1.5 py-0.5 rounded-full">
                    Alert
                  </span>
                )}
                <span className="text-[10px] text-zinc-400">{r.time}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Hero() {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center pt-16 overflow-hidden"
      style={{ background: '#FAFAF9' }}
    >
      {/* Ambient background blobs */}
      <div
        className="absolute top-0 right-0 w-[700px] h-[700px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 70% 30%, rgba(139,92,246,0.10) 0%, transparent 70%)',
          transform: 'translate(20%, -20%)',
        }}
      />
      <div
        className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 30% 70%, rgba(139,92,246,0.06) 0%, transparent 70%)',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-6 py-24 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* Left — text content */}
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="flex flex-col gap-6"
          >
            {/* Badge */}
            <motion.div variants={item}>
              <span className="inline-flex items-center gap-2 text-xs font-semibold text-violet-700 bg-violet-100 px-3 py-1.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-violet-500 rounded-full animate-pulse" />
                Now accepting early access
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              variants={item}
              className="text-5xl lg:text-6xl xl:text-7xl font-extrabold leading-[1.05] tracking-tight text-zinc-900"
              style={{ fontFamily: 'var(--font-syne)' }}
            >
              Capture real-time
              <br />
              customer feedback.
              <br />
              <span className="text-violet-600">Act on it instantly.</span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              variants={item}
              className="text-lg text-zinc-500 leading-relaxed max-w-md"
              style={{ fontFamily: 'var(--font-manrope)' }}
            >
              Go beyond Google Reviews. Understand your customers, automate responses, and
              take control of your feedback pipeline — across every location.
            </motion.p>

            {/* Waitlist form */}
            <motion.div variants={item} id="waitlist">
              <WaitlistForm variant="hero" />
            </motion.div>

            {/* Social proof */}
            <motion.p
              variants={item}
              className="text-sm text-zinc-400 flex items-center gap-1.5"
              style={{ fontFamily: 'var(--font-manrope)' }}
            >
              <span className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                ))}
              </span>
              Join 200+ businesses taking control of their customer experience
            </motion.p>
          </motion.div>

          {/* Right — product screenshot (grid-breaking: overflows + tilted) */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
            className="relative lg:ml-8 xl:ml-16"
          >
            {/* Floating badge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              className="absolute -top-4 -left-4 z-10 bg-white rounded-xl shadow-lg px-3 py-2 flex items-center gap-2 ring-1 ring-zinc-100"
            >
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-xs font-semibold text-zinc-700">Live feedback incoming</span>
            </motion.div>

            {/* Alert badge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.0 }}
              className="absolute -bottom-4 -right-2 z-10 bg-violet-600 text-white rounded-xl shadow-lg px-3 py-2 flex items-center gap-2"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold">Alert triggered</span>
            </motion.div>

            {/* Main screenshot — tilted, overflows grid */}
            <motion.div
              animate={floatAnimate}
              transition={floatTransition}
              style={{ rotate: '1.5deg' }}
              className="relative"
            >
              <MockDashboard />
            </motion.div>
          </motion.div>

        </div>
      </div>
    </section>
  )
}
