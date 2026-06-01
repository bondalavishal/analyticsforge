import { Database, Code2 } from 'lucide-react'
import { useAppStore } from '@/store'
import type { PracticeLanguage } from '@/types'

export default function LanguageModeSwitch() {
  const { practiceLanguage, setPracticeLanguage } = useAppStore()

  const modes: { id: PracticeLanguage; label: string; icon: typeof Database }[] = [
    { id: 'sql', label: 'SQL', icon: Database },
    { id: 'python', label: 'Python', icon: Code2 },
  ]

  return (
    <div className="flex items-center rounded-lg border border-dark-border bg-dark-card p-0.5 gap-0.5">
      {modes.map(({ id, label, icon: Icon }) => {
        const active = practiceLanguage === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => setPracticeLanguage(id)}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
              active
                ? id === 'python'
                  ? 'bg-accent text-white shadow-sm shadow-accent/30'
                  : 'bg-accent text-black shadow-sm shadow-accent/30'
                : 'text-gray-400 hover:text-gray-200 hover:bg-dark-hover'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        )
      })}
    </div>
  )
}
