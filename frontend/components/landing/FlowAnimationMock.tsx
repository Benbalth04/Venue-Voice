'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { GitBranch, Mail, Star, Workflow } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase =
  | 'idle'
  | 'response-enter'
  | 'trigger-active'
  | 'connector-pulse-1'
  | 'rule-evaluating'
  | 'rule-result'
  | 'connector-pulse-2'
  | 'branch-routing'
  | 'connector-pulse-3'
  | 'action-execute'
  | 'hold'
  | 'reset'

type NodeState = 'dim' | 'idle' | 'active' | 'evaluating' | 'pass' | 'fail'
type NodeKind = 'trigger' | 'rule' | 'branch' | 'action-email' | 'action-redirect'
type PathState = 'active' | 'dim' | 'idle'

interface ScenarioDef {
  ruleTitle: string
  ruleSubtitle: string
  branchMatchLabel: string
  trueResult: 'pass' | 'fail'
  activePaths: 'true' | 'false' | 'both'
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PHASE_ORDER: Phase[] = [
  'idle',
  'response-enter',
  'trigger-active',
  'connector-pulse-1',
  'rule-evaluating',
  'rule-result',
  'connector-pulse-2',
  'branch-routing',
  'connector-pulse-3',
  'action-execute',
  'hold',
  'reset',
]

const PHASE_DURATIONS: Record<Phase, number> = {
  idle: 500,
  'response-enter': 600,
  'trigger-active': 600,
  'connector-pulse-1': 500,
  'rule-evaluating': 700,
  'rule-result': 600,
  'connector-pulse-2': 500,
  'branch-routing': 600,
  'connector-pulse-3': 500,
  'action-execute': 800,
  hold: 1500,
  reset: 400,
}

const SCENARIOS: ScenarioDef[] = [
  {
    ruleTitle: 'Rating below 3',
    ruleSubtitle: 'Checks customer star rating',
    branchMatchLabel: 'ALL',
    trueResult: 'pass',
    activePaths: 'true',
  },
  {
    ruleTitle: 'Rating below 3',
    ruleSubtitle: 'Checks customer star rating',
    branchMatchLabel: 'ALL',
    trueResult: 'fail',
    activePaths: 'false',
  },
  {
    ruleTitle: 'Rating below 3 OR Negative sentiment',
    ruleSubtitle: 'Match any condition',
    branchMatchLabel: 'ANY',
    trueResult: 'pass',
    activePaths: 'both',
  },
]

const RESPONSE_BADGES = [
  { rating: 2, sentiment: 'Negative', sentimentColor: 'rose' as const },
  { rating: 5, sentiment: 'Positive', sentimentColor: 'emerald' as const },
  { rating: 3, sentiment: 'Neutral',  sentimentColor: 'amber' as const },
]

// ─── FlowNode ─────────────────────────────────────────────────────────────────

interface FlowNodeProps {
  kind: NodeKind
  title: string
  subtitle?: string
  state: NodeState
  resultBadge?: 'pass' | 'fail' | null
  /** Compact mode: w-full, smaller padding, no subtitle — for side-by-side action nodes */
  compact?: boolean
}

function FlowNode({ kind, title, subtitle, state, resultBadge, compact = false }: FlowNodeProps) {
  const Icon =
    kind === 'trigger'         ? Workflow
    : kind === 'rule'          ? Workflow
    : kind === 'branch'        ? GitBranch
    : kind === 'action-email'  ? Mail
    : Star

  const accentClass =
    kind === 'trigger'  ? 'bg-amber-50 text-amber-700 border-amber-200'
    : kind === 'rule'   ? 'bg-violet-50 text-violet-700 border-violet-200'
    : kind === 'branch' ? 'bg-sky-50 text-sky-700 border-sky-200'
    : 'bg-emerald-50 text-emerald-700 border-emerald-200'

  const label =
    kind === 'trigger'        ? 'Trigger'
    : kind === 'rule'         ? 'Rule'
    : kind === 'branch'       ? 'Branch'
    : kind === 'action-email' ? 'Action'
    : 'Action'

  const glowByState: Record<NodeState, string> = {
    dim:        '0 0 0px rgba(0,0,0,0)',
    idle:       '0 0 0px rgba(0,0,0,0)',
    active:     '0 0 14px rgba(251,191,36,0.45)',
    evaluating: '0 0 12px rgba(139,92,246,0.4)',
    pass:       '0 0 14px rgba(52,211,153,0.45)',
    fail:       '0 0 12px rgba(248,113,113,0.35)',
  }

  const borderByState: Record<NodeState, string> = {
    dim:        'rgba(228,228,231,0.4)',
    idle:       'rgb(228,228,231)',
    active:     'rgb(251,191,36)',
    evaluating: 'rgb(167,139,250)',
    pass:       'rgb(52,211,153)',
    fail:       'rgb(248,113,113)',
  }

  return (
    <motion.div
      className="relative w-full"
      animate={{ opacity: state === 'dim' ? 0.3 : 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Result badge */}
      <AnimatePresence>
        {resultBadge && (
          <motion.span
            key={resultBadge}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            className={`absolute -top-2 -right-2 z-10 flex h-5 w-5 items-center justify-center rounded-full text-white text-[10px] font-bold shadow
              ${resultBadge === 'pass' ? 'bg-emerald-500' : 'bg-red-500'}`}
          >
            {resultBadge === 'pass' ? '✓' : '✗'}
          </motion.span>
        )}
      </AnimatePresence>

      {/* Card */}
      <motion.div
        animate={{
          boxShadow: glowByState[state],
          borderColor: borderByState[state],
          scale: state === 'active' || state === 'evaluating' || state === 'pass' || state === 'fail' ? 1.02 : 1,
        }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className={`w-full rounded-2xl border bg-white shadow-sm ${compact ? 'px-2.5 py-2' : 'px-3 py-3'}`}
      >
        <div className="flex items-center gap-1.5">
          {/* Icon badge */}
          <div className="relative shrink-0">
            <span className={`inline-flex items-center justify-center rounded-xl border ${accentClass} ${compact ? 'h-6 w-6' : 'h-7 w-7'}`}>
              <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
            </span>
            {state === 'evaluating' && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-xl border-2 border-violet-200 border-t-violet-500"
                style={{ borderRadius: compact ? 8 : 10 }}
              />
            )}
          </div>
          {!compact && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">
              {label}
            </span>
          )}
        </div>
        <p className={`truncate font-semibold text-zinc-950 ${compact ? 'mt-1.5 text-[11px]' : 'mt-2 text-xs'}`}>
          {title}
        </p>
        {!compact && subtitle && (
          <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-zinc-500">{subtitle}</p>
        )}
      </motion.div>
    </motion.div>
  )
}

// ─── FlowConnector ────────────────────────────────────────────────────────────

interface FlowConnectorProps {
  active: boolean
  color?: 'default' | 'green' | 'red' | 'dim'
  delay?: number
  height?: number
}

function FlowConnector({ active, color = 'default', delay = 0, height = 32 }: FlowConnectorProps) {
  const lineColor = {
    default: 'rgba(161,161,170,0.5)',
    green:   'rgba(52,211,153,0.8)',
    red:     'rgba(248,113,113,0.5)',
    dim:     'rgba(161,161,170,0.2)',
  }[color]

  return (
    <div className="relative flex justify-center" style={{ height }}>
      <motion.div
        className="absolute top-0 bottom-0 w-px"
        animate={{ background: lineColor }}
        transition={{ duration: 0.3 }}
      />
      <AnimatePresence>
        {active && (
          <motion.div
            key="pulse"
            initial={{ y: 0, opacity: 1 }}
            animate={{ y: height - 4, opacity: 0 }}
            exit={{}}
            transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1], delay }}
            className="absolute top-0 left-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full bg-violet-500"
            style={{ boxShadow: '0 0 8px rgba(139,92,246,0.8)' }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── BranchSplit ──────────────────────────────────────────────────────────────

interface BranchSplitProps {
  truePath: PathState
  falsePath: PathState
  truePulseActive: boolean
  falsePulseActive: boolean
}

function BranchSplit({ truePath, falsePath, truePulseActive, falsePulseActive }: BranchSplitProps) {
  const toColor = (p: PathState): 'green' | 'red' | 'dim' | 'default' => {
    if (p === 'active') return 'green'
    if (p === 'dim') return 'dim'
    return 'default'
  }

  const trueLineColor =
    truePath === 'active' ? 'rgba(52,211,153,0.7)'
    : truePath === 'dim' ? 'rgba(161,161,170,0.2)'
    : 'rgba(161,161,170,0.4)'

  const falseLineColor =
    falsePath === 'active' ? 'rgba(52,211,153,0.7)'
    : falsePath === 'dim' ? 'rgba(161,161,170,0.2)'
    : 'rgba(161,161,170,0.4)'

  return (
    <div className="flex w-full items-start justify-center gap-1">
      {/* TRUE arm */}
      <div className="flex flex-1 flex-col items-center">
        <motion.div
          className="h-px w-full"
          animate={{ background: trueLineColor }}
          transition={{ duration: 0.3 }}
        />
        <span className={`mt-0.5 text-[9px] font-bold tracking-wide ${truePath === 'dim' ? 'text-zinc-300' : 'text-emerald-600'}`}>
          TRUE
        </span>
        <FlowConnector active={truePulseActive} color={toColor(truePath)} height={24} />
      </div>

      {/* FALSE arm */}
      <div className="flex flex-1 flex-col items-center">
        <motion.div
          className="h-px w-full"
          animate={{ background: falseLineColor }}
          transition={{ duration: 0.3 }}
        />
        <span className={`mt-0.5 text-[9px] font-bold tracking-wide ${falsePath === 'dim' ? 'text-zinc-300' : 'text-red-400'}`}>
          FALSE
        </span>
        <FlowConnector active={falsePulseActive} color={toColor(falsePath)} delay={0.05} height={24} />
      </div>
    </div>
  )
}

// ─── ResponseBadge ────────────────────────────────────────────────────────────

interface ResponseBadgeProps {
  active: boolean
  scenarioIndex: number
  rating: number
  sentiment: string
  sentimentColor: 'rose' | 'emerald' | 'amber'
}

function ResponseBadge({ active, scenarioIndex, rating, sentiment, sentimentColor }: ResponseBadgeProps) {
  const sentimentClasses = {
    rose:    'bg-rose-100 text-rose-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    amber:   'bg-amber-100 text-amber-700',
  }[sentimentColor]

  return (
    <div className="flex h-9 items-center justify-center">
      <AnimatePresence mode="wait">
        {active && (
          <motion.div
            key={`badge-${scenarioIndex}`}
            initial={{ y: -20, opacity: 0, scale: 0.85 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 10, opacity: 0, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 shadow-md"
            style={{ fontFamily: 'var(--font-manrope)' }}
          >
            <span className="text-xs text-amber-400">
              {'★'.repeat(rating)}
              <span className="text-zinc-300">{'★'.repeat(5 - rating)}</span>
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${sentimentClasses}`}>
              {sentiment}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── MailBadge ────────────────────────────────────────────────────────────────
// Springs in and stays visible (like GoogleBadge), with a secondary flying envelope.

function MailBadge({ active, scenarioKey }: { active: boolean; scenarioKey: number }) {
  return (
    <div className="mt-1.5 flex h-7 items-center justify-center relative overflow-visible">
      <AnimatePresence>
        {active && (
          <>
            {/* Static badge — springs in and stays */}
            <motion.div
              key={`mail-badge-${scenarioKey}`}
              initial={{ scale: 0, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0, opacity: 0, y: 4 }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
              className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 shadow-md"
              style={{ fontFamily: 'var(--font-manrope)' }}
            >
              <Mail className="h-3.5 w-3.5 text-emerald-600" />
              <span className="text-[10px] font-semibold text-emerald-700">Alert sent</span>
            </motion.div>

            {/* Fly-off envelope — shoots right once after a brief delay */}
            <motion.div
              key={`mail-fly-${scenarioKey}`}
              initial={{ x: 0, y: 0, opacity: 0.9 }}
              animate={{ x: 48, y: -8, opacity: 0 }}
              exit={{}}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
              className="absolute pointer-events-none"
            >
              <Mail className="h-3.5 w-3.5 text-emerald-500" />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── GoogleBadge ──────────────────────────────────────────────────────────────

function GoogleBadge({ active, scenarioKey }: { active: boolean; scenarioKey: number }) {
  return (
    <div className="mt-1.5 flex h-7 items-center justify-center">
      <AnimatePresence>
        {active && (
          <motion.div
            key={`google-${scenarioKey}`}
            initial={{ scale: 0, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0, opacity: 0, y: 4 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 shadow-md"
            style={{ fontFamily: 'var(--font-manrope)' }}
          >
            <span
              className="inline-flex h-3.5 w-3.5 shrink-0 rounded-full"
              style={{ background: 'conic-gradient(#4285F4 0deg 90deg, #EA4335 90deg 180deg, #FBBC05 180deg 270deg, #34A853 270deg 360deg)' }}
            />
            <span className="text-[10px] font-semibold text-zinc-700">+Google Review</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── FlowAnimationMock (orchestrator) ─────────────────────────────────────────

export default function FlowAnimationMock() {
  const shouldReduceMotion = useReducedMotion()
  const [scenarioIndex, setScenarioIndex] = useState(0)
  const [phaseIndex, setPhaseIndex] = useState(0)

  // Timer cascade — React 19 Strict Mode safe via cancelled flag
  useEffect(() => {
    if (shouldReduceMotion) return

    let cancelled = false
    const id = setTimeout(() => {
      if (cancelled) return
      setPhaseIndex(prev => {
        const next = prev + 1
        if (next >= PHASE_ORDER.length) {
          setScenarioIndex(s => (s + 1) % 3)
          return 0
        }
        return next
      })
    }, PHASE_DURATIONS[PHASE_ORDER[phaseIndex]])

    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [phaseIndex, shouldReduceMotion])

  // ── Derived state ──────────────────────────────────────────────────────────

  const scenario     = SCENARIOS[shouldReduceMotion ? 0 : scenarioIndex]
  const responseBadge = RESPONSE_BADGES[shouldReduceMotion ? 0 : scenarioIndex]
  const phase: Phase = shouldReduceMotion ? 'action-execute' : PHASE_ORDER[phaseIndex]

  const pastPhase = (from: Phase): boolean =>
    PHASE_ORDER.indexOf(phase) > PHASE_ORDER.indexOf(from)

  // Node states
  const triggerState: NodeState = phase === 'trigger-active' ? 'active' : 'idle'

  const ruleState: NodeState =
    ['idle', 'response-enter', 'trigger-active', 'connector-pulse-1'].includes(phase)
      ? 'dim'
      : phase === 'rule-evaluating'
        ? 'evaluating'
        : phase === 'rule-result' || pastPhase('rule-result')
          ? (scenario.trueResult === 'pass' ? 'pass' : 'fail')
          : 'dim'

  const ruleResultBadge: 'pass' | 'fail' | null =
    phase === 'rule-result' || pastPhase('rule-result') ? scenario.trueResult : null

  const branchState: NodeState =
    ['idle', 'response-enter', 'trigger-active', 'connector-pulse-1', 'rule-evaluating', 'rule-result'].includes(phase)
      ? 'dim'
      : 'active'

  const emailActive =
    (phase === 'action-execute' || phase === 'hold') &&
    (scenario.activePaths === 'true' || scenario.activePaths === 'both')

  const redirectActive =
    (phase === 'action-execute' || phase === 'hold') &&
    (scenario.activePaths === 'false' || scenario.activePaths === 'both')

  const emailNodeState: NodeState = emailActive ? 'pass'
    : pastPhase('branch-routing')
      ? (scenario.activePaths === 'true' || scenario.activePaths === 'both' ? 'idle' : 'dim')
      : 'dim'

  const redirectNodeState: NodeState = redirectActive ? 'pass'
    : pastPhase('branch-routing')
      ? (scenario.activePaths === 'false' || scenario.activePaths === 'both' ? 'idle' : 'dim')
      : 'dim'

  // Branch path states
  const truePath: PathState = pastPhase('branch-routing')
    ? (scenario.activePaths === 'true' || scenario.activePaths === 'both' ? 'active' : 'dim')
    : 'idle'

  const falsePath: PathState = pastPhase('branch-routing')
    ? (scenario.activePaths === 'false' || scenario.activePaths === 'both' ? 'active' : 'dim')
    : 'idle'

  // Connector pulses
  const connector1Active   = phase === 'connector-pulse-1'
  const connector2Active   = phase === 'connector-pulse-2'
  const truePulseActive    = phase === 'connector-pulse-3' && (scenario.activePaths === 'true'  || scenario.activePaths === 'both')
  const falsePulseActive   = phase === 'connector-pulse-3' && (scenario.activePaths === 'false' || scenario.activePaths === 'both')
  const responseBadgeActive = phase === 'response-enter' || phase === 'trigger-active'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <motion.div
      animate={{ opacity: phase === 'reset' ? 0 : 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col items-center py-5 px-4"
    >
      {/* Scenario indicator pills */}
      <div className="mb-3 flex gap-1.5">
        {SCENARIOS.map((_, i) => (
          <motion.div
            key={i}
            animate={{
              background: i === scenarioIndex ? 'rgba(139,92,246,0.8)' : 'rgba(139,92,246,0.2)',
              scale: i === scenarioIndex ? 1.15 : 1,
            }}
            transition={{ duration: 0.3 }}
            className="h-1.5 w-5 rounded-full"
          />
        ))}
      </div>

      {/* Response badge */}
      <ResponseBadge
        active={responseBadgeActive}
        scenarioIndex={scenarioIndex}
        rating={responseBadge.rating}
        sentiment={responseBadge.sentiment}
        sentimentColor={responseBadge.sentimentColor}
      />

      {/* Main pipeline — centered column, constrained width */}
      <div className="flex w-full max-w-[240px] flex-col items-center">
        <FlowNode kind="trigger" title="New response received" subtitle="Survey submitted" state={triggerState} />
        <FlowConnector active={connector1Active} height={28} />
        <FlowNode kind="rule" title={scenario.ruleTitle} subtitle={scenario.ruleSubtitle} state={ruleState} resultBadge={ruleResultBadge} />
        <FlowConnector active={connector2Active} height={28} />
        <FlowNode kind="branch" title={`Match ${scenario.branchMatchLabel}`} subtitle="Route based on result" state={branchState} />
      </div>

      {/* Branch split — spans full width to reach both action nodes */}
      <div className="w-full">
        <BranchSplit
          truePath={truePath}
          falsePath={falsePath}
          truePulseActive={truePulseActive}
          falsePulseActive={falsePulseActive}
        />
      </div>

      {/* Action nodes — flex-1 so they always fit without overflow */}
      <div className="flex w-full items-start gap-2">
        <div className="flex flex-1 flex-col items-center min-w-0">
          <FlowNode kind="action-email" title="Alert team" state={emailNodeState} compact />
          <MailBadge active={emailActive} scenarioKey={scenarioIndex} />
        </div>
        <div className="flex flex-1 flex-col items-center min-w-0">
          <FlowNode kind="action-redirect" title="Google Review" state={redirectNodeState} compact />
          <GoogleBadge active={redirectActive} scenarioKey={scenarioIndex} />
        </div>
      </div>
    </motion.div>
  )
}
