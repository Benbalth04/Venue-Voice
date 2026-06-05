import { ArrowRight, ChevronDown } from 'lucide-react'

type FAQEntry = {
  question: string
  /** Plain text for JSON-LD (one block per paragraph / section) */
  answerPlainParts: string[]
  bullets?: string[]
}

const FAQ_ENTRIES: FAQEntry[] = [
  {
    question: "How can I improve my business' Google reviews?",
    answerPlainParts: [
      'Improving your Google reviews starts with collecting feedback at the right moment. Venue Voice helps you capture real-time customer feedback using QR codes and can automatically redirect happy customers to leave public reviews on Google using our sophisticated flows system. This means you can keep negative feedback internal, and show off your great feedback on Google!',
    ],
  },
  {
    question: 'How do I collect customer feedback in real time?',
    answerPlainParts: [
      'You can collect real-time customer feedback by placing QR codes in your venue that customers can scan instantly after their experience. Venue Voice makes this seamless by linking QR codes to mobile-friendly surveys, allowing customers to share feedback in seconds while the experience is still fresh.',
    ],
  },
  {
    question: 'What is the best way to handle negative customer feedback?',
    answerPlainParts: [
      'The best way to handle negative feedback is to catch it early and respond quickly. Venue Voice automatically detects negative responses and sends instant alerts so you can take action before the issue escalates or becomes a public review. This helps protect your brand and improve customer satisfaction.',
    ],
  },
  {
    question: 'How can I manage customer feedback across multiple locations?',
    answerPlainParts: [
      'Managing feedback across multiple locations requires a centralised system. Venue Voice allows you to track feedback from all your venues in one dashboard, compare performance between locations, and identify underperforming stores quickly so you can take action.',
    ],
  },
  {
    question: 'Can I automate responses to customer feedback?',
    answerPlainParts: [
      'Yes, you can automate responses using smart workflows. Venue Voice lets you create automated flows that trigger actions based on feedback, such as sending alerts, routing issues to staff, or redirecting satisfied customers to leave public reviews.',
    ],
  },
  {
    question: 'What is AI sentiment analysis and how does it help my business?',
    answerPlainParts: [
      "AI sentiment analysis automatically analyses customer feedback to determine whether it is positive, neutral, or negative. Venue Voice uses this to highlight trends, identify common issues, and help you understand what your customers are really saying without manually reviewing every response.",
    ],
  },
  {
    question: 'What are the benefits of collecting customer feedback?',
    answerPlainParts: [
      'Collecting customer feedback helps you:',
      'Venue Voice enhances this by turning raw feedback into actionable insights and automated workflows.',
    ],
    bullets: [
      'Improve customer experience',
      'Identify operational issues',
      'Increase positive reviews',
      'Make better business decisions',
    ],
  },
]

function answerTextForJsonLd(entry: FAQEntry): string {
  const parts = [...entry.answerPlainParts]
  if (entry.bullets?.length) {
    parts.splice(1, 0, entry.bullets.join(' '))
  }
  return parts.join(' ')
}

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_ENTRIES.map((entry) => ({
    '@type': 'Question',
    name: entry.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: answerTextForJsonLd(entry),
    },
  })),
}

export default function FAQSection() {
  const year = new Date().getFullYear()

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <section
        id="faq"
        aria-labelledby="faq-heading"
        className="relative overflow-hidden py-28"
        style={{ background: 'linear-gradient(to bottom, #F4F4F5 0%, #F7F4FF 28%, #FAFAF9 62%, #F4F4F5 100%)' }}
      >
        {/* Ambient blobs */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-0 right-0 w-[600px] h-[600px] rounded-full"
          style={{
            background: 'radial-gradient(circle at 70% 20%, rgba(139,92,246,0.12) 0%, transparent 70%)',
            transform: 'translate(15%, -20%)',
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 w-[680px] h-[680px] rounded-full"
          style={{
            background: 'radial-gradient(circle at 30% 80%, rgba(139,92,246,0.08) 0%, transparent 70%)',
            transform: 'translate(-15%, 20%)',
          }}
        />

        <div className="relative z-10 max-w-3xl mx-auto px-6">
          <div className="text-center mb-12">
            <span className="inline-block text-xs font-bold tracking-[0.18em] uppercase text-violet-600 bg-violet-50 px-3 py-1.5 rounded-full mb-4">
              FAQ
            </span>
            <h2
              id="faq-heading"
              className="text-4xl lg:text-5xl font-extrabold text-zinc-900 leading-tight"
              style={{ fontFamily: 'var(--font-sora)' }}
            >
              Frequently Asked Questions
            </h2>
          </div>

          <div className="flex flex-col gap-3">
            {FAQ_ENTRIES.map((entry) => (
              <details
                key={entry.question}
                className="group rounded-2xl border border-zinc-200 bg-white px-5 py-1 transition-shadow hover:shadow-md open:shadow-md open:ring-1 open:ring-zinc-200"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-left [&::-webkit-details-marker]:hidden">
                  <h3
                    className="text-base font-bold text-zinc-900 pr-2"
                    style={{ fontFamily: 'var(--font-bricolage)' }}
                  >
                    {entry.question}
                  </h3>
                  <ChevronDown
                    aria-hidden
                    className="h-5 w-5 shrink-0 text-violet-600 transition-transform duration-200 group-open:rotate-180"
                  />
                </summary>
                <div
                  className="border-t border-zinc-100 pt-4 pb-4 text-sm text-zinc-600 leading-relaxed space-y-3"
                  style={{ fontFamily: 'var(--font-manrope)' }}
                >
                  <p>{entry.answerPlainParts[0]}</p>
                  {entry.bullets && entry.bullets.length > 0 && (
                    <ul className="list-disc pl-5 space-y-1.5 marker:text-violet-500">
                      {entry.bullets.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                  {entry.answerPlainParts.length > 1 && (
                    <p>{entry.answerPlainParts[1]}</p>
                  )}
                </div>
              </details>
            ))}
          </div>

          <div className="mt-16 pt-12 border-t border-zinc-200 text-center">
            <h3
              className="text-2xl sm:text-3xl font-extrabold text-zinc-900 leading-tight"
              style={{ fontFamily: 'var(--font-sora)' }}
            >
              Ready to get started?
            </h3>
            <p
              className="mt-3 text-base text-zinc-500 max-w-md mx-auto"
              style={{ fontFamily: 'var(--font-manrope)' }}
            >
              Start collecting feedback and boosting your brand today.
            </p>
            <a
              href="/contact"
              className="mt-6 inline-flex items-center gap-2 h-12 px-8 bg-violet-600 text-white text-base font-semibold rounded-full hover:bg-violet-700 transition-colors duration-200"
              style={{ fontFamily: 'var(--font-manrope)' }}
            >
              Get in Contact
              <ArrowRight className="w-4 h-4" aria-hidden />
            </a>
            <p
              className="mt-4 text-xs text-zinc-400"
              style={{ fontFamily: 'var(--font-manrope)' }}
            >
              <a
                href="/login"
                className="underline underline-offset-2 hover:text-zinc-600 transition-colors"
              >
                Already have an account?
              </a>
            </p>
          </div>

          <p
            className="mt-14 text-center text-xs text-zinc-400"
            style={{ fontFamily: 'var(--font-manrope)' }}
          >
            © Venue Voice {year}
          </p>
        </div>
      </section>
    </>
  )
}
