'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navLinks = [
    { label: 'How it works', href: '#how-it-works' },
    { label: 'Features', href: '#features' },
    { label: 'Flows', href: '#flows' },
  ]

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/90 backdrop-blur-md shadow-sm border-b border-zinc-100'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <a href="/" className="flex items-center gap-1.5 group">
          <span
            className="text-xl font-bold text-zinc-900 tracking-tight"
            style={{ fontFamily: 'var(--font-syne)' }}
          >
            Venue Voice
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-violet-500 mb-0.5 group-hover:scale-125 transition-transform duration-200" />
        </a>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors duration-150"
              style={{ fontFamily: 'var(--font-manrope)' }}
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-4">
          <a
            href="/login"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
            style={{ fontFamily: 'var(--font-manrope)' }}
          >
            Sign in
          </a>
          <motion.a
            href="#waitlist"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="h-9 px-5 bg-violet-600 text-white text-sm font-semibold rounded-full hover:bg-violet-700 transition-colors duration-200 flex items-center"
            style={{ fontFamily: 'var(--font-manrope)' }}
          >
            Join waitlist
          </motion.a>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-zinc-600 hover:text-zinc-900"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden bg-white border-b border-zinc-100 px-6 pb-6 pt-2"
        >
          <nav className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-sm font-medium text-zinc-700 hover:text-zinc-900 py-1"
                style={{ fontFamily: 'var(--font-manrope)' }}
              >
                {link.label}
              </a>
            ))}
            <a
              href="#waitlist"
              onClick={() => setMobileOpen(false)}
              className="mt-2 h-10 px-5 bg-violet-600 text-white text-sm font-semibold rounded-full flex items-center justify-center"
              style={{ fontFamily: 'var(--font-manrope)' }}
            >
              Join waitlist
            </a>
          </nav>
        </motion.div>
      )}
    </header>
  )
}
