import { useQuery } from '@tanstack/react-query'
import { Loader2, Flame, Trophy } from 'lucide-react'
import { analyticsApi } from '@/utils/api'
import { useAppStore } from '@/store'
import { formatDistanceToNow } from 'date-fns'

const RANK_BADGES = ['🥇', '🥈', '🥉']

export default function LeaderboardPage() {
  const { activeProfile, practiceLanguage } = useAppStore()

  const { data: leaderboard = [], isLoading } = useQuery({
    queryKey: ['leaderboard', practiceLanguage],
    queryFn: () => analyticsApi.leaderboard(practiceLanguage),
  })

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Trophy size={24} className="text-primary" />
          <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <Trophy size={40} className="mx-auto mb-3 opacity-20" />
            <p>No profiles yet. Create a profile and start solving!</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Header */}
            <div className="grid grid-cols-[48px_1fr_80px_80px_80px_100px] gap-3 px-4 text-xs text-gray-500 font-medium uppercase tracking-wide">
              <span>Rank</span>
              <span>User</span>
              <span className="text-center">Solved</span>
              <span className="text-center">Streak</span>
              <span className="text-center">Accuracy</span>
              <span className="text-right">Last Active</span>
            </div>

            {leaderboard.map((entry) => {
              const isMe = entry.profile_id === activeProfile?.id
              const badge = RANK_BADGES[entry.rank - 1]

              return (
                <div
                  key={entry.profile_id}
                  className={`grid grid-cols-[48px_1fr_80px_80px_80px_100px] gap-3 items-center px-4 py-3.5 rounded-xl border transition-colors ${
                    isMe
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-dark-border bg-dark-panel hover:bg-dark-hover'
                  }`}
                >
                  {/* Rank */}
                  <div className="text-center">
                    {badge ? (
                      <span className="text-xl">{badge}</span>
                    ) : (
                      <span className="text-sm font-bold text-gray-400">#{entry.rank}</span>
                    )}
                  </div>

                  {/* User */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-black font-bold text-sm shrink-0"
                      style={{ background: entry.avatar_color }}
                    >
                      {entry.username[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-white truncate">{entry.username}</span>
                        {isMe && <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded font-medium">You</span>}
                      </div>
                    </div>
                  </div>

                  {/* Solved */}
                  <div className="text-center">
                    <span className="text-sm font-semibold text-white">{entry.problems_solved}</span>
                  </div>

                  {/* Streak */}
                  <div className="flex items-center justify-center gap-1">
                    <Flame size={13} className="text-orange-400" />
                    <span className="text-sm font-medium text-white">{entry.current_streak}</span>
                  </div>

                  {/* Accuracy */}
                  <div className="text-center">
                    <span className={`text-sm font-medium ${
                      entry.accuracy_rate >= 70 ? 'text-success' :
                      entry.accuracy_rate >= 40 ? 'text-yellow-400' : 'text-error'
                    }`}>
                      {entry.accuracy_rate}%
                    </span>
                  </div>

                  {/* Last active */}
                  <div className="text-right">
                    <span className="text-xs text-gray-500">
                      {entry.last_active
                        ? formatDistanceToNow(new Date(entry.last_active), { addSuffix: true })
                        : 'Never'
                      }
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
