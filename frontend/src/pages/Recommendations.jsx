
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  Lightbulb,
  LogOut,
  RefreshCw,
  Settings as SettingsIcon,
} from 'lucide-react'

const API_URL = 'http://127.0.0.1:8000'

export default function Recommendations() {
  const navigate = useNavigate()
  const token = localStorage.getItem('focusflowToken')

  const [items, setItems] = useState([])
  const [status, setStatus] = useState('active')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const request = useCallback(async (path, options = {}) => {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body
          ? { 'Content-Type': 'application/json' }
          : {}),
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    })

    const data = await response.json().catch(() => ({}))

    if (response.status === 401) {
      localStorage.removeItem('focusflowToken')
      localStorage.removeItem('focusflowUser')
      navigate('/login', { replace: true })
      throw new Error('Your session expired. Please sign in again.')
    }

    if (!response.ok) {
      throw new Error(
        data.detail || data.message || 'Request failed.'
      )
    }

    return data
  }, [navigate, token])

  // Load recommendation history
  const loadItems = useCallback(async (selectedStatus = status) => {
    setLoading(true)
    setError('')

    try {
      const data = await request(
        `/api/recommendations?days=30&status=${selectedStatus}`
      )

      setItems(
        Array.isArray(data)
          ? data
          : data.recommendations || data.items || []
      )
    } catch (err) {
      setError(err.message || 'Could not load recommendations.')
    } finally {
      setLoading(false)
    }
  }, [request, status])

  // Generate new recommendations
  const generate = async () => {
    setGenerating(true)
    setError('')
    setNotice('')

    try {
      const data = await request('/api/recommendations/generate', {
        method: 'POST',
        body: JSON.stringify({ force: false }),
      })

      setNotice(data.message || 'Recommendations generated.')
      await loadItems(status)
    } catch (err) {
      setError(err.message || 'Could not generate recommendations.')
    } finally {
      setGenerating(false)
    }
  }

  // Complete, save, or dismiss a recommendation
  const updateAction = async (id, action) => {
    setError('')
    setNotice('')

    try {
      await request(
        `/api/recommendations/${id}/action`,
        {
          method: 'PATCH',
          body: JSON.stringify({ action }),
        }
      )

      const actionMessage = {
        complete: 'completed',
        save: 'saved',
        dismiss: 'dismissed',
      }

      setNotice(
        `Recommendation ${actionMessage[action] || 'updated'}.`
      )

      await loadItems(status)
    } catch (err) {
      setError(err.message || 'Could not update recommendation.')
    }
  }

  // Authentication and initial loading
  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true })
      return
    }

    loadItems(status)
  }, [token, navigate, status, loadItems])

  const signOut = () => {
    localStorage.removeItem('focusflowToken')
    localStorage.removeItem('focusflowUser')
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">

          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-orange-500 p-2 text-white">
              <Brain size={22} />
            </span>

            <div>
              <p className="font-bold">FocusFlow</p>
              <p className="text-xs text-slate-400">
                Recommendations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
            >
              <ArrowLeft size={16} />
              Dashboard
            </button>

            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
              title="Settings"
            >
              <SettingsIcon size={18} />
            </button>

            <button
              type="button"
              onClick={signOut}
              className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
              title="Sign out"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-7xl px-5 py-8 md:px-7 md:py-10">

        {/* Page heading */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-orange-600">
              FOCUSFLOW ASSISTANT
            </p>

            <h1 className="mt-2 text-3xl font-bold md:text-4xl">
              Your recommendations
            </h1>

            <p className="mt-2 text-slate-500">
              Practical suggestions based on your focus sessions
              and browsing activity.
            </p>
          </div>

          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            <RefreshCw
              size={17}
              className={generating ? 'animate-spin' : ''}
            />

            {generating
              ? 'Generating...'
              : 'Generate recommendations'}
          </button>
        </div>

        {/* Status filters */}
        <div className="mb-6 flex flex-wrap gap-2">
          {[
            ['active', 'Active'],
            ['saved', 'Saved'],
            ['completed', 'Completed'],
            ['dismissed', 'Dismissed'],
            ['all', 'All'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                status === value
                  ? 'bg-orange-500 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Messages */}
        {error && (
          <div
            role="alert"
            className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="mb-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700"
          >
            {notice}
          </div>
        )}

        {/* Recommendation list */}
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            Loading recommendations...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white px-5 py-14 text-center">
            <Lightbulb
              size={34}
              className="mx-auto text-slate-300"
            />

            <h2 className="mt-4 text-lg font-semibold">
              No recommendations found
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              Try generating recommendations or selecting another status.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2">
            {items.map((item) => (
              <RecommendationItem
                key={item.recommendation_id}
                item={item}
                onAction={updateAction}
              />
            ))}
          </div>
        )}

        <p className="mt-8 text-xs leading-5 text-slate-400">
          Rule-based recommendations are primary. Machine-learning
          insights are experimental and use models trained on
          synthetic data.
        </p>
      </main>
    </div>
  )
}

// Individual recommendation card
function RecommendationItem({ item, onAction }) {
  const priorityStyles = {
    high: 'bg-rose-50 text-rose-700',
    medium: 'bg-amber-50 text-amber-700',
    low: 'bg-emerald-50 text-emerald-700',
  }

  const statusStyles = {
    active: 'bg-orange-50 text-orange-700',
    saved: 'bg-blue-50 text-blue-700',
    completed: 'bg-emerald-50 text-emerald-700',
    dismissed: 'bg-slate-100 text-slate-600',
  }

  const date = item.created_at
    ? new Date(item.created_at).toLocaleString('en-IN')
    : item.date || ''

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 md:p-6">

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
            priorityStyles[item.priority] ||
            'bg-slate-100 text-slate-600'
          }`}
        >
          {item.priority || 'normal'} priority
        </span>

        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
            statusStyles[item.status] ||
            'bg-slate-100 text-slate-600'
          }`}
        >
          {item.status || 'unknown'}
        </span>

        <span className="ml-auto text-xs text-slate-400">
          {date}
        </span>
      </div>

      <h2 className="mt-4 text-lg font-bold text-slate-800">
        {item.title}
      </h2>

      <p className="mt-2 text-sm leading-6 text-slate-600">
        {item.message}
      </p>

      {item.action_text && (
        <p className="mt-3 text-sm font-semibold text-orange-600">
          Suggested action: {item.action_text}
        </p>
      )}

      {item.source === 'experimental_ml' && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">
          Experimental ML insight. This estimate is not a
          validated assessment.
        </p>
      )}

      {/* Actions for active recommendations */}
      {item.status === 'active' && (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() =>
              onAction(item.recommendation_id, 'complete')
            }
            className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600"
          >
            <CheckCircle2 size={14} />
            Complete
          </button>

          <button
            type="button"
            onClick={() =>
              onAction(item.recommendation_id, 'save')
            }
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Save for later
          </button>

          <button
            type="button"
            onClick={() =>
              onAction(item.recommendation_id, 'dismiss')
            }
            className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-50 hover:text-slate-700"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Actions for saved recommendations */}
      {item.status === 'saved' && (
        <div className="mt-5 flex gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() =>
              onAction(item.recommendation_id, 'complete')
            }
            className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600"
          >
            Mark complete
          </button>

          <button
            type="button"
            onClick={() =>
              onAction(item.recommendation_id, 'dismiss')
            }
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            Dismiss
          </button>
        </div>
      )}
    </article>
  )
}
