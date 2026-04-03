import type { Metadata } from "next"
import { BulletList } from "@/components/legal/BulletList"
import { LegalDocumentShell } from "@/components/legal/LegalDocumentShell"

export const metadata: Metadata = {
  title: "Privacy Policy | Venue Voice",
  description: "Privacy Policy for Venue Voice.",
}

function ImportantNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-zinc-800">
      <p className="font-semibold text-zinc-900">Important:</p>
      <div className="mt-1 space-y-2 text-sm">{children}</div>
    </div>
  )
}

export default function PrivacyPage() {
  return (
    <LegalDocumentShell
      title="Venue Voice – Privacy Policy"
      lastUpdated={{ display: "30/03/2026", isoDate: "2026-03-30" }}
    >
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">1. Introduction</h2>
        <p>
          This Privacy Policy explains how Venue Voice (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) collects,
          uses, discloses, and protects personal information when you use our platform (&quot;Service&quot;).
        </p>
        <p>
          Venue Voice is operated by [Your Name / Business Name], based in Australia.
        </p>
        <p>
          We are committed to protecting your privacy and complying with applicable laws, including the Privacy Act
          1988 (Cth).
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900">2. What Information We Collect</h2>
        <p>We collect different types of information depending on how you use the Service.</p>

        <div className="space-y-3">
          <h3 className="text-base font-semibold text-zinc-900">2.1 Account Information</h3>
          <p>When you create an account, we may collect:</p>
          <BulletList items={["Name", "Email address", "Business name", "Billing information"]} />
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-semibold text-zinc-900">2.2 Customer Feedback Data</h3>
          <p>Our Service allows businesses to collect feedback from their customers. This may include:</p>
          <BulletList
            items={[
              "Survey responses",
              "Ratings and written feedback",
              "Uploaded photos (if enabled)",
              "Optional personal information provided by end users",
            ]}
          />
          <ImportantNote>
            <p>
              This data is provided by your customers (&quot;End Users&quot;) and is controlled by you as the business
              using the Service.
            </p>
          </ImportantNote>
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-semibold text-zinc-900">2.3 Usage Data</h3>
          <p>We automatically collect:</p>
          <BulletList
            items={["IP address", "Device and browser information", "Log data (e.g. pages accessed, actions taken)"]}
          />
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-semibold text-zinc-900">2.4 Cookies and Tracking</h3>
          <p>We may use cookies or similar technologies to:</p>
          <BulletList items={["Maintain sessions", "Improve performance", "Analyse usage"]} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">3. How We Use Information</h2>
        <p>We use collected information to:</p>
        <BulletList
          items={[
            "Provide and operate the Service",
            "Process and display customer feedback",
            "Generate analytics and insights",
            "Send alerts, notifications, and summaries",
            "Improve our platform and features",
            "Process payments and manage subscriptions",
            "Comply with legal obligations",
          ]}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">4. AI and Automated Processing</h2>
        <p>
          Venue Voice uses automated systems, including artificial intelligence, to analyse feedback and generate
          insights.
        </p>
        <p>This may include:</p>
        <BulletList items={["Sentiment analysis", "Summaries and reports", "Automated recommendations"]} />
        <ImportantNote>
          <BulletList
            items={[
              "These outputs are generated automatically",
              "They may not always be accurate or complete",
              "They should not be relied on as the sole basis for decision-making",
            ]}
          />
        </ImportantNote>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-zinc-900">5. How We Share Information</h2>
        <p>We may share information with:</p>

        <div className="space-y-3">
          <h3 className="text-base font-semibold text-zinc-900">5.1 Service Providers</h3>
          <p>Third-party providers who help us operate the Service, such as:</p>
          <BulletList
            items={["Cloud hosting providers", "Analytics tools", "Email delivery services", "Payment processors"]}
          />
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-semibold text-zinc-900">5.2 Business Customers</h3>
          <p>
            If you submit feedback as an End User, your responses are shared with the business that created the survey.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-semibold text-zinc-900">5.3 Legal Requirements</h3>
          <p>We may disclose information if required by law or to:</p>
          <BulletList
            items={[
              "Comply with legal obligations",
              "Protect our rights or users",
              "Investigate misuse of the Service",
            ]}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">6. International Data Transfers</h2>
        <p>
          Your information may be stored or processed outside Australia (e.g. in the United States or other
          jurisdictions).
        </p>
        <p>
          We take reasonable steps to ensure that overseas recipients handle personal information in accordance with
          applicable privacy laws.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">7. Data Security</h2>
        <p>We take reasonable technical and organisational measures to protect your information, including:</p>
        <BulletList items={["Secure data storage", "Encryption in transit (HTTPS)", "Access controls"]} />
        <p>However, no system is completely secure, and we cannot guarantee absolute security.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">8. Data Retention</h2>
        <p>We retain personal information only as long as necessary to:</p>
        <BulletList items={["Provide the Service", "Comply with legal obligations", "Resolve disputes"]} />
        <p>We may delete or anonymise data when it is no longer required.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">9. Your Rights</h2>
        <p>Depending on your location, you may have the right to:</p>
        <BulletList
          items={[
            "Access your personal information",
            "Request correction of inaccurate data",
            "Request deletion of your data",
          ]}
        />
        <p>To make a request, contact us using the details below.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">10. Responsibilities of Business Users</h2>
        <p>If you use Venue Voice to collect customer feedback, you are responsible for:</p>
        <BulletList
          items={[
            "Ensuring you have the right to collect personal information",
            "Providing appropriate notices to your customers",
            "Complying with applicable privacy laws",
          ]}
        />
        <p>Venue Voice acts as a service provider and processes data on your behalf.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">11. Third-Party Links and Services</h2>
        <p>
          The Service may include links or integrations with third-party platforms (e.g. review sites).
        </p>
        <p>We are not responsible for the privacy practices of these third parties.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">12. Changes to This Policy</h2>
        <p>We may update this Privacy Policy from time to time.</p>
        <p>We will notify users of material changes.</p>
        <p>Continued use of the Service indicates acceptance of the updated policy.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">13. Contact Us</h2>
        <p>If you have questions or requests regarding this Privacy Policy, contact:</p>
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
