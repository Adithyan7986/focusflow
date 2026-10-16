
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  UserRound,
  Target,
  Save,
  LoaderCircle,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const API_URL = "http://127.0.0.1:8000";

export default function Settings() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dailyGoal, setDailyGoal] = useState(120);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const token = localStorage.getItem("focusflowToken");

      if (!token) {
        navigate("/login");
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/profile`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.status === 401) {
          localStorage.removeItem("focusflowToken");
          localStorage.removeItem("focusflowUser");
          navigate("/login");
          return;
        }

        if (!response.ok) {
          throw new Error("Could not load your profile.");
        }

        const profile = await response.json();

        setName(profile.name || "");
        setEmail(profile.email || "");
        setDailyGoal(profile.daily_goal_minutes ?? 120);
      } catch (err) {
        setError(
          err.message ||
            "Unable to connect to FocusFlow. Check that the backend is running."
        );
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [navigate]);

  async function saveProfile(event) {
    event.preventDefault();
    setMessage("");
    setError("");

    const token = localStorage.getItem("focusflowToken");

    if (!token) {
      navigate("/login");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(`${API_URL}/api/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          daily_goal_minutes: Number(dailyGoal),
        }),
      });

      const result = await response.json();

      if (response.status === 401) {
        localStorage.removeItem("focusflowToken");
        localStorage.removeItem("focusflowUser");
        navigate("/login");
        return;
      }

      if (!response.ok) {
        throw new Error(
          result.detail || "Unable to save your settings."
        );
      }

      const profile = result.profile;

      setName(profile.name);
      setEmail(profile.email);
      setDailyGoal(profile.daily_goal_minutes);

      localStorage.setItem(
        "focusflowUser",
        JSON.stringify({
          id: profile.id,
          name: profile.name,
          email: profile.email,
        })
      );

      setMessage("Your profile and daily goal have been saved.");
    } catch (err) {
      setError(
        err.message ||
          "Unable to connect to FocusFlow. Check that the backend is running."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center gap-3">
        <LoaderCircle className="animate-spin" />
        Loading your settings...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-5 sm:p-8">
      <div className="max-w-3xl mx-auto">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-8"
        >
          <ArrowLeft size={18} />
          Back
        </button>

        <div className="mb-8">
          <p className="text-sm text-orange-400 font-medium mb-2">
            ACCOUNT PREFERENCES
          </p>
          <h1 className="text-3xl font-bold">Profile & Settings</h1>
          <p className="text-slate-400 mt-2">
            Manage your profile and daily focus target.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 mb-5 text-red-300">
            <AlertCircle size={20} className="shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {message && (
          <div className="flex items-start gap-2 rounded-xl border border-green-500/30 bg-green-500/10 p-4 mb-5 text-green-300">
            <CheckCircle2 size={20} className="shrink-0 mt-0.5" />
            <p>{message}</p>
          </div>
        )}

        <form onSubmit={saveProfile} className="space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-xl bg-orange-500/10 text-orange-400">
                <UserRound size={22} />
              </div>
              <div>
                <h2 className="font-semibold text-lg">Personal information</h2>
                <p className="text-sm text-slate-400">
                  Your FocusFlow account details.
                </p>
              </div>
            </div>

            <label className="block text-sm text-slate-300 mb-2">
              Full name
            </label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={100}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-orange-500"
              placeholder="Enter your name"
            />

            <label className="block text-sm text-slate-300 mt-5 mb-2">
              Email address
            </label>
            <input
              value={email}
              readOnly
              className="w-full rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-slate-400 cursor-not-allowed"
            />
            <p className="text-xs text-slate-500 mt-2">
              Your email is read-only in this version.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 rounded-xl bg-orange-500/10 text-orange-400">
                <Target size={22} />
              </div>
              <div>
                <h2 className="font-semibold text-lg">Daily focus goal</h2>
                <p className="text-sm text-slate-400">
                  Set your target for total daily focus time.
                </p>
              </div>
            </div>

            <label className="block text-sm text-slate-300 mb-2">
              Goal in minutes
            </label>
            <input
              type="number"
              min="15"
              max="720"
              step="15"
              required
              value={dailyGoal}
              onChange={(event) => setDailyGoal(event.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-orange-500"
            />

            <div className="flex flex-wrap gap-2 mt-4">
              {[60, 120, 180, 240].map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  onClick={() => setDailyGoal(minutes)}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    Number(dailyGoal) === minutes
                      ? "border-orange-500 bg-orange-500/10 text-orange-300"
                      : "border-slate-700 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  {minutes >= 60
                    ? `${minutes / 60}h`
                    : `${minutes} min`}
                </button>
              ))}
            </div>

            <p className="text-sm text-slate-400 mt-4">
              Your target:{" "}
              <span className="text-orange-400 font-semibold">
                {Math.floor((Number(dailyGoal) || 0) / 60)}h{" "}
                {(Number(dailyGoal) || 0) % 60}m
              </span>{" "}
              per day.
            </p>
            <p className="text-xs text-slate-500 mt-2">
              Choose a goal between 15 minutes and 12 hours.
            </p>
          </section>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving || !name.trim() || Number(dailyGoal) < 15 || Number(dailyGoal) > 720}
              className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? (
                <LoaderCircle size={18} className="animate-spin" />
              ) : (
                <Save size={18} />
              )}
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
