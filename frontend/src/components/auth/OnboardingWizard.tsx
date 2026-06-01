import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Zap, CheckCircle, ExternalLink, Eye, EyeOff, Loader2 } from 'lucide-react'
import { profilesApi, settingsApi, llmApi } from '@/utils/api'
import { useAppStore } from '@/store'
import toast from 'react-hot-toast'

const AVATAR_COLORS = ['#FFA116','#00B8A3','#FF375F','#6366F1','#EC4899','#F59E0B','#10B981','#3B82F6']
const TOTAL_STEPS = 4

const PROVIDERS = [
  { key: 'cerebras_api_key', providerName: 'cerebras', label: 'Cerebras', placeholder: 'csk-...', link: 'https://cloud.cerebras.ai' },
  { key: 'groq_api_key', providerName: 'groq', label: 'Groq', placeholder: 'gsk_...', link: 'https://console.groq.com/keys' },
  { key: 'google_ai_api_key', providerName: 'google', label: 'Google AI Studio', placeholder: 'AIza...', link: 'https://aistudio.google.com/app/apikey' },
  { key: 'openrouter_api_key', providerName: 'openrouter', label: 'OpenRouter', placeholder: 'sk-or-...', link: 'https://openrouter.ai/keys' },
]

export default function OnboardingWizard() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { setActiveProfile } = useAppStore()

  const [step, setStep] = useState(1)
  const [username, setUsername] = useState('')
  const [avatarColor, setAvatarColor] = useState(AVATAR_COLORS[0])
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [testResults, setTestResults] = useState<Record<string, boolean | null>>({})
  const [kaggleUsername, setKaggleUsername] = useState('')
  const [kaggleKey, setKaggleKey] = useState('')
  const [createdProfile, setCreatedProfile] = useState<any>(null)

  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [lmstudioModels, setLMStudioModels] = useState<string[]>([])
  const [selectedOllama, setSelectedOllama] = useState('')
  const [selectedLMStudio, setSelectedLMStudio] = useState('')
  const [detecting, setDetecting] = useState(false)

  const createProfile = useMutation({
    mutationFn: () => profilesApi.create(username.trim(), avatarColor),
    onSuccess: async (profile) => {
      await profilesApi.activate(profile.id)
      setCreatedProfile(profile)
      setActiveProfile(profile)
      qc.invalidateQueries({ queryKey: ['profiles'] })
      setStep(2)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to create profile'),
  })

  const saveLLMSettings = useMutation({
    mutationFn: (data: Record<string, string>) =>
      settingsApi.updateLLM(createdProfile!.id, data),
    onError: (e: any) => toast.error(e.response?.data?.detail || e.message || 'Failed to save API keys'),
  })

  const [testingAll, setTestingAll] = useState(false)

  const testConnection = async (stateKey: string, provider: string, key: string) => {
    setTestResults(prev => ({ ...prev, [stateKey]: null }))
    try {
      const result = await settingsApi.testConnection(provider, key)
      setTestResults(prev => ({ ...prev, [stateKey]: result.available }))
    } catch {
      setTestResults(prev => ({ ...prev, [stateKey]: false }))
    }
  }

  const testAll = async () => {
    setTestingAll(true)
    for (const p of PROVIDERS) {
      const key = apiKeys[p.key]
      if (key) await testConnection(p.key, p.providerName, key)
    }
    setTestingAll(false)
  }

  const detectLocalModels = async () => {
    setDetecting(true)
    try {
      const [ollama, lmstudio] = await Promise.all([
        llmApi.ollamaModels(),
        llmApi.lmstudioModels(),
      ])
      setOllamaModels(ollama.models)
      setLMStudioModels(lmstudio.models)
      if (ollama.models.length > 0) setSelectedOllama(ollama.models[0])
      if (lmstudio.models.length > 0) setSelectedLMStudio(lmstudio.models[0])
      if (!lmstudio.available && lmstudio.error) {
        toast.error(lmstudio.error)
      }
    } catch {}
    setDetecting(false)
  }

  const finish = async () => {
    if (createdProfile) {
      const settings: Record<string, string> = { ...apiKeys }
      if (kaggleUsername) settings.kaggle_username = kaggleUsername
      if (kaggleKey) settings.kaggle_key = kaggleKey
      if (selectedOllama) settings.active_local_model_ollama = selectedOllama
      if (selectedLMStudio) settings.active_local_model_lmstudio = selectedLMStudio
      if (Object.keys(settings).length > 0) {
        await saveLLMSettings.mutateAsync(settings)
      }
    }
    navigate('/problems')
  }

  const progress = ((step - 1) / (TOTAL_STEPS - 1)) * 100

  return (
    <div className="min-h-screen bg-dark-bg flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Zap size={32} className="text-primary" fill="currentColor" />
            <span className="text-3xl font-bold text-white">AnalyticsForge</span>
          </div>
          <p className="text-gray-400 text-sm">AI-powered SQL and Python analytics practice platform</p>
        </div>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs text-gray-500 mb-2">
            <span>Step {step} of {TOTAL_STEPS}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="h-1 bg-dark-border rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all duration-500 rounded-full" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="bg-dark-panel border border-dark-border rounded-2xl p-6 shadow-2xl">
          {/* Step 1: Profile */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-xl font-semibold text-white">Create your profile</h2>
              <p className="text-sm text-gray-400">Choose a username and avatar color. No passwords required.</p>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">Username</label>
                <input
                  className="input"
                  placeholder="e.g. vishal"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && username.trim() && createProfile.mutate()}
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Avatar Color</label>
                <div className="flex gap-3 flex-wrap">
                  {AVATAR_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setAvatarColor(c)}
                      className={`w-9 h-9 rounded-full transition-all ${avatarColor === c ? 'scale-125 ring-2 ring-white/60' : 'hover:scale-110'}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
              {username.trim() && (
                <div className="flex items-center gap-3 bg-dark-card rounded-xl p-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-black font-bold text-lg"
                       style={{ background: avatarColor }}>
                    {username[0].toUpperCase()}
                  </div>
                  <span className="text-white font-medium">{username}</span>
                </div>
              )}
              <button
                className="btn-primary w-full py-2.5"
                disabled={!username.trim() || createProfile.isPending}
                onClick={() => createProfile.mutate()}
              >
                {createProfile.isPending ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Continue →'}
              </button>
            </div>
          )}

          {/* Step 2: LLM API Keys */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white">Connect LLM providers</h2>
              <p className="text-sm text-gray-400">Add API keys for online providers. At least one is required. You can update these later in Settings.</p>
              {PROVIDERS.map(p => (
                <div key={p.key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-300">{p.label}</label>
                    <a href={p.link} target="_blank" rel="noreferrer" className="text-xs text-primary flex items-center gap-1 hover:underline">
                      Get key <ExternalLink size={10} />
                    </a>
                  </div>
                  <div className="relative flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type={showKeys[p.key] ? 'text' : 'password'}
                        className="input pr-9 font-mono text-xs"
                        placeholder={p.placeholder}
                        value={apiKeys[p.key] || ''}
                        onChange={e => setApiKeys(prev => ({ ...prev, [p.key]: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                        onClick={() => setShowKeys(prev => ({ ...prev, [p.key]: !prev[p.key] }))}
                      >
                        {showKeys[p.key] ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <div className="w-5 flex items-center justify-center">
                      {testResults[p.key] === true && <CheckCircle size={16} className="text-success" />}
                      {testResults[p.key] === false && <span className="text-error text-sm">✗</span>}
                      {testResults[p.key] === null && <Loader2 size={14} className="animate-spin text-gray-400" />}
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={testAll}
                  disabled={testingAll || Object.keys(apiKeys).length === 0}
                  className="btn-ghost flex-1 flex items-center justify-center gap-2"
                >
                  {testingAll ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  Test All
                </button>
                <button
                  disabled={saveLLMSettings.isPending}
                  onClick={async () => {
                    if (Object.keys(apiKeys).length > 0) {
                      try {
                        await saveLLMSettings.mutateAsync(apiKeys)
                      } catch { return }
                    }
                    setStep(3)
                  }}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  {saveLLMSettings.isPending && <Loader2 size={14} className="animate-spin" />}
                  Save & Continue →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Kaggle */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white">Kaggle API (optional)</h2>
              <p className="text-sm text-gray-400">Connect Kaggle to generate problems from real datasets.</p>
              <div className="bg-dark-card rounded-xl p-4 text-xs text-gray-400 space-y-1 border border-dark-border">
                <p className="font-medium text-gray-300 mb-2">How to get your Kaggle API key:</p>
                <p>1. Go to <a href="https://kaggle.com" target="_blank" rel="noreferrer" className="text-primary">kaggle.com</a> → Profile → Settings</p>
                <p>2. Scroll to <strong className="text-gray-300">API</strong> section → Click <strong className="text-gray-300">"Create New Token"</strong></p>
                <p>3. Downloads <code className="bg-dark-bg px-1 rounded">kaggle.json</code> with your username + key</p>
              </div>
              <input className="input" placeholder="Kaggle username" value={kaggleUsername} onChange={e => setKaggleUsername(e.target.value)} />
              <input type="password" className="input font-mono text-xs" placeholder="Kaggle API key" value={kaggleKey} onChange={e => setKaggleKey(e.target.value)} />
              <div className="flex gap-3">
                <button onClick={() => setStep(4)} className="btn-ghost flex-1">Skip</button>
                <button onClick={() => setStep(4)} className="btn-primary flex-1">Continue →</button>
              </div>
            </div>
          )}

          {/* Step 4: Local LLM */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white">Local LLM (optional)</h2>
              <p className="text-sm text-gray-400">Auto-detect models from Ollama and LM Studio running on your Mac.</p>
              <button
                onClick={detectLocalModels}
                disabled={detecting}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {detecting ? <Loader2 size={16} className="animate-spin" /> : '🔍'}
                {detecting ? 'Detecting...' : 'Auto-detect local models'}
              </button>
              {ollamaModels.length > 0 && (
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">Ollama — Default model</label>
                  <select className="input" value={selectedOllama} onChange={e => setSelectedOllama(e.target.value)}>
                    {ollamaModels.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              )}
              {lmstudioModels.length > 0 && (
                <div>
                  <label className="text-sm text-gray-400 mb-1 block">LM Studio — Default model</label>
                  <select className="input" value={selectedLMStudio} onChange={e => setSelectedLMStudio(e.target.value)}>
                    {lmstudioModels.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              )}
              {ollamaModels.length === 0 && lmstudioModels.length === 0 && !detecting && (
                <p className="text-xs text-gray-500 text-center">No local LLMs detected. Make sure Ollama or LM Studio is running.</p>
              )}
              <button onClick={finish} className="btn-primary w-full py-2.5 mt-2">
                🚀 Start using AnalyticsForge
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
