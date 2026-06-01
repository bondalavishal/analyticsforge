import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAppStore } from '@/store'
import { profilesApi } from '@/utils/api'
import AppShell from '@/components/layout/AppShell'
import OnboardingWizard from '@/components/auth/OnboardingWizard'
import ProblemsPage from '@/pages/ProblemsPage'
import AnalyticsDashboard from '@/pages/AnalyticsDashboard'
import LeaderboardPage from '@/pages/LeaderboardPage'
import SettingsPage from '@/pages/SettingsPage'

function ThemeEffect() {
  const theme = useAppStore(s => s.theme)
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [theme])
  return null
}

export default function App() {
  // Remove `theme` from destructure — ThemeEffect handles it exclusively
  const { setActiveProfile } = useAppStore()

  const { data: profiles, isLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: profilesApi.list,
  })

  useEffect(() => {
    if (profiles && profiles.length > 0) {
      const active = profiles.find(p => p.is_active) || profiles[0]
      setActiveProfile(active)
    }
  }, [profiles, setActiveProfile])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="text-3xl font-bold text-accent">📊 AnalyticsForge</div>
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  const needsOnboarding = !profiles || profiles.length === 0

  return (
    <>
      <ThemeEffect />
      <Routes>
        <Route path="/onboarding" element={<OnboardingWizard />} />
        {needsOnboarding ? (
          <Route path="*" element={<Navigate to="/onboarding" replace />} />
        ) : (
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/problems" replace />} />
            <Route path="/problems" element={<ProblemsPage />} />
            <Route path="/problems/:id" element={<ProblemsPage />} />
            <Route path="/analytics" element={<AnalyticsDashboard />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/problems" replace />} />
          </Route>
        )}
      </Routes>
    </>
  )
}
