
import { useState } from 'react'
import {
  Brain,
  Eye,
  EyeOff,
  ArrowRight,
} from 'lucide-react'
import {
  Link,
  useNavigate,
} from 'react-router-dom'

export default function Register() {
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const navigate = useNavigate()

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch(
        'http://127.0.0.1:8000/api/auth/register',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(form),
        }
      )

      const data = await response.json()

      if (!response.ok) {
  throw new Error(
    data.detail || data.message || 'Registration failed'
  )
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
        <section className="bg-slate-950 text-white p-10 md:p-14 flex flex-col justify-between min-h-[550px]">

          <Link to="/login" className="flex items-center gap-3 w-fit">
            <div className="bg-orange-500 p-2 rounded-xl">
              <Brain size={25} />
            </div>

            <span className="text-xl font-bold">
              FocusFlow
            </span>
          </Link>

          <div className="my-10">
            <p className="text-orange-400 text-sm font-semibold uppercase tracking-widest">
              Build better habits
            </p>

            <h1 className="text-4xl md:text-5xl font-bold leading-tight mt-5">
              Your focus journey starts here.
            </h1>

            <p className="text-slate-300 leading-7 mt-5">
              Create your account and start making every
              focused minute count.
            </p>

            <div className="mt-8 flex items-center gap-3 text-sm text-slate-300">
              <span className="w-2 h-2 rounded-full bg-orange-400" />
              A better way to manage your attention
            </div>
          </div>

          <p className="text-xs text-slate-500">
            AI-Powered Digital Attention Management
          </p>
        </section>

        {/* Right registration form */}
        <section className="p-8 md:p-14 flex flex-col justify-center">

          <div className="mb-8">
            <p className="text-orange-600 font-semibold text-sm">
              GET STARTED
            </p>

            <h2 className="text-3xl font-bold text-slate-900 mt-2">
              Create account
            </h2>

            <p className="text-gray-500 mt-2">
              Enter your details to get started.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Full name */}
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-slate-700 mb-2"
              >
                Full name
              </label>

              <input
                id="name"
                type="text"
                name="name"
                autoComplete="name"
                value={form.name}
                onChange={handleChange}
                required
                maxLength={100}
                placeholder="Your name"
                className="w-full rounded-xl border border-gray-200 px-4 py-3.5 outline-none transition focus:border-orange-500 focus:ring-4 focus:ring-orange-100"
              />
            </div>

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
                name="email"
                autoComplete="email"
                value={form.email}
                onChange={handleChange}
                required
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
                  name="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={handleChange}
                  required
                  minLength={6}
                  placeholder="At least 6 characters"
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

              <p className="text-xs text-gray-400 mt-2">
                Use at least 6 characters.
              </p>
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
              {loading ? 'Creating account...' : 'Create account'}

              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          {/* Login link */}
          <p className="text-sm text-center text-gray-500 mt-7">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-orange-600 font-semibold hover:text-orange-700"
            >
              Sign in
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
