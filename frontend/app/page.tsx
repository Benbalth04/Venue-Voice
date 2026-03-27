import Navbar from '@/components/landing/Navbar'
import Hero from '@/components/landing/Hero'
import AutomatedFlows from '@/components/landing/AutomatedFlows'
import HowItWorks from '@/components/landing/HowItWorks'
import FeatureSection, {
  SentimentMock,
  MultiLocationMock,
  PhotoQuestionMock,
  QRMock,
} from '@/components/landing/FeatureSection'
import CTASection from '@/components/landing/CTASection'

export default function Home() {
  return (
    <main className="overflow-x-hidden">
      <Navbar />
      <Hero />
      <AutomatedFlows />
      <HowItWorks />

      {/* AI Sentiment Analysis */}
      <FeatureSection
        id="features"
        label="AI-Powered"
        headline="Understand what your customers are really saying."
        body="AI-powered sentiment analysis turns raw feedback into actionable insights the moment a survey is submitted. No manual tagging, no waiting for weekly reports."
        bullets={[
          'Instant sentiment scoring on every response',
          'Surface recurring themes and keywords automatically',
          'Drill into individual responses or view aggregated trends',
        ]}
        screenshot={<SentimentMock />}
      />

      {/* Multi-Location */}
      <FeatureSection
        label="Multi-Location"
        headline="Built for multi-location businesses."
        body="Manage feedback across all your venues in one place. Compare performance, spot outliers, and maintain consistency at scale — without switching between dashboards."
        bullets={[
          'Unified view across every location',
          'Per-location benchmarking and trend comparisons',
          'Role-based access — managers see their own venue',
        ]}
        screenshot={<MultiLocationMock />}
        reverse
        tint
      />

      {/* Photo Questions */}
      <FeatureSection
        label="Visual Feedback"
        headline="See what your customers see."
        body="Collect visual feedback with photo-based questions to uncover issues you'd otherwise miss. A picture of a dirty table or a perfect dish tells you more than a rating ever could."
        bullets={[
          'Photo upload questions in any survey',
          'Visual evidence stored securely per response',
          'Combine with ratings for richer context',
        ]}
        screenshot={<PhotoQuestionMock />}
      />

      {/* QR + Review Control */}
      <FeatureSection
        label="Review Control"
        headline="Take control of your reviews."
        body="Use reusable QR codes to capture feedback at the point of experience. Route happy customers straight to Google Reviews. Keep critical feedback in your private inbox where you can act on it first."
        bullets={[
          'Permanent, reusable QR codes per location',
          'Smart routing — 4–5 stars go public, 1–3 stay private',
          'Stop negative reviews before they go live',
        ]}
        screenshot={<QRMock />}
        reverse
        tint
      />

      <CTASection />
    </main>
  )
}
