import type { Metadata } from "next"
import Link from "next/link"
import { BulletList } from "@/components/legal/BulletList"
import { LegalDocumentShell } from "@/components/legal/LegalDocumentShell"

export const metadata: Metadata = {
  title: "Terms and conditions | Venue Voice",
  description: "Terms and conditions for Venue Voice.",
}

export default function TermsPage() {
  return (
    <LegalDocumentShell
      title="Venue Voice – Terms and Conditions"
      lastUpdated={{ display: "30/03/2026", isoDate: "2026-03-30" }}
    >
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">1. Agreement to Terms</h2>
        <p>
          These Terms and Conditions (&quot;Terms&quot;) govern your access to and use of the Venue Voice platform
          (&quot;Service&quot;) (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;).
        </p>
        <p>By accessing or using the Service, you agree to be bound by these Terms.</p>
        <p>If you do not agree, you must not use the Service.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">2. Description of Service</h2>
        <p>Venue Voice provides a platform that enables businesses to:</p>
        <BulletList
          items={[
            "Collect customer feedback via QR codes and surveys",
            "Analyse feedback using automated tools, including artificial intelligence",
            "Configure automated workflows, alerts, and routing of feedback",
            "Access dashboards and analytics relating to customer sentiment",
          ]}
        />
        <p>We may modify, update, or discontinue features at any time.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">3. Eligibility</h2>
        <p>
          You must be at least 18 years old and have the legal capacity to enter into a binding agreement to use the
          Service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">4. Accounts</h2>
        <p>To use certain features, you must create an account.</p>
        <p>You agree to:</p>
        <BulletList
          items={[
            "Provide accurate and complete information",
            "Keep your login credentials secure",
            "Be responsible for all activity under your account",
          ]}
        />
        <p>We are not liable for any unauthorised access resulting from your failure to secure your account.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">5. Acceptable Use</h2>
        <p>You agree not to:</p>
        <BulletList
          items={[
            "Use the Service for unlawful purposes",
            "Upload or collect data in violation of applicable laws",
            "Interfere with or disrupt the Service",
            "Attempt to reverse engineer or exploit the platform",
            "Use the Service to send spam or unsolicited communications",
          ]}
        />
        <p>We may suspend or terminate access if you breach these Terms.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">6. Customer Data</h2>
        <p>
          You may submit or collect data through the Service, including feedback from your customers (&quot;Customer
          Data&quot;).
        </p>
        <p>You:</p>
        <BulletList
          items={[
            "Retain ownership of your Customer Data",
            "Are responsible for ensuring you have the right to collect and use that data",
          ]}
        />
        <p>You must comply with all applicable privacy and data protection laws.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">7. Data Processing and AI Use</h2>
        <p>The Service uses automated systems, including artificial intelligence, to analyse and process Customer Data.</p>
        <p>You acknowledge that:</p>
        <BulletList
          items={[
            "Outputs may not always be accurate or complete",
            "Insights are provided for general informational purposes only",
          ]}
        />
        <p>You are responsible for verifying and acting on any insights generated.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">8. Third-Party Integrations</h2>
        <p>The Service may integrate with third-party platforms (e.g. review platforms, email providers).</p>
        <p>We are not responsible for:</p>
        <BulletList
          items={[
            "The availability or functionality of third-party services",
            "Any data shared with or processed by third parties",
          ]}
        />
        <p>Your use of third-party services is subject to their terms.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">9. Fees and Payments</h2>
        <p>Certain features of the Service require payment.</p>
        <p>By subscribing to a paid plan, you agree to:</p>
        <BulletList items={["Pay all applicable fees", "Provide accurate billing information"]} />
        <p>Subscriptions may:</p>
        <BulletList
          items={["Renew automatically unless cancelled", "Be subject to pricing changes with reasonable notice"]}
        />
        <p>All fees are non-refundable unless required by law.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">10. Cancellation and Termination</h2>
        <p>You may cancel your subscription at any time.</p>
        <p>We may suspend or terminate your access if:</p>
        <BulletList items={["You breach these Terms", "Required by law", "We discontinue the Service"]} />
        <p>Upon termination:</p>
        <BulletList items={["Your access will cease", "We may delete your data after a reasonable period"]} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">11. Intellectual Property</h2>
        <p>All rights, title, and interest in the Service (excluding Customer Data) remain with us.</p>
        <p>You are granted a limited, non-exclusive, non-transferable licence to use the Service.</p>
        <p>You must not:</p>
        <BulletList items={["Copy, modify, or distribute the platform", "Use our branding without permission"]} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">12. Service Availability</h2>
        <p>We aim to provide a reliable Service but do not guarantee:</p>
        <BulletList items={["Continuous availability", "Error-free operation", "Uninterrupted access"]} />
        <p>The Service is provided &quot;as is&quot; and &quot;as available&quot;.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">13. Limitation of Liability</h2>
        <p>To the maximum extent permitted by law:</p>
        <p>We are not liable for:</p>
        <BulletList
          items={[
            "Loss of profits, revenue, or business",
            "Loss of data",
            "Indirect or consequential damages",
          ]}
        />
        <p>Our total liability is limited to the amount you paid us in the 12 months preceding the claim.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">14. Indemnity</h2>
        <p>You agree to indemnify and hold us harmless from any claims arising from:</p>
        <BulletList items={["Your use of the Service", "Your Customer Data", "Your breach of these Terms"]} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">15. Privacy</h2>
        <p>
          Your use of the Service is also governed by our{" "}
          <Link href="/legal/privacy" className="font-medium text-violet-700 underline-offset-2 hover:underline">
            Privacy Policy
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">16. Changes to Terms</h2>
        <p>We may update these Terms from time to time.</p>
        <p>We will notify you of material changes.</p>
        <p>Continued use of the Service constitutes acceptance of the updated Terms.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">17. Governing Law</h2>
        <p>These Terms are governed by the laws of Queensland, Australia.</p>
        <p>You submit to the exclusive jurisdiction of the courts of Queensland.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">18. Contact</h2>
        <p>If you have any questions, contact:</p>
        <p className="font-medium text-zinc-900">Venue Voice</p>
        <p>
          <a
            href="mailto:info@venuevoice.com.au"
            className="font-medium text-violet-700 underline-offset-2 hover:underline"
          >
            info@venuevoice.com.au
          </a>
        </p>
      </section>
    </LegalDocumentShell>
  )
}
