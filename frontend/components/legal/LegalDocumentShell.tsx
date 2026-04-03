import Link from "next/link"
import Image from "next/image"
import { ArrowLeft } from "lucide-react"

type LegalDocumentShellProps = {
  title: string
  children: React.ReactNode
  /** When set, shows this date instead of the draft placeholder line. */
  lastUpdated?: { display: string; isoDate: string }
}

export function LegalDocumentShell({ title, children, lastUpdated }: LegalDocumentShellProps) {
  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 text-sm font-medium text-violet-700 hover:text-violet-900"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          Back to signup
        </Link>

        <div className="mt-8 flex justify-center">
          <Image
            src="/venue_voice_logo_1.png"
            alt="Venue Voice"
            width={240}
            height={72}
            className="h-auto w-44 object-contain sm:w-52"
            priority
          />
        </div>

        <article className="mt-10">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">{title}</h1>
          {lastUpdated ? (
            <p className="mt-2 text-sm text-zinc-500">
              Last updated:{" "}
              <time dateTime={lastUpdated.isoDate}>{lastUpdated.display}</time>
            </p>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">
              Last updated: <time dateTime="2026-04-03">April 3, 2026</time> — replace this date when you publish your
              final policy.
            </p>
          )}
          <div className="mt-8 space-y-8 text-sm leading-relaxed text-zinc-700">{children}</div>
        </article>
      </div>
    </div>
  )
}
