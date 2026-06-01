import { Sun, Moon } from 'lucide-react'
import { useAppStore } from '@/store'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useAppStore()
  return (
    <button
      onClick={toggleTheme}
      className="p-1.5 rounded-md text-gray-400 hover:text-gray-100 hover:bg-dark-hover transition-colors"
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
