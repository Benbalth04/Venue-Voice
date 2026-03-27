import type { ReactNode } from "react"
import { DashboardLayout } from "@/components/layout/DashboardLayout"
import { AuthGuard } from "@/components/auth/AuthGuard"
import { EmailVerifiedGuard } from "@/components/auth/EmailVerifiedGuard"
import { SettingsSchemaProvider } from "@/contexts/SettingsSchemaContext"
import { OnboardingGuard } from "@/components/auth/OnboardingGuard"

export default function DashboardRootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <AuthGuard>
      <EmailVerifiedGuard>
        <OnboardingGuard>
          <SettingsSchemaProvider>
            <DashboardLayout>{children}</DashboardLayout>
          </SettingsSchemaProvider>
        </OnboardingGuard>
      </EmailVerifiedGuard>
    </AuthGuard>
  )
}