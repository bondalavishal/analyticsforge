import { useEffect, useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { BarChart3, Settings, MessageSquare, Loader2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { LLMProvider, ProviderStatus } from '@/types'
import ProfileSwitcher from '@/components/auth/ProfileSwitcher'
import ThemeToggle from '@/components/layout/ThemeToggle'
import LanguageModeSwitch from '@/components/layout/LanguageModeSwitch'
import { useAppStore } from '@/store'
import AIAssistantSidebar from '@/components/chat/AIAssistantSidebar'
import { llmApi, problemsApi } from '@/utils/api'
import toast from 'react-hot-toast'

const navItems = [
  { to: '/problems', label: 'Problems' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/leaderboard', label: 'Leaderboard' },
]

const PROVIDER_LABELS: Record<LLMProvider, string> = {
  cerebras: 'Cerebras',
  groq: 'Groq',
  google: 'Google AI Studio',
  openrouter: 'OpenRouter',
  lmstudio: 'LM Studio',
  ollama: 'Ollama',
}

const PROVIDER_CODES: Record<LLMProvider, string> = {
  cerebras: 'CE',
  groq: 'GR',
  google: 'GO',
  openrouter: 'OR',
  lmstudio: 'LM',
  ollama: 'OL',
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export default function AppShell() {
  const {
    chatSidebarOpen,
    setChatSidebarOpen,
    activeProfile,
    sqlGenerationJobId,
    pythonGenerationJobId,
    setGenerationJobId,
    practiceLanguage,
  } = useAppStore()
  const [nowMs, setNowMs] = useState(Date.now())

  const activeGenerationJobId = practiceLanguage === 'python' ? pythonGenerationJobId : sqlGenerationJobId

  const { data: sqlJob, error: sqlJobError } = useQuery({
    queryKey: ['background-generation-job', 'sql', sqlGenerationJobId, activeProfile?.id],
    queryFn: () => problemsApi.getGenerationJob(sqlGenerationJobId!, activeProfile?.id),
    enabled: !!sqlGenerationJobId && !!activeProfile?.id,
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!status) return 1000
      return (status === 'succeeded' || status === 'failed') ? false : 1200
    },
  })

  const { data: pythonJob, error: pythonJobError } = useQuery({
    queryKey: ['background-generation-job', 'python', pythonGenerationJobId, activeProfile?.id],
    queryFn: () => problemsApi.getGenerationJob(pythonGenerationJobId!, activeProfile?.id),
    enabled: !!pythonGenerationJobId && !!activeProfile?.id,
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!status) return 1000
      return (status === 'succeeded' || status === 'failed') ? false : 1200
    },
  })

  const backgroundJob = practiceLanguage === 'python' ? pythonJob : sqlJob

  const { data: providerStatuses } = useQuery({
    queryKey: ['llm-provider-live-status', activeProfile?.id],
    queryFn: () => llmApi.providers(activeProfile!.id),
    enabled: !!activeProfile?.id,
    retry: false,
    refetchInterval: (sqlGenerationJobId || pythonGenerationJobId) ? 1200 : 5000,
    refetchIntervalInBackground: false,
  })

  useEffect(() => {
    if (!sqlGenerationJobId && !pythonGenerationJobId) return
    const timer = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [sqlGenerationJobId, pythonGenerationJobId])

  // Auto-clear SQL job when finished or timed out
  useEffect(() => {
    if (!sqlJob || !sqlGenerationJobId) return
    if (sqlJob.id !== sqlGenerationJobId) return

    if (sqlJob.status === 'succeeded' || sqlJob.status === 'failed') {
      setGenerationJobId('sql', null)
      return
    }

    // Handle 5-minute timeout (300,000 ms)
    const jobStartTime = sqlJob.started_at || sqlJob.created_at
    const elapsedMs = Date.now() - new Date(jobStartTime).getTime()
    if (elapsedMs > 300000 && (sqlJob.status === 'running' || sqlJob.status === 'queued')) {
      setGenerationJobId('sql', null)
      toast.error('SQL generation job timed out. Please try again.', { id: 'sql-generation-timeout' })
    }
  }, [sqlJob, sqlGenerationJobId, setGenerationJobId])

  useEffect(() => {
    const status = (sqlJobError as any)?.response?.status
    if (status === 403 || status === 404 || status === 410) {
      setGenerationJobId('sql', null)
    }
  }, [sqlJobError, setGenerationJobId])

  // Auto-clear Python job when finished or timed out
  useEffect(() => {
    if (!pythonJob || !pythonGenerationJobId) return
    if (pythonJob.id !== pythonGenerationJobId) return

    if (pythonJob.status === 'succeeded' || pythonJob.status === 'failed') {
      setGenerationJobId('python', null)
      return
    }

    // Handle 5-minute timeout (300,000 ms)
    const jobStartTime = pythonJob.started_at || pythonJob.created_at
    const elapsedMs = Date.now() - new Date(jobStartTime).getTime()
    if (elapsedMs > 300000 && (pythonJob.status === 'running' || pythonJob.status === 'queued')) {
      setGenerationJobId('python', null)
      toast.error('Python generation job timed out. Please try again.', { id: 'python-generation-timeout' })
    }
  }, [pythonJob, pythonGenerationJobId, setGenerationJobId])

  useEffect(() => {
    const status = (pythonJobError as any)?.response?.status
    if (status === 403 || status === 404 || status === 410) {
      setGenerationJobId('python', null)
    }
  }, [pythonJobError, setGenerationJobId])

  const elapsedLabel = (() => {
    if (!backgroundJob || (backgroundJob.status !== 'running' && backgroundJob.status !== 'queued')) return ''
    const jobStartTime = backgroundJob.started_at || backgroundJob.created_at
    const startedMs = new Date(jobStartTime).getTime()
    const elapsedMs = Math.max(0, nowMs - startedMs)
    return formatElapsed(elapsedMs)
  })()

  const showGenerationStrip = !!activeGenerationJobId && !!backgroundJob && (backgroundJob.status === 'queued' || backgroundJob.status === 'running')
  const progressLabel = (() => {
    if (!backgroundJob) return ''
    const total = Math.max(1, backgroundJob.requested_count || 1)
    const current = backgroundJob.status === 'running'
      ? Math.min(total, Math.max(1, (backgroundJob.completed_count || 0) + 1))
      : Math.min(total, Math.max(1, backgroundJob.completed_count || 1))
    return `${current}/${total}`
  })()
  const llmStatuses: ProviderStatus[] = providerStatuses || []
  const llmOnlineCount = llmStatuses.filter((p) => p.available).length
  const llmAnyInUse = llmStatuses.some((p) => p.in_use || p.recently_used)

  const llmChipClass = (status: ProviderStatus) => {
    if (status.in_use || status.recently_used) return 'border-yellow-500/50 bg-yellow-500/10 text-yellow-300'
    if (status.available) return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
    return 'border-red-500/40 bg-red-500/10 text-red-300'
  }

  const llmDotClass = llmAnyInUse
    ? 'bg-yellow-400'
    : llmOnlineCount > 0
      ? 'bg-emerald-400'
      : 'bg-red-400'

  return (
    <div className="h-screen flex flex-col bg-dark-bg overflow-hidden">
      {/* Top Nav */}
      <nav className="sticky top-0 z-40 border-b border-dark-border bg-dark-panel/90 backdrop-blur-sm">
        <div className="flex items-center h-12 px-4 gap-6">
          {/* Logo */}
          <NavLink to="/problems" className="flex items-center gap-2 shrink-0">
            <BarChart3 size={20} className="text-accent" />
            <span className="font-bold text-lg text-white tracking-tight">
              AnalyticsForge
            </span>
            <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium hidden sm:inline">
              {practiceLanguage === 'python' ? 'Python' : 'SQL'}
            </span>
          </NavLink>

          <LanguageModeSwitch />

          {/* Nav links */}
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {navItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-accent bg-accent/10'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-dark-hover'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>

          {llmStatuses.length > 0 && (
            <div className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-md border border-dark-border bg-dark-card/80 text-[11px] text-gray-300 shrink-0">
              <span className={`w-2 h-2 rounded-full ${llmDotClass}`} />
              <span className="text-gray-400">LLM</span>
              <span className="text-gray-500">{llmOnlineCount}/{llmStatuses.length}</span>
              <div className="flex items-center gap-1 ml-1">
                {llmStatuses.map((status) => {
                  const statusLabel = status.in_use ? 'In use' : status.recently_used ? 'Recently used' : status.available ? 'Online' : 'Offline'
                  const cooldown = (status.cooldown_remaining_s ?? 0) > 0
                    ? ` • cooldown ${Math.ceil(status.cooldown_remaining_s || 0)}s`
                    : ''
                  return (
                    <span
                      key={status.name}
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${llmChipClass(status)}`}
                      title={`${PROVIDER_LABELS[status.name]} — ${statusLabel}${cooldown}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-90" />
                      <span>{PROVIDER_CODES[status.name]}</span>
                    </span>
                  )
                })}
              </div>
            </div>
          )}

          {showGenerationStrip && (
            <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md border border-accent/30 bg-accent/10 text-accent text-xs shrink-0 max-w-[340px]">
              <Loader2 size={12} className="animate-spin shrink-0" />
              <span className="truncate">{progressLabel}</span>
              <span className="text-accent/70 shrink-0">{backgroundJob.progress_percent}%</span>
              {elapsedLabel && <span className="text-accent/70 shrink-0">Elapsed {elapsedLabel}</span>}
            </div>
          )}

          {/* Right side */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setChatSidebarOpen(!chatSidebarOpen)}
              className={`p-1.5 rounded-md transition-colors ${
                chatSidebarOpen ? 'text-accent bg-accent/10' : 'text-gray-400 hover:text-gray-200 hover:bg-dark-hover'
              }`}
              title="AI Assistant"
            >
              <MessageSquare size={18} />
            </button>
            <ThemeToggle />
            <NavLink
              to="/settings"
              className="p-1.5 rounded-md text-gray-400 hover:text-gray-200 hover:bg-dark-hover transition-colors"
            >
              <Settings size={18} />
            </NavLink>
            <ProfileSwitcher />
          </div>
        </div>
      </nav>

      {/* Main content */}
      <div className="flex overflow-hidden h-[calc(100vh-3rem)]">
        <main className="flex-1 overflow-hidden h-full">
          <Outlet />
        </main>
        {chatSidebarOpen && <AIAssistantSidebar />}
      </div>
    </div>
  )
}
