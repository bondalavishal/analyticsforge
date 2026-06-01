export type PracticeLanguage = 'sql' | 'python'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type Dialect = 'mysql' | 'postgresql' | 'sqlite'
export type SubmissionStatus = 'accepted' | 'wrong_answer' | 'error'
export type ProblemStatus = 'unsolved' | 'attempted' | 'solved'
export type GenerationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'
export type GenerationJobType = 'single' | 'batch' | 'adaptive'
export type LLMProvider = 'cerebras' | 'groq' | 'google' | 'openrouter' | 'ollama' | 'lmstudio'
export type Theme = 'dark' | 'light'

export interface Profile {
  id: string
  username: string
  avatar_color: string
  created_at: string
  last_active: string
  is_active: boolean
}

export interface TestCase {
  description?: string
  schema_sql?: string
  data_sql?: string
  expected_output: QueryResult
}

export interface EditorialApproach {
  approach_name: string
  explanation: string
  solution_sql?: string
  solution_python?: string
  time_complexity: string
  space_complexity: string
}

export interface PythonExpectedOutput {
  inputs?: Record<string, unknown>
  expected?: unknown
  compare_unordered?: boolean
}

export interface QueryResult {
  columns: string[]
  rows: (string | number | null)[][]
}

export interface Problem {
  id: string
  problem_number: number
  title: string
  description: string
  language: PracticeLanguage
  difficulty: Difficulty
  dialect: Dialect
  function_name?: string
  starter_code?: string
  topic_tags: string[]
  schema_sql: string
  sample_data_sql: string
  expected_output: QueryResult | PythonExpectedOutput
  hints: string[]
  editorial: EditorialApproach[]
  dataset_source: string
  dataset_name: string
  is_flagged: boolean
  created_at: string
  // User state
  user_status?: ProblemStatus
  is_bookmarked?: boolean
  user_difficulty_rating?: Difficulty | null
  personal_notes?: string
}

export interface Submission {
  id: string
  profile_id: string
  problem_id: string
  submitted_sql: string
  status: SubmissionStatus
  execution_time_ms: number
  test_cases_passed: number
  test_cases_total: number
  error_message: string
  wrong_answer_explanation: string
  submitted_at: string
  dialect_used: Dialect | 'python'
}

export interface SubmissionResult {
  submission_id: string
  status: SubmissionStatus
  test_cases_passed: number
  test_cases_total: number
  all_passed: boolean
  execution_time_ms: number
  error_message: string
  test_case_details: TestCaseDetail[]
}

export interface TestCaseDetail {
  test_case_index: number
  passed: boolean
  expected: QueryResult | { value?: unknown }
  actual: QueryResult | { value?: unknown }
  inputs?: Record<string, unknown>
  error: string | null
  execution_time_ms: number
}

export interface RunResult {
  success: boolean
  output?: unknown
  columns: string[]
  rows: (string | number | null)[][]
  row_count: number
  execution_time_ms: number
  error: string | null
}

export interface LLMSettings {
  id: string
  profile_id: string
  cerebras_api_key: string
  groq_api_key: string
  google_ai_api_key: string
  openrouter_api_key: string
  kaggle_username: string
  kaggle_key: string
  ollama_base_url: string
  lmstudio_base_url: string
  fallback_order: LLMProvider[]
  active_local_model_ollama: string
  active_local_model_lmstudio: string
  preferred_provider: LLMProvider
}

export interface AppSettings {
  id: string
  profile_id: string
  theme: Theme
  dialect: Dialect
  notification_time: string
  streak_reminder_enabled: boolean
  potd_enabled: boolean
  batch_generate_count: number
}

export interface StreakInfo {
  current_streak: number
  longest_streak: number
  last_activity_date: string | null
  total_days_active: number
}

export interface TopicStat {
  topic: string
  attempts: number
  correct: number
  rate: number
}

export interface AnalyticsDashboard {
  total_solved: number
  total_attempted: number
  total_submissions: number
  acceptance_rate: number
  avg_time_to_solve_minutes: number
  problems_by_difficulty: Record<Difficulty, number>
  attempted_by_difficulty: Record<Difficulty, number>
  accuracy_by_topic: Record<string, number>
  weak_topics: TopicStat[]
  strong_topics: TopicStat[]
  submission_heatmap: Record<string, number>
  improvement_over_time: { week: string; solved: number }[]
  streak_info: StreakInfo
}

export interface LeaderboardEntry {
  rank: number
  profile_id: string
  username: string
  avatar_color: string
  problems_solved: number
  current_streak: number
  accuracy_rate: number
  last_active: string | null
}

export interface Dataset {
  name: string
  description: string
  topic_tags: string[]
  tables?: { table_name: string; columns: { name: string; type: string }[] }[]
}

export interface GenerateOptions {
  profile_id: string
  language?: PracticeLanguage
  topic?: string
  difficulty?: Difficulty
  dialect: Dialect
  dataset_source: 'llm' | 'bundled' | 'kaggle' | 'uploaded'
  dataset_name?: string
  pinned_constraints?: string
  count: number
}

export interface GenerationJob {
  id: string
  profile_id: string
  job_type: GenerationJobType
  status: GenerationJobStatus
  progress_percent: number
  progress_message: string
  requested_count: number
  completed_count: number
  failed_count: number
  generated_problem_ids: string[]
  errors: string[]
  error_message: string
  telemetry_events: number
  telemetry: Array<Record<string, any>>
  created_at: string
  started_at?: string | null
  finished_at?: string | null
}

export interface ProviderStatus {
  name: LLMProvider
  available: boolean
  in_use?: boolean
  in_use_count?: number
  recently_used?: boolean
  recently_used_s?: number
  cooldown_remaining_s?: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export interface ChatSession {
  id: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
  preview: string  // first user message text
}

export interface QCTCDetail extends TestCaseDetail {
  description: string
}

export interface QCApproachResult {
  approach_name: string
  passed: number
  total: number
  all_passed: boolean
  details: QCTCDetail[]
}

export interface QCResult {
  problem_id: string
  title: string
  overall_ok: boolean
  approaches: QCApproachResult[]
}
