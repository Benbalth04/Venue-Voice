'use client'

import { motion } from 'framer-motion'
import { ArrowRight, Star } from 'lucide-react'
import { useEffect, useState } from 'react'

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

const INITIAL_HOLD_MS = 700
const STAGGER_MS = 500
const FULL_HOLD_MS = 1600

function HeroSatisfactionStars() {
  const [star4Filled, setStar4Filled] = useState(false)
  const [star5Filled, setStar5Filled] = useState(false)

  useEffect(() => {
    let cancelled = false
    const pending: ReturnType<typeof setTimeout>[] = []

    const safeSetTimeout = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        if (!cancelled) fn()
      }, ms)
      pending.push(id)
    }

    const runCycle = () => {
      if (cancelled) return
      setStar4Filled(false)
      setStar5Filled(false)
      safeSetTimeout(() => {
        if (cancelled) return
        setStar4Filled(true)
        safeSetTimeout(() => {
          if (cancelled) return
          setStar5Filled(true)
          safeSetTimeout(() => {
            if (cancelled) return
            runCycle()
          }, FULL_HOLD_MS)
        }, STAGGER_MS)
      }, INITIAL_HOLD_MS)
    }

    runCycle()

    return () => {
      cancelled = true
      pending.forEach(clearTimeout)
    }
  }, [])

  const filled = [true, true, true, star4Filled, star5Filled]

  return (
    <div className="flex flex-col items-center pt-2">
      <div className="flex items-center justify-center gap-1.5 sm:gap-2" aria-hidden="true">
        {filled.map((isFilled, i) => {
          const star = (
            <Star
              className={`h-8 w-8 sm:h-9 sm:w-9 ${
                isFilled
                  ? 'fill-amber-400 text-amber-400'
                  : 'fill-none text-zinc-300'
              }`}
              strokeWidth={isFilled ? 0 : 1.5}
            />
          )
          if (i < 3) {
            return (
              <div key={i}>
                {star}
              </div>
            )
          }
          return (
            <motion.div
              key={i}
              animate={isFilled ? { scale: [1, 1.12, 1] } : { scale: 1 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            >
              {star}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

export default function Hero() {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center pt-16 overflow-hidden"
      style={{
        background:
          'linear-gradient(168deg, #F4F0FF 0%, #FAFAF9 38%, #F4F4F5 100%)',
      }}
    >
      {/* Ambient background blobs */}
      <div
        className="absolute top-0 right-0 w-[780px] h-[780px] rounded-full pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(circle at 70% 30%, rgba(139,92,246,0.14) 0%, transparent 72%)',
          transform: 'translate(20%, -20%)',
        }}
      />
      <div
        className="absolute bottom-0 left-0 w-[520px] h-[520px] rounded-full pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(circle at 30% 70%, rgba(139,92,246,0.10) 0%, transparent 72%)',
        }}
      />
      <div
        className="absolute top-[12%] left-1/2 -translate-x-1/2 w-[min(90vw,640px)] h-[480px] rounded-full pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(circle at 50% 40%, rgba(139,92,246,0.09) 0%, transparent 68%)',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-24 w-full">
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="flex flex-col gap-6 items-center text-center"
        >

          {/* Headline */}
          <motion.h1
            variants={item}
            className="text-5xl lg:text-6xl xl:text-7xl font-extrabold leading-[1.05] tracking-tight text-zinc-900 max-w-5xl mx-auto"
            style={{ fontFamily: 'var(--font-bricolage)' }}
          >
            <span className="text-violet-600">AI-Powered Customer Feedback Management System</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            variants={item}
            className="text-xl sm:text-2xl text-zinc-600 leading-relaxed max-w-3xl mx-auto"
            style={{ fontFamily: 'var(--font-manrope)' }}
          >
            Venue Voice helps single or multi-location businesses easily capture, process and action customer feedback using AI analysis and automations.
          </motion.p>

          {/* CTAs */}
          <motion.div variants={item} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <motion.a
              href="/signup"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="h-13 px-7 py-3.5 bg-violet-600 text-white text-base font-semibold rounded-full hover:bg-violet-700 transition-colors duration-200 flex items-center gap-2"
              style={{ fontFamily: 'var(--font-manrope)' }}
            >
              Start your 7-day free trial
              <ArrowRight className="w-4 h-4" />
            </motion.a>
            <a
              href="#features"
              className="text-sm font-medium text-zinc-500 hover:text-violet-600 transition-colors flex items-center gap-1.5 justify-center"
              style={{ fontFamily: 'var(--font-manrope)' }}
            >
              Learn more ↓
            </a>
          </motion.div>

          <motion.div variants={item}>
            <HeroSatisfactionStars />
          </motion.div>
        </motion.div>

      </div>
    </section>
  )
}
