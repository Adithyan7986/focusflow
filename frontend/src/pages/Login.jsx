
import { useState } from 'react'
import {
  Eye,
  EyeOff,
  Brain,
  ArrowRight,
} from 'lucide-react'
import {
  Link,
  useNavigate,
} from 'react-router-dom'

export default function Login() {
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()

    setError('')
    setLoading(true)

    try {
      const response = await fetch(
        'http://127.0.0.1:8000/api/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            password,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
  throw new Error(data.detail || data.message || 'Login failed')
}

      localStorage.setItem('focusflowToken', data.token)
      localStorage.setItem(
        'focusflowUser',
        JSON.stringify(data.user)
      )

      navigate('/')
    } catch (err) {
      setError(
        err.message || 'Unable to connect to the server'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-5">
      <div className="w-full max-w-5xl grid md:grid-cols-2 overflow-hidden rounded-3xl border border-gray-100 shadow-xl">

        {/* Left welcome section */}
        <section className="bg-slate-950 text-white p-10 md:p-14 flex flex-col justify-between min-h-[520px]">

          <div className="flex items-center gap-3">
            <div className="bg-orange-500 p-2 rounded-xl">
              <Brain size={25} />
            </div>

            <span className="text-xl font-bold">
              FocusFlow
            </span>
          </div>

          <div className="my-12">
            <p className="text-orange-400 text-sm font-semibold uppercase tracking-widest">
              Take back your attention
            </p>

            <h1 className="text-4xl md:text-5xl font-bold leading-tight mt-5">
              Focus on what truly matters.
            </h1>

            <p className="text-slate-300 leading-7 mt-5">
              Understand your habits, reduce distractions,
              and build better focus one session at a time.
            </p>

            <div className="mt-8 flex items-center gap-3 text-sm text-slate-300">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              Your personal attention workspace
            </div>
          </div>

          <p className="text-xs text-slate-500">
            AI-Powered Digital Attention Management
          </p>
        </section>

        {/* Right login form */}
        <section className="p-8 md:p-14 flex flex-col justify-center">

          <div className="mb-8">
            <p className="text-orange-600 font-semibold text-sm">
              WELCOME BACK
            </p>

            <h2 className="text-3xl font-bold text-slate-900 mt-2">
              Sign in
            </h2>

            <p className="text-gray-500 mt-2">
              Enter your details to access your workspace.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-700 mb-2"
              >
                Email address
              </label>

              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-gray-200 px-4 py-3.5 outline-none transition focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700 mb-2"
              >
                Password
              </label>

              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3.5 pr-12 outline-none transition focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-slate-700"
                  aria-label={
                    showPassword
                      ? 'Hide password'
                      : 'Show password'
                  }
                >
                  {showPassword
                    ? <EyeOff size={19} />
                    : <Eye size={19} />
                  }
                </button>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <p
                role="alert"
                className="text-sm text-red-600 bg-red-50 rounded-lg p-3"
              >
                {error}
              </p>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-3.5 flex items-center justify-center gap-2 transition"
            >
              {loading ? 'Signing in...' : 'Sign in'}

              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          {/* Registration link */}
          <p className="text-sm text-center text-gray-500 mt-7">
            Don't have an account?{' '}
            <Link
              to="/register"
              className="text-orange-600 font-semibold hover:text-orange-700"
            >
              Create account
            </Link>
          </p>

          <p className="text-center text-xs text-gray-400 mt-8">
            Stay focused. Make every session count.
          </p>
        </section>
      </div>
    </main>
  )
}
