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
      lastUpdated={{ display: "30 March 2026", isoDate: "2026-03-30" }}
    >
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">1. Agreement to Terms</h2>
        <p>
          These Terms and Conditions (&quot;Terms&quot;) govern your access to and use of the Venue Voice platform
          (&quot;Service&quot;), operated by Venue Voice (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;).
        </p>
        <p>
          By accessing or using the Service, you agree to be bound by these Terms. If you do not agree, you must not use
          the Service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">2. Description of Service</h2>
        <p>
          Venue Voice provides a platform that enables businesses to collect, manage, and analyse customer feedback.
          Core features include:
        </p>
        <BulletList
          items={[
            "Collecting customer feedback via QR codes and surveys",
            "Analysing feedback using automated tools, including artificial intelligence",
            "Configuring automated workflows, alerts, and feedback routing",
            "Accessing dashboards and analytics relating to customer sentiment",
          ]}
        />
        <p>We may modify, update, or discontinue features at any time.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">3. Eligibility</h2>
        <p>
          You must be at least 18 years old and have the legal capacity to enter into a binding agreement in order to
          use the Service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">4. Accounts</h2>
        <p>To access certain features, you must create an account. By doing so, you agree to:</p>
        <BulletList
          items={[
            "Provide accurate and complete registration information",
            "Keep your login credentials secure and confidential",
            "Accept responsibility for all activity that occurs under your account",
          ]}
        />
        <p>We are not liable for any loss or damage resulting from your failure to keep your account credentials secure.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">5. Acceptable Use</h2>
        <p>You agree to use the Service only for lawful purposes and in a manner consistent with these Terms. You must not:</p>
        <BulletList
          items={[
            "Use the Service for any unlawful or fraudulent purpose",
            "Upload or collect data in violation of applicable laws",
            "Interfere with or disrupt the operation of the Service or its infrastructure",
            "Attempt to reverse engineer, decompile, or otherwise exploit the platform",
            "Use the Service to send spam or unsolicited communications",
          ]}
        />
        <p>We reserve the right to suspend or terminate access if you breach these Terms.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">6. Customer Data</h2>
        <p>
          You may submit or collect data through the Service, including feedback from your customers (&quot;Customer
          Data&quot;).
        </p>
        <BulletList
          items={[
            "You retain ownership of all Customer Data you submit through the Service.",
            "You are solely responsible for ensuring you have the necessary rights, consents, and authorisations to collect and use that data.",
            "You must comply with all applicable privacy and data protection laws, including the Privacy Act 1988 (Cth) and the Australian Privacy Principles.",
          ]}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">7. Data Processing and AI Use</h2>
        <p>
          The Service uses automated systems, including artificial intelligence, to analyse and process Customer Data. By
          using the Service, you acknowledge that:
        </p>
        <BulletList
          items={[
            "AI-generated outputs may not always be accurate, complete, or suitable for your specific purposes.",
            "Insights provided by the Service are for general informational purposes only and do not constitute professional advice.",
            "You are responsible for independently verifying and making decisions based on any insights generated.",
          ]}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">8. Review Management and ACCC Compliance</h2>
        <p>
          Venue Voice is designed to support lawful and ethical management of customer feedback. Our platform operates
          in accordance with Australian Consumer Law and the guidelines published by the Australian Competition and
          Consumer Commission (ACCC).
        </p>

        <div className="space-y-3 pt-1">
          <h3 className="text-base font-semibold text-zinc-900">8.1 Prohibition on Suppressing Genuine Negative Reviews</h3>
          <p>
            Venue Voice includes features which allow you to conditionally invite users to provide reviews; however, you
            must not use our platform, or any of its features, to suppress, hide, delete, or otherwise obscure genuine
            negative reviews or feedback from real customers. Under Australian Consumer Law, suppressing honest customer
            feedback to create a false or misleading impression of your business may constitute misleading or deceptive
            conduct and can result in significant penalties.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-semibold text-zinc-900">8.2 When Review Removal Is Permitted</h3>
          <p>
            You may report or request the removal of a review only where there are legitimate grounds to do so.
            Permitted grounds include reviews that are:
          </p>
          <BulletList
            items={[
              "Fake or spam: not left by a genuine customer or generated artificially",
              "Defamatory: containing false statements of fact that damage your reputation",
              "Offensive or abusive: containing inappropriate, threatening, or harassing content",
              "In breach of the relevant review platform's community guidelines or policies",
            ]}
          />
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-semibold text-zinc-900">8.3 Extortion and Review Blackmail</h3>
          <p>
            If a customer threatens to leave a negative review in order to obtain a benefit they are not entitled to
            (such as an unwarranted refund or free service), this may constitute extortion or blackmail under Australian
            law. In such cases, you may report the review through the relevant platform and, where appropriate, seek
            independent legal advice.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-semibold text-zinc-900">8.4 Recommended Approach</h3>
          <p>
            Rather than seeking removal of negative reviews, we encourage you to respond to reviews professionally and
            constructively. Major review platforms including Google allow businesses to publicly reply to reviews, which
            is generally considered a more effective and legally appropriate way to address concerns and correct
            inaccuracies.
          </p>
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-semibold text-zinc-900">8.5 Your Responsibility</h3>
          <p>
            You are solely responsible for ensuring your use of the Service complies with all applicable laws, including
            the Australian Consumer Law and the Competition and Consumer Act 2010 (Cth). Venue Voice does not accept
            liability for any penalties, fines, or claims arising from your misuse of the platform in connection with
            review management.
          </p>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">9. Third-Party Integrations</h2>
        <p>
          The Service may integrate with third-party platforms, such as review platforms and email service providers. We
          are not responsible for:
        </p>
        <BulletList
          items={[
            "The availability, reliability, or functionality of any third-party service",
            "Any data shared with or processed by third parties as a result of your use of those integrations",
          ]}
        />
        <p>Your use of any third-party services is subject to their own terms and conditions.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">10. Fees and Payments</h2>
        <p>Certain features of the Service require a paid subscription. By subscribing, you agree to:</p>
        <BulletList
          items={[
            "Pay all applicable fees as set out in your chosen plan",
            "Provide accurate and current billing information",
          ]}
        />
        <p>Please note:</p>
        <BulletList
          items={[
            "Subscriptions renew automatically at the end of each billing period unless cancelled prior to renewal.",
            "We may adjust pricing with reasonable advance notice.",
            "All fees are non-refundable except where required by law, including the Australian Consumer Law.",
          ]}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">11. Cancellation and Termination</h2>
        <p>You may cancel your subscription at any time through your account settings.</p>
        <p>We may suspend or terminate your access to the Service if:</p>
        <BulletList
          items={[
            "You breach these Terms",
            "We are required to do so by law",
            "We elect to discontinue the Service",
          ]}
        />
        <p>
          Upon termination, your access to the Service will cease. We may retain or delete your data in accordance with
          our{" "}
          <Link href="/legal/privacy" className="font-medium text-violet-700 underline-offset-2 hover:underline">
            Privacy Policy
          </Link>{" "}
          and applicable law.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">12. Intellectual Property</h2>
        <p>All rights, title, and interest in the Service (excluding Customer Data) remain with Venue Voice or its licensors.</p>
        <p>
          You are granted a limited, non-exclusive, non-transferable licence to access and use the Service in accordance
          with these Terms. You must not:
        </p>
        <BulletList
          items={[
            "Copy, modify, adapt, or distribute any part of the platform",
            "Use our name, logo, or branding without our prior written permission",
          ]}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">13. Service Availability</h2>
        <p>We take reasonable steps to provide a reliable Service, but we do not guarantee:</p>
        <BulletList items={["Continuous or uninterrupted availability", "Error-free operation at all times"]} />
        <p>The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">14. Limitation of Liability</h2>
        <p>To the maximum extent permitted by law, Venue Voice is not liable for:</p>
        <BulletList
          items={[
            "Loss of profits, revenue, or business opportunity",
            "Loss of data or corruption of data",
            "Indirect, incidental, or consequential loss or damage of any kind",
          ]}
        />
        <p>
          Where liability cannot be excluded, our total aggregate liability to you is limited to the fees you paid us in
          the 12 months immediately preceding the relevant claim.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">15. Indemnity</h2>
        <p>
          You agree to indemnify, defend, and hold harmless Venue Voice and its officers, employees, and agents from and
          against any claims, liabilities, costs, and expenses (including reasonable legal fees) arising from:
        </p>
        <BulletList
          items={[
            "Your use of the Service",
            "Your Customer Data",
            "Your breach of these Terms or any applicable law",
          ]}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">16. Privacy</h2>
        <p>
          Your use of the Service is governed by our{" "}
          <Link href="/legal/privacy" className="font-medium text-violet-700 underline-offset-2 hover:underline">
            Privacy Policy
          </Link>
          , which is incorporated into these Terms by reference. Please read our Privacy Policy to understand how we
          collect, use, and protect your personal information.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">17. Changes to These Terms</h2>
        <p>
          We may update these Terms from time to time to reflect changes to our Service, legal requirements, or business
          practices. We will notify you of any material changes prior to them taking effect. Your continued use of the
          Service after such notice constitutes your acceptance of the updated Terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">18. Governing Law</h2>
        <p>
          These Terms are governed by the laws of Queensland, Australia. You agree to submit to the exclusive jurisdiction
          of the courts of Queensland for any disputes arising in connection with these Terms or the Service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-zinc-900">19. Contact Us</h2>
        <p>If you have any questions about these Terms or the Service, please contact us at:</p>
        <p className="font-medium text-zinc-900">Venue Voice</p>
        <p>
          Email:{" "}
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
