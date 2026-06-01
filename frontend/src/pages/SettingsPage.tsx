import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, ExternalLink, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { settingsApi, profilesApi } from '@/utils/api'
import { useAppStore } from '@/store'
import toast from 'react-hot-toast'

const PROVIDER_META: Record<string, { label: string; link: string; placeholder: string; isLocal?: boolean }> = {
  cerebras: { label: 'Cerebras', link: 'https://cloud.cerebras.ai', placeholder: 'csk-...' },
  groq: { label: 'Groq', link: 'https://console.groq.com/keys', placeholder: 'gsk_...' },
  google: { label: 'Google AI Studio', link: 'https://aistudio.google.com/app/apikey', placeholder: 'AIza...' },
  openrouter: { label: 'OpenRouter', link: 'https://openrouter.ai/keys', placeholder: 'sk-or-...' },
  ollama: { label: 'Ollama', link: 'https://ollama.ai', placeholder: '', isLocal: true },
  lmstudio: { label: 'LM Studio', link: 'https://lmstudio.ai', placeholder: '', isLocal: true },
}

const KEY_MAP: Record<string, string> = {
  cerebras: 'cerebras_api_key',
  groq: 'groq_api_key',
  google: 'google_ai_api_key',
  openrouter: 'openrouter_api_key',
}

export default function SettingsPage() {
  const { activeProfile, theme, toggleTheme, setActiveProfile } = useAppStore()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({})
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [testResults, setTestResults] = useState<Record<string, boolean | null | 'testing'>>({})
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [lmstudioModels, setLMStudioModels] = useState<string[]>([])

  const { data: appSettings } = useQuery({
    queryKey: ['settings', activeProfile?.id],
    queryFn: () => settingsApi.getApp(activeProfile!.id),
    enabled: !!activeProfile,
  })

  const { data: llmSettings } = useQuery({
    queryKey: ['llm-settings', activeProfile?.id],
    queryFn: () => settingsApi.getLLM(activeProfile!.id),
    enabled: !!activeProfile,
  })

  const updateApp = useMutation({
    mutationFn: (data: Record<string, unknown>) => settingsApi.updateApp(activeProfile!.id, data),
    onSuccess: () => { toast.success('Settings saved'); qc.invalidateQueries({ queryKey: ['settings'] }) },
  })

  const updateLLM = useMutation({
    mutationFn: (data: Record<string, unknown>) => settingsApi.updateLLM(activeProfile!.id, data),
    onSuccess: () => { toast.success('LLM settings saved'); qc.invalidateQueries({ queryKey: ['llm-settings'] }) },
  })

  const testProvider = async (provider: string, keyField?: string) => {
    setTestResults(prev => ({ ...prev, [provider]: 'testing' }))
    try {
      const apiKey = keyField ? apiKeyInputs[provider] : undefined
      const baseUrl = provider === 'ollama' ? llmSettings?.ollama_base_url : provider === 'lmstudio' ? llmSettings?.lmstudio_base_url : undefined
      const result = await settingsApi.testConnection(provider, apiKey, baseUrl)
      setTestResults(prev => ({ ...prev, [provider]: result.available }))
      if (!result.available && result.error) {
        toast.error(result.error)
      }
      if (provider === 'ollama' && result.models) setOllamaModels(result.models)
      if (provider === 'lmstudio' && result.models) setLMStudioModels(result.models)
    } catch {
      setTestResults(prev => ({ ...prev, [provider]: false }))
    }
  }

  const deleteProfile = useMutation({
    mutationFn: () => profilesApi.delete(activeProfile!.id),
    onSuccess: async () => {
      const remaining = await profilesApi.list()
      if (remaining.length > 0) {
        await profilesApi.activate(remaining[0].id)
        setActiveProfile(remaining[0])
        qc.invalidateQueries({ queryKey: ['profiles'] })
        toast.success('Profile deleted')
        navigate('/problems')
      } else {
        setActiveProfile(null as any)
        qc.invalidateQueries({ queryKey: ['profiles'] })
        navigate('/onboarding')
      }
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to delete profile'),
  })

  const resetAnalytics = useMutation({
    mutationFn: () => profilesApi.resetAnalytics(activeProfile!.id),
    onSuccess: () => {
      toast.success('Submissions and analytics reset')
      qc.invalidateQueries({ queryKey: ['analytics'] })
      qc.invalidateQueries({ queryKey: ['problems'] })
      qc.invalidateQueries({ queryKey: ['submissions'] })
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to reset analytics'),
  })

  const handleResetAnalytics = () => {
    if (!window.confirm('Reset all submissions and analytics? Your problems are kept, but all solve history, streaks, and stats will be cleared. This cannot be undone.')) return
    resetAnalytics.mutate()
  }

  const handleDeleteProfile = () => {
    if (!window.confirm(`Delete profile "${activeProfile?.username}"? This removes all your problems, submissions, and analytics. This cannot be undone.`)) return
    deleteProfile.mutate()
  }

  const saveLLMKeys = () => {
    const data: Record<string, string> = {}
    Object.entries(apiKeyInputs).forEach(([provider, key]) => {
      if (key && KEY_MAP[provider]) data[KEY_MAP[provider]] = key
    })
    if (Object.keys(data).length) updateLLM.mutate(data)
    else toast('No new keys to save', { icon: 'ℹ️' })
  }

  if (!activeProfile) return (
    <div className="flex items-center justify-center h-full text-gray-500">Select a profile first</div>
  )

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="bg-dark-panel border border-dark-border rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-dark-border bg-dark-card">
        <h2 className="text-sm font-semibold text-gray-300">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-5">
        <h1 className="text-2xl font-bold text-white">Settings</h1>

        {/* General */}
        <Section title="General">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-300">Theme</p>
                <p className="text-xs text-gray-500">Current: {theme}</p>
              </div>
              <button onClick={toggleTheme} className="btn-primary text-sm">
                Switch to {theme === 'dark' ? 'Light' : 'Dark'}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-300">Problem of the Day</p>
                <p className="text-xs text-gray-500">Show a daily featured problem</p>
              </div>
              <button
                onClick={() => updateApp.mutate({ potd_enabled: !appSettings?.potd_enabled })}
                className={`w-11 h-6 rounded-full border transition-all duration-200 relative ${
                  appSettings?.potd_enabled
                    ? 'bg-primary border-primary/80 shadow-[0_0_0_1px_rgba(255,161,22,0.25)]'
                    : 'bg-dark-input border-dark-border hover:border-gray-500'
                }`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${appSettings?.potd_enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-300 block mb-1.5">Default batch size</label>
              <input
                type="number" min={1} max={50}
                className="input w-24"
                defaultValue={appSettings?.batch_generate_count || 5}
                onBlur={e => updateApp.mutate({ batch_generate_count: Number(e.target.value) })}
              />
            </div>
          </div>
        </Section>

        {/* Notifications */}
        <Section title="Notifications">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-300">Streak Reminders</p>
                <p className="text-xs text-gray-500">Daily desktop notification to maintain your streak</p>
              </div>
              <button
                onClick={() => updateApp.mutate({ streak_reminder_enabled: !appSettings?.streak_reminder_enabled })}
                className={`w-11 h-6 rounded-full border transition-all duration-200 relative ${
                  appSettings?.streak_reminder_enabled
                    ? 'bg-primary border-primary/80 shadow-[0_0_0_1px_rgba(255,161,22,0.25)]'
                    : 'bg-dark-input border-dark-border hover:border-gray-500'
                }`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${appSettings?.streak_reminder_enabled ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {appSettings?.streak_reminder_enabled && (
              <div>
                <label className="text-sm font-medium text-gray-300 block mb-1.5">Reminder time</label>
                <input
                  type="time"
                  className="input w-32"
                  defaultValue={appSettings?.notification_time || '09:00'}
                  onBlur={e => updateApp.mutate({ notification_time: e.target.value })}
                />
              </div>
            )}
          </div>
        </Section>

        {/* LLM Configuration */}
        <Section title="LLM Configuration">
          <div className="space-y-4">
            <p className="text-xs text-gray-500">Fallback order: Cerebras → Groq → Google → OpenRouter → LM Studio → Ollama</p>

            {Object.entries(PROVIDER_META).map(([provider, meta]) => (
              <div key={provider} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-300">{meta.label}</span>
                    {meta.isLocal && <span className="tag text-xs">Local</span>}
                    <a href={meta.link} target="_blank" rel="noreferrer" className="text-primary">
                      <ExternalLink size={11} />
                    </a>
                    {!meta.isLocal && llmSettings?.[KEY_MAP[provider] as keyof typeof llmSettings] && !apiKeyInputs[provider] && (
                      <span className="flex items-center gap-1 text-xs text-success">
                        <CheckCircle size={11} /> Saved
                      </span>
                    )}
                    {provider === 'ollama' && llmSettings?.active_local_model_ollama && (
                      <span className="flex items-center gap-1 text-xs text-success">
                        <CheckCircle size={11} /> Model saved
                      </span>
                    )}
                    {provider === 'lmstudio' && llmSettings?.active_local_model_lmstudio && (
                      <span className="flex items-center gap-1 text-xs text-success">
                        <CheckCircle size={11} /> Model saved
                      </span>
                    )}
                  </div>
                  {testResults[provider] === 'testing' && <Loader2 size={14} className="animate-spin text-gray-400" />}
                  {testResults[provider] === true && <CheckCircle size={14} className="text-success" />}
                  {testResults[provider] === false && <XCircle size={14} className="text-error" />}
                </div>

                {meta.isLocal ? (
                  <button
                    onClick={() => testProvider(provider)}
                    className="text-xs text-primary hover:underline"
                  >
                    Auto-detect & test {meta.label}
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showKeys[provider] ? 'text' : 'password'}
                        className="input pr-9 font-mono text-xs"
                        placeholder={
                          llmSettings?.[KEY_MAP[provider] as keyof typeof llmSettings]
                            ? `Enter new key to replace saved one`
                            : `${meta.placeholder || `New ${meta.label} key`}`
                        }
                        value={apiKeyInputs[provider] || ''}
                        onChange={e => setApiKeyInputs(prev => ({ ...prev, [provider]: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                        onClick={() => setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }))}
                      >
                        {showKeys[provider] ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                    {apiKeyInputs[provider] && (
                      <button
                        onClick={() => testProvider(provider, KEY_MAP[provider])}
                        className="px-3 py-1.5 text-xs bg-dark-card border border-dark-border rounded-lg hover:bg-dark-hover transition-colors text-gray-400"
                      >
                        Test
                      </button>
                    )}
                  </div>
                )}

                {/* Ollama model selector */}
                {provider === 'ollama' && ollamaModels.length > 0 && (
                  <select
                    className="input text-xs"
                    defaultValue={llmSettings?.active_local_model_ollama}
                    onChange={e => updateLLM.mutate({ active_local_model_ollama: e.target.value })}
                  >
                    {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
                {provider === 'ollama' && llmSettings?.active_local_model_ollama && ollamaModels.length === 0 && (
                  <p className="text-xs text-gray-500">
                    Saved default model: <span className="text-gray-300 font-mono">{llmSettings.active_local_model_ollama}</span>
                  </p>
                )}

                {/* LM Studio model selector */}
                {provider === 'lmstudio' && lmstudioModels.length > 0 && (
                  <select
                    className="input text-xs"
                    defaultValue={llmSettings?.active_local_model_lmstudio}
                    onChange={e => updateLLM.mutate({ active_local_model_lmstudio: e.target.value })}
                  >
                    {lmstudioModels.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
                {provider === 'lmstudio' && llmSettings?.active_local_model_lmstudio && lmstudioModels.length === 0 && (
                  <p className="text-xs text-gray-500">
                    Saved default model: <span className="text-gray-300 font-mono">{llmSettings.active_local_model_lmstudio}</span>
                  </p>
                )}
              </div>
            ))}

            <button onClick={saveLLMKeys} className="btn-primary w-full" disabled={updateLLM.isPending}>
              {updateLLM.isPending ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Save API Keys'}
            </button>
          </div>
        </Section>

        {/* Kaggle */}
        <Section title="Kaggle Integration">
          <div className="space-y-3">
            <div className="text-xs text-gray-500 bg-dark-card rounded-lg p-3 border border-dark-border space-y-1">
              <p>Get your key: <a href="https://kaggle.com/settings" target="_blank" rel="noreferrer" className="text-primary hover:underline">kaggle.com → Settings → API → Create New Token</a></p>
            </div>
            <div className="flex items-center gap-2">
              {llmSettings?.kaggle_username && (
                <span className="flex items-center gap-1 text-xs text-success">
                  <CheckCircle size={11} /> Username saved
                </span>
              )}
              {llmSettings?.kaggle_key && (
                <span className="flex items-center gap-1 text-xs text-success">
                  <CheckCircle size={11} /> API key saved
                </span>
              )}
            </div>
            <input className="input" placeholder="Kaggle username"
              defaultValue={llmSettings?.kaggle_username}
              onBlur={e => updateLLM.mutate({ kaggle_username: e.target.value })}
            />
            <input type="password" className="input font-mono text-xs" placeholder="Kaggle API key"
              onBlur={e => { if (e.target.value) updateLLM.mutate({ kaggle_key: e.target.value }) }}
            />
          </div>
        </Section>

        {/* Account */}
        <Section title="Account">
          <div className="space-y-3">
            <p className="text-sm text-gray-400">Profile: <span className="text-white font-medium">{activeProfile.username}</span></p>
            <p className="text-xs text-gray-500">Profile deletion removes all your problems, submissions, and analytics.</p>
            <button
              onClick={handleDeleteProfile}
              disabled={deleteProfile.isPending}
              className="text-xs text-error hover:text-red-400 transition-colors border border-error/30 hover:border-error/60 px-3 py-1.5 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
            >
              {deleteProfile.isPending ? <Loader2 size={12} className="animate-spin" /> : null}
              Delete Profile
            </button>
            <button
              onClick={handleResetAnalytics}
              disabled={resetAnalytics.isPending}
              className="text-xs text-yellow-500 hover:text-yellow-400 transition-colors border border-yellow-500/30 hover:border-yellow-500/60 px-3 py-1.5 rounded-lg flex items-center gap-1.5 disabled:opacity-50"
            >
              {resetAnalytics.isPending ? <Loader2 size={12} className="animate-spin" /> : null}
              Reset Submissions & Analytics
            </button>
          </div>
        </Section>
      </div>
    </div>
  )
}
