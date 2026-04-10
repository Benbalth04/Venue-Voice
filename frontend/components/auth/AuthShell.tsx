import Image from "next/image"
import Link from "next/link"

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-violet-50/70 to-white px-4 py-12">
      <div className="mb-2">
        <Link href="/">
          <Image
            src="/PrimaryLogo.svg"
            alt="Venue Voice"
            width={140}
            height={40}
            priority
          />
        </Link>
      </div>

      {children}

      <p className="mt-8 text-xs text-zinc-400">
        © 2025 Venue Voice ·{" "}
        <Link href="/legal/privacy" className="hover:text-zinc-600">
          Privacy
        </Link>
        {" "}·{" "}
        <Link href="/legal/terms" className="hover:text-zinc-600">
          Terms
        </Link>
      </p>
    </div>
  )
}
