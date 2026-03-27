'use client'

import { motion } from 'framer-motion'
import WaitlistForm from './WaitlistForm'

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
            Early Access
          </span>

          <h2
            className="text-4xl lg:text-5xl font-extrabold text-white leading-tight"
            style={{ fontFamily: 'var(--font-syne)' }}
          >
            Start taking control of your
            <br />
            customer feedback.
          </h2>

          <p
            className="text-base text-white/70 max-w-md leading-relaxed"
            style={{ fontFamily: 'var(--font-manrope)' }}
          >
            Join the waitlist today. We&apos;re onboarding a small number of venues first
            — get early access and shape the product.
          </p>

          <div className="w-full max-w-md" id="waitlist-bottom">
            <WaitlistForm variant="footer" />
          </div>

          <p
            className="text-xs text-white/40"
            style={{ fontFamily: 'var(--font-manrope)' }}
          >
            No credit card. No commitment. Just early access.
          </p>
        </motion.div>
      </div>
    </section>
  )
}
