import Navbar from '@/components/landing/Navbar'
import Hero from '@/components/landing/Hero'
import FeaturesSection from '@/components/landing/FeaturesSection'
import PricingSection from '@/components/landing/PricingSection'
import AutomatedFlows from '@/components/landing/AutomatedFlows'
import FAQSection from '@/components/landing/FAQSection'

export default function Home() {
  return (
    <main className="overflow-x-hidden">
      <Navbar />
      <Hero />
      <FeaturesSection />
      <AutomatedFlows />
      <PricingSection />
      <FAQSection />
    </main>
  )
}