'use client'

import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

export default function CTASection() {
  return (
    <section className="relative py-28 overflow-hidden bg-violet-600">

      {/* Subtle dot grid pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Ambient glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, rgba(255,255,255,0.12) 0%, transparent 70%)' }}
      />

      <div className="relative max-w-3xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="flex flex-col items-center gap-6"
        >
          <span
            className="inline-block text-xs font-bold tracking-[0.18em] uppercase text-white/70 bg-white/10 px-3 py-1.5 rounded-full"
          >
            Start today
          </span>

          <h2
            className="text-4xl lg:text-5xl font-extrabold text-white leading-tight"
            style={{ fontFamily: 'var(--font-bricolage)' }}
          >
            Your competitors are already
            <br />
            collecting feedback.
          </h2>

          <p
            className="text-base text-white/70 max-w-md leading-relaxed"
            style={{ fontFamily: 'var(--font-manrope)' }}
          >
            Start protecting your reputation and growing your star rating today.
            7-day free trial — no credit card required.
          </p>

          <motion.a
            href="/signup"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 h-13 px-8 py-3.5 bg-white text-violet-700 text-base font-semibold rounded-full hover:bg-violet-50 transition-colors duration-200"
            style={{ fontFamily: 'var(--font-manrope)' }}
          >
            Start your free trial
            <ArrowRight className="w-4 h-4" />
          </motion.a>

          <p
            className="text-xs text-white/40"
            style={{ fontFamily: 'var(--font-manrope)' }}
          >
            <a href="/login" className="underline underline-offset-2 hover:text-white/60 transition-colors">
              Already have an account?
            </a>
          </p>
        </motion.div>
      </div>
    </section>
  )
}
