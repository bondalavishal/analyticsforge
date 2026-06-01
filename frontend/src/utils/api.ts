import axios from 'axios'
import type {
  Profile, Problem, Submission, SubmissionResult, RunResult,
  LLMSettings, AppSettings, AnalyticsDashboard, LeaderboardEntry,
  Dataset, GenerateOptions, ProviderStatus, QCResult, GenerationJob,
} from '@/types'

const api = axios.create({
  baseURL: '/api/v1',
  timeout: 120_000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Profiles ───────────────────────────────────────────────────────────────
export const profilesApi = {
  list: () => api.get<Profile[]>('/profiles').then(r => r.data),
  create: (username: string, avatar_color: string) =>
    api.post<Profile>('/profiles', { username, avatar_color }).then(r => r.data),
  activate: (id: string) => api.put<Profile>(`/profiles/${id}/activate`).then(r => r.data),
  getActive: () => api.get<Profile | null>('/profiles/active/current').then(r => r.data),
  delete: (id: string) => api.delete(`/profiles/${id}`),
  resetAnalytics: (id: string) => api.post(`/profiles/${id}/reset-analytics`),
}

// ── Problems ───────────────────────────────────────────────────────────────
export const problemsApi = {
  list: (params: Record<string, string | boolean | undefined>) =>
    api.get<Problem[]>('/problems', { params }).then(r => r.data),
  get: (id: string, profile_id?: string) =>
    api.get<Problem>(`/problems/${id}`, { params: { profile_id } }).then(r => r.data),
  generate: (opts: GenerateOptions) =>
    api.post<Problem>('/problems/generate', opts, { timeout: 0 }).then(r => r.data),
  generateBatch: (opts: GenerateOptions) =>
    api.post<{ generated: number; problems: { id: string; title: string }[]; errors: string[] }>(
      '/problems/generate/batch', opts, { timeout: 0 }
    ).then(r => r.data),
  generateAdaptive: (payload: {
    profile_id: string; topic?: string; difficulty?: string
    dialect: string; natural_language_request?: string; local_only?: boolean
  }) => api.post<Problem>('/problems/generate/adaptive', payload, { timeout: 0 }).then(r => r.data),
  generateJobSingle: (opts: GenerateOptions) =>
    api.post<GenerationJob>('/problems/generation-jobs/single', { ...opts, count: 1 }).then(r => r.data),
  generateJobBatch: (opts: GenerateOptions) =>
    api.post<GenerationJob>('/problems/generation-jobs/batch', opts).then(r => r.data),
  generateJobAdaptive: (payload: {
    profile_id: string
    language?: string
    topic?: string; difficulty?: string
    dialect: string; natural_language_request?: string; local_only?: boolean
  }) => api.post<GenerationJob>('/problems/generation-jobs/adaptive', payload).then(r => r.data),
  getGenerationJob: (job_id: string, profile_id?: string) =>
    api.get<GenerationJob>(`/problems/generation-jobs/${job_id}`, { params: { profile_id } }).then(r => r.data),
  qc: (id: string) =>
    api.post<QCResult>(`/problems/${id}/qc`).then(r => r.data),
  flag: (id: string, profile_id: string, reason: string) =>
    api.post(`/problems/${id}/flag`, { profile_id, reason }),
  bookmark: (id: string, profile_id: string) =>
    api.post<{ is_bookmarked: boolean }>(`/problems/${id}/bookmark`, { profile_id }).then(r => r.data),
  rate: (id: string, profile_id: string, difficulty: string) =>
    api.put(`/problems/${id}/rate`, { profile_id, difficulty }),
  saveNotes: (id: string, profile_id: string, notes: string) =>
    api.post(`/problems/${id}/notes`, { profile_id, notes }),
}

// ── Submissions ────────────────────────────────────────────────────────────
export const submissionsApi = {
  run: (payload: { profile_id: string; problem_id: string; sql: string; dialect: string }) =>
    api.post<RunResult>('/submissions/run', payload).then(r => r.data),
  submit: (payload: {
    profile_id: string; problem_id: string; sql: string
    dialect: string; time_spent_seconds: number
  }) => api.post<SubmissionResult>('/submissions', payload).then(r => r.data),
  list: (params: { problem_id?: string; profile_id?: string; limit?: number }) =>
    api.get<Submission[]>('/submissions', { params }).then(r => r.data),
  getExplanation: (submission_id: string) =>
    api.post<{ explanation: string }>(`/submissions/${submission_id}/explanation`).then(r => r.data),
}

// ── Analytics ──────────────────────────────────────────────────────────────
export const analyticsApi = {
  dashboard: (profile_id: string, period = 'all', language?: string) =>
    api.get<AnalyticsDashboard>('/analytics/dashboard', { params: { profile_id, period, language } }).then(r => r.data),
  leaderboard: (language?: string) => api.get<LeaderboardEntry[]>('/analytics/leaderboard', { params: { language } }).then(r => r.data),
  weaknesses: (profile_id: string, language?: string) =>
    api.get<{ analysis: string }>('/analytics/weaknesses', { params: { profile_id, language } }).then(r => r.data),
}

// ── LLM ───────────────────────────────────────────────────────────────────
export const llmApi = {
  providers: (profile_id: string) =>
    api.get<ProviderStatus[]>('/llm/providers', { params: { profile_id } }).then(r => r.data),
  ollamaModels: (base_url?: string) =>
    api.get<{ available: boolean; models: string[] }>('/llm/models/ollama', { params: { base_url } }).then(r => r.data),
  lmstudioModels: (base_url?: string) =>
    api.get<{ available: boolean; models: string[]; error?: string }>('/llm/models/lmstudio', { params: { base_url } }).then(r => r.data),
  chat: (profile_id: string, message: string, language = 'sql') =>
    api.post<{ response: string; weakness_context: string }>('/llm/chat', { profile_id, message, language }).then(r => r.data),
  getHint: (problem_id: string, profile_id: string, hint_index: number) =>
    api.post<{ hint: string; hint_index: number; total_hints: number; has_more: boolean }>(
      `/llm/hints/${problem_id}`, { profile_id, hint_index }
    ).then(r => r.data),
}

// ── Settings ───────────────────────────────────────────────────────────────
export const settingsApi = {
  getApp: (profile_id: string) =>
    api.get<AppSettings>('/settings', { params: { profile_id } }).then(r => r.data),
  updateApp: (profile_id: string, data: Partial<AppSettings>) =>
    api.put<AppSettings>('/settings', data, { params: { profile_id } }).then(r => r.data),
  getLLM: (profile_id: string) =>
    api.get<LLMSettings>('/settings/llm', { params: { profile_id } }).then(r => r.data),
  updateLLM: (profile_id: string, data: Partial<LLMSettings>) =>
    api.put('/settings/llm', data, { params: { profile_id } }).then(r => r.data),
  testConnection: (provider: string, api_key?: string, base_url?: string) =>
    api.post<{ available: boolean; models?: string[]; error?: string }>(
      '/settings/test-connection', { provider, api_key, base_url }
    ).then(r => r.data),
}

// ── Datasets ───────────────────────────────────────────────────────────────
export const datasetsApi = {
  bundled: () => api.get<Dataset[]>('/datasets/bundled').then(r => r.data),
  getBundled: (name: string) => api.get<Dataset & { schema_sql: string; sample_data_sql: string }>(`/datasets/bundled/${name}`).then(r => r.data),
  searchKaggle: (q: string, profile_id: string) =>
    api.get<{ ref: string; title: string; subtitle: string }[]>('/datasets/kaggle/search', { params: { q, profile_id } }).then(r => r.data),
  upload: (file: File, table_name?: string) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/datasets/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: table_name ? { table_name } : {},
    }).then(r => r.data)
  },
}

// ── Export ─────────────────────────────────────────────────────────────────
export const exportApi = {
  markdown: (problem_id: string, profile_id?: string, submission_id?: string) =>
    api.post(`/export/problem/${problem_id}/markdown`, null, {
      params: { profile_id, submission_id },
      responseType: 'blob',
    }).then(r => r.data as Blob),
  pdf: (problem_id: string, profile_id?: string, submission_id?: string) =>
    api.post(`/export/problem/${problem_id}/pdf`, null, {
      params: { profile_id, submission_id },
      responseType: 'blob',
    }).then(r => r.data as Blob),
}

export default api
