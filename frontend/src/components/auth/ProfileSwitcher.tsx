import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Plus, UserCircle } from 'lucide-react'
import { profilesApi } from '@/utils/api'
import { useAppStore } from '@/store'
import toast from 'react-hot-toast'
import type { Profile } from '@/types'

const AVATAR_COLORS = [
  '#FFA116', '#00B8A3', '#FF375F', '#6366F1',
  '#EC4899', '#F59E0B', '#10B981', '#3B82F6',
]

function Avatar({ profile, size = 28 }: { profile: Profile; size?: number }) {
  return (
    <div
      className="rounded-full flex items-center justify-center text-black font-bold shrink-0"
      style={{ width: size, height: size, background: profile.avatar_color, fontSize: size * 0.42 }}
    >
      {profile.username[0].toUpperCase()}
    </div>
  )
}

export default function ProfileSwitcher() {
  const [open, setOpen] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newColor, setNewColor] = useState(AVATAR_COLORS[0])
  const qc = useQueryClient()
  const { activeProfile, setActiveProfile } = useAppStore()

  const { data: profiles = [] } = useQuery({ queryKey: ['profiles'], queryFn: profilesApi.list })

  const activateMutation = useMutation({
    mutationFn: profilesApi.activate,
    onSuccess: (profile) => {
      setActiveProfile(profile)
      qc.invalidateQueries({ queryKey: ['profiles'] })
      setOpen(false)
      toast.success(`Switched to ${profile.username}`)
    },
  })

  const createMutation = useMutation({
    mutationFn: ({ username, color }: { username: string; color: string }) =>
      profilesApi.create(username, color),
    onSuccess: (profile) => {
      qc.invalidateQueries({ queryKey: ['profiles'] })
      setShowCreate(false)
      setNewUsername('')
      toast.success(`Profile "${profile.username}" created`)
    },
    onError: (e: any) => toast.error(e.response?.data?.detail || 'Failed to create profile'),
  })

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-dark-hover transition-colors text-sm"
      >
        {activeProfile ? (
          <>
            <Avatar profile={activeProfile} size={24} />
            <span className="text-gray-300 max-w-[80px] truncate">{activeProfile.username}</span>
          </>
        ) : (
          <UserCircle size={22} className="text-gray-400" />
        )}
        <ChevronDown size={14} className="text-gray-500" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-56 bg-dark-panel border border-dark-border rounded-xl shadow-2xl py-1 overflow-hidden">
            {profiles.map(profile => (
              <button
                key={profile.id}
                onClick={() => activateMutation.mutate(profile.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                  activeProfile?.id === profile.id
                    ? 'bg-primary/10 text-primary'
                    : 'text-gray-300 hover:bg-dark-hover'
                }`}
              >
                <Avatar profile={profile} size={26} />
                <span className="flex-1 text-left truncate">{profile.username}</span>
                {activeProfile?.id === profile.id && (
                  <div className="w-2 h-2 rounded-full bg-primary" />
                )}
              </button>
            ))}
            <div className="my-1 border-t border-dark-border" />
            {!showCreate ? (
              <button
                onClick={() => setShowCreate(true)}
                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-gray-400 hover:text-gray-100 hover:bg-dark-hover transition-colors"
              >
                <Plus size={16} />
                Add Profile
              </button>
            ) : (
              <div className="px-3 py-2 space-y-2">
                <input
                  autoFocus
                  className="input text-xs py-1.5"
                  placeholder="Username"
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && newUsername.trim() && createMutation.mutate({ username: newUsername.trim(), color: newColor })}
                />
                <div className="flex gap-1.5 flex-wrap">
                  {AVATAR_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setNewColor(c)}
                      className={`w-5 h-5 rounded-full transition-transform ${newColor === c ? 'scale-125 ring-2 ring-white/50' : ''}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => newUsername.trim() && createMutation.mutate({ username: newUsername.trim(), color: newColor })}
                    className="flex-1 btn-primary py-1 text-xs"
                    disabled={!newUsername.trim() || createMutation.isPending}
                  >
                    Create
                  </button>
                  <button onClick={() => setShowCreate(false)} className="btn-ghost text-xs py-1">
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
