'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, CheckCircle2 } from 'lucide-react'

interface WaitlistFormProps {
  variant?: 'hero' | 'footer'
}

export default function WaitlistForm({ variant = 'hero' }: WaitlistFormProps) {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [focused, setFocused] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !email.includes('@')) return
    setSubmitted(true)
  }

  const isFooter = variant === 'footer'

  return (
    <AnimatePresence mode="wait">
      {submitted ? (
        <motion.div
          key="success"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className={`flex items-center gap-3 ${isFooter ? 'text-white' : 'text-zinc-800'}`}
        >
          <CheckCircle2 className="w-5 h-5 text-violet-500 shrink-0" />
          <span className="font-manrope font-medium text-sm">
            You&apos;re on the list! We&apos;ll be in touch soon.
          </span>
        </motion.div>
      ) : (
        <motion.form
          key="form"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onSubmit={handleSubmit}
          className={`flex flex-col sm:flex-row gap-3 w-full ${isFooter ? 'max-w-md mx-auto' : 'max-w-lg'}`}
        >
          <div
            className={`flex-1 relative rounded-xl transition-all duration-200 ${
              focused
                ? 'ring-2 ring-violet-500 ring-offset-2'
                : isFooter
                ? 'ring-1 ring-white/30'
                : 'ring-1 ring-zinc-200'
            }`}
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Enter your work email"
              required
              className={`w-full h-12 px-4 rounded-xl text-sm outline-none font-manrope ${
                isFooter
                  ? 'bg-white/10 text-white placeholder:text-white/50 backdrop-blur-sm'
                  : 'bg-white text-zinc-900 placeholder:text-zinc-400'
              }`}
            />
          </div>
          <motion.button
            type="submit"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`h-12 px-6 rounded-xl font-manrope font-semibold text-sm flex items-center gap-2 whitespace-nowrap transition-colors duration-200 ${
              isFooter
                ? 'bg-white text-violet-700 hover:bg-violet-50'
                : 'bg-violet-600 text-white hover:bg-violet-700'
            }`}
          >
            Join the waitlist
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </motion.form>
      )}
    </AnimatePresence>
  )
}
