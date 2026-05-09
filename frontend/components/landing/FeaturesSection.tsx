'use client'

import { motion } from 'framer-motion'
import {
  GitBranch,
  QrCode,
  BellRing,
  Sparkles,
  Building2,
  Users,
  Zap,
} from 'lucide-react'

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

const rowVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.55,
      ease: easeOutExpo,
    },
  },
}

interface FeatureCard {
  icon: React.ElementType
  title: string
  description: string
}

function FeatureCardItem({ feature }: { feature: FeatureCard }) {
  const Icon = feature.icon
  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ y: -4, transition: { duration: 0.2, ease: 'easeOut' } }}
      className="group flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white/70 p-6 shadow-sm backdrop-blur-sm transition-shadow duration-200 hover:shadow-lg"
    >
      <div className="w-fit rounded-xl bg-violet-50 p-2.5 text-violet-600 transition-colors duration-200 group-hover:bg-violet-100">
        <Icon size={22} strokeWidth={1.8} />
      </div>
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
}

function LeftColumn({
  headline,
  statement,
}: {
  headline: string
  statement: string
}) {
  return (
    <div className="flex flex-col">
      <span
        className="text-xs font-normal uppercase tracking-widest text-zinc-400"
        style={{ fontFamily: 'var(--font-manrope)' }}
      >
        The Problem
      </span>
      <h3
        className="mt-3 text-2xl font-extrabold tracking-tight text-zinc-900 sm:text-3xl"
        style={{ fontFamily: 'var(--font-sora)' }}
      >
        {headline}
      </h3>
      <p
        className="mt-4 text-base leading-relaxed text-zinc-500"
        style={{ fontFamily: 'var(--font-manrope)' }}
      >
        {statement}
      </p>
    </div>
  )
}

const ROW_CLASSES =
  'grid grid-cols-1 lg:grid-cols-[2fr_3fr] items-center gap-12 lg:gap-16 py-16'

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
          background:
            'radial-gradient(circle at 70% 30%, rgba(139,92,246,0.13) 0%, transparent 70%)',
          transform: 'translate(15%, -15%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-0 w-[520px] h-[520px] rounded-full"
        style={{
          background:
            'radial-gradient(circle at 30% 70%, rgba(139,92,246,0.09) 0%, transparent 70%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 w-[580px] h-[580px] rounded-full"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(139,92,246,0.07) 0%, transparent 68%)',
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6">
        {/* Section header */}
        <motion.div
          className="mb-4 text-center"
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
            style={{ fontFamily: 'var(--font-sora)' }}
          >
            Your feedback problems{' '}
            <span className="text-violet-600">solved</span>
          </h2>
          <p
            className="mx-auto mt-4 max-w-2xl text-base text-zinc-500 sm:text-lg"
            style={{ fontFamily: 'var(--font-manrope)' }}
          >
            Most multi-location hospitality groups are dealing with messy, inconsistent feedback
            and no way to compare locations. Venue Voice fixes that.
          </p>
        </motion.div>

        {/* ── Row 1 ── */}
        <motion.div
          className={ROW_CLASSES}
          variants={rowVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
        >
          <LeftColumn
            headline="Stop bad feedback from going public"
            statement="When a customer has a bad experience, you want the chance to fix it internally, not find out via a 1-star Google review. Without a system to intercept negative feedback, your public rating takes the hit before you even know there's a problem."
          />

          <motion.div
            className="flex flex-col gap-5"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
          >
            <FeatureCardItem
              feature={{
                icon: GitBranch,
                title: 'Intercept negative feedback before it goes public',
                description:
                  'Automatically detect unhappy customers and capture their feedback privately. Use our flows feature to direct happy customers to your Google review page, and route frustrated customers to private feedback channels.',
              }}
            />
            <motion.div
              variants={cardVariants}
              className="group flex flex-col rounded-2xl border border-zinc-200/80 bg-white/70 shadow-sm backdrop-blur-sm transition-shadow duration-200 hover:shadow-lg overflow-hidden"
            >
              <div className="flex flex-col gap-4 p-6">
                <div className="w-fit rounded-xl bg-violet-50 p-2.5 text-violet-600 transition-colors duration-200 group-hover:bg-violet-100">
                  <Zap size={22} strokeWidth={1.8} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <h3
                    className="text-base font-semibold text-zinc-900"
                    style={{ fontFamily: 'var(--font-bricolage)' }}
                  >
                    Smart automated routing flows
                  </h3>
                  <p
                    className="text-sm leading-relaxed text-zinc-500"
                    style={{ fontFamily: 'var(--font-manrope)' }}
                  >
                    Build workflows that automatically route feedback, trigger alerts, and guide
                    happy customers to your Google review page without any manual effort.
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>

        {/* Divider */}
        <div className="border-t border-zinc-200/70" />

        {/* ── Row 2 ── */}
        <motion.div
          className={ROW_CLASSES}
          variants={rowVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
        >
          <LeftColumn
            headline="Know the moment something goes wrong at any location"
            statement="With multiple locations, problems are easy to miss. By the time issues show up in your reviews or revenue, they've already been happening for weeks. You need a system that surfaces problems the moment they occur, not after the damage is done."
          />

          <motion.div
            className="flex flex-col gap-5"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
          >
            <FeatureCardItem
              feature={{
                icon: BellRing,
                title: 'Get alerted the moment a location has a problem',
                description:
                  'Set custom rules that trigger instant notifications when negative feedback arrives. Your team knows exactly when and where to act before a small issue becomes an expensive one.',
              }}
            />
            <FeatureCardItem
              feature={{
                icon: Sparkles,
                title: 'Understand what customers are really saying',
                description:
                  "Customers don't always give you a low rating, sometimes they just leave a comment. Venue Voice's AI reads every text response and automatically identifies sentiment, so nothing gets missed between the lines.",
              }}
            />
          </motion.div>
        </motion.div>

        {/* Divider */}
        <div className="border-t border-zinc-200/70" />

        {/* ── Row 3 ── */}
        <motion.div
          className={ROW_CLASSES}
          variants={rowVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
        >
          <LeftColumn
            headline="Benchmark every location against your own standard"
            statement="It's hard to know which locations are thriving and which are quietly underperforming when your feedback is scattered, inconsistent, or collected differently at each site. You can't fix what you can't measure, and you can't measure what isn't standardised."
          />

          <motion.div
            className="flex flex-col gap-5"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
          >
            <FeatureCardItem
              feature={{
                icon: Building2,
                title: 'Compare every location in one dashboard',
                description:
                  'Deploy the same surveys across every venue, then compare performance side by side. Spot underperforming locations instantly and give your ops team the data they need to act.',
              }}
            />
            <FeatureCardItem
              feature={{
                icon: QrCode,
                title: 'Consistent feedback collection at every site',
                description:
                  'Create QR codes once and deploy them across every location. Update what they link to any time, reducing reprinting, inconsistency and gaps in your data.',
              }}
            />
            <FeatureCardItem
              feature={{
                icon: Users,
                title: 'Give every level of your team the right view',
                description:
                  "Operations managers get full access across your organisation. Location managers see their site's results. Everyone has what they need to take action without noise or confusion from irrelevant data.",
              }}
            />
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
