import type { PracticeLanguage } from '@/types'

export function isPythonTrack(language?: PracticeLanguage | string | null): boolean {
  return language === 'python'
}

export function trackLabel(language?: PracticeLanguage | string | null): string {
  return isPythonTrack(language) ? 'Python' : 'SQL'
}

export function defaultEditorContent(language: PracticeLanguage): string {
  return isPythonTrack(language)
    ? '# Write your Python solution here\n'
    : '-- Write your SQL query here\n'
}
