import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { useAppStore } from './store'
import App from './App'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

function ToasterWrapper() {
  const theme = useAppStore(s => s.theme)
  const isDark = theme === 'dark'
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3000,
        style: {
          background: isDark ? '#282828' : '#ffffff',
          color: isDark ? '#fff' : '#111827',
          border: `1px solid ${isDark ? '#3D3D3D' : '#e5e7eb'}`,
          fontSize: '14px',
        },
        success: { iconTheme: { primary: '#00B8A3', secondary: isDark ? '#1a1a1a' : '#ffffff' } },
        error: { iconTheme: { primary: '#FF375F', secondary: isDark ? '#1a1a1a' : '#ffffff' } },
      }}
    />
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <ToasterWrapper />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
