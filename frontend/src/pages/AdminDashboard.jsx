import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Users, Timer, Activity, CheckCircle2, RefreshCw,
  ShieldAlert, LoaderCircle,
} from "lucide-react";

const API_URL = "http://127.0.0.1:8000";

function formatDuration(seconds = 0) {
  const total = Math.max(0, Number(seconds) || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const request = useCallback(async (path) => {
    const token = localStorage.getItem("focusflowToken");
    if (!token) {
      navigate("/login", { replace: true });
      throw new Error("Please sign in.");
    }
    const response = await fetch(`${API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      localStorage.removeItem("focusflowToken");
      localStorage.removeItem("focusflowUser");
      navigate("/login", { replace: true });
      throw new Error("Your session expired. Please sign in again.");
    }
    if (response.status === 403) {
      navigate("/", { replace: true });
      throw new Error("Administrator access required.");
    }
    if (!response.ok) throw new Error(data.detail || "Unable to load admin data.");
    return data;
  }, [navigate]);

  const loadDashboard = useCallback(async (showRefresh = false) => {
    showRefresh ? setRefreshing(true) : setLoading(true);
    setError("");
    try {
      const [stats, userData, sessionData, activityData] = await Promise.all([
        request("/api/admin/overview"),
        request("/api/admin/users?limit=100"),
        request("/api/admin/sessions?limit=100"),
        request("/api/admin/activity?days=7&limit=100"),
      ]);
      setOverview(stats);
      setUsers(userData.users || []);
      setSessions(sessionData.sessions || []);
      setActivity(activityData.activity || []);
    } catch (err) {
      setError(err.message || "Unable to load the Admin Dashboard.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [request]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center gap-3 text-slate-600"><LoaderCircle className="animate-spin" /> Loading Admin Dashboard...</div>;
  }

  const stats = [
    { label: "Registered users", value: overview?.total_users ?? 0, note: `${overview?.recent_users_7_days ?? 0} joined in the last 7 days`, icon: Users },
    { label: "Focus sessions", value: overview?.total_sessions ?? 0, note: `${overview?.completed_sessions ?? 0} completed`, icon: Timer },
    { label: "Active sessions", value: overview?.active_sessions ?? 0, note: `${overview?.recent_sessions_7_days ?? 0} started in the last 7 days`, icon: CheckCircle2 },
    { label: "Tracked activity", value: formatDuration(overview?.tracked_activity_seconds), note: "Total recorded website activity", icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-orange-500 p-2 text-white"><ShieldAlert size={22} /></div>
            <div><h1 className="font-bold">Admin Dashboard</h1><p className="text-xs text-slate-400">FocusFlow platform overview</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => loadDashboard(true)} disabled={refreshing} className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50" title="Refresh"><RefreshCw size={18} className={refreshing ? "animate-spin" : ""} /></button>
            <button onClick={() => navigate("/settings")} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50"><ArrowLeft size={16} /> Settings</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8">
        {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        <div className="mb-7"><p className="text-sm font-semibold text-orange-600">ADMINISTRATION</p><h2 className="mt-1 text-3xl font-bold">Platform overview</h2><p className="mt-2 text-slate-500">Monitor registered accounts, focus sessions and aggregated website activity.</p></div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {stats.map(({ label, value, note, icon: Icon }) => (
            <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between"><p className="text-sm text-slate-500">{label}</p><span className="rounded-xl bg-orange-50 p-2 text-orange-600"><Icon size={19} /></span></div>
              <p className="mt-4 text-3xl font-bold">{value}</p><p className="mt-2 text-xs text-slate-400">{note}</p>
            </article>
          ))}
        </section>

        <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between"><div><h3 className="text-lg font-bold">Registered users</h3><p className="text-sm text-slate-500">{users.length} users shown (maximum 100)</p></div></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="border-b border-slate-100 text-xs uppercase text-slate-400"><tr><th className="py-3 pr-4">Name</th><th className="py-3 pr-4">Email</th><th className="py-3 pr-4">Role</th><th className="py-3 pr-4">Daily goal</th><th className="py-3">Joined</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => <tr key={user.user_id}><td className="py-3 pr-4 font-medium">{user.name}</td><td className="py-3 pr-4 text-slate-500">{user.email}</td><td className="py-3 pr-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${user.role === "admin" ? "bg-orange-50 text-orange-700" : "bg-slate-100 text-slate-600"}`}>{user.role || "user"}</span></td><td className="py-3 pr-4">{user.daily_goal_minutes ?? 120} min</td><td className="py-3 text-slate-500">{user.created_at ? new Date(user.created_at).toLocaleDateString("en-IN") : "—"}</td></tr>)}
                {!users.length && <tr><td colSpan="5" className="py-8 text-center text-slate-400">No users found.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-7 grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-lg font-bold">Recent focus sessions</h3><p className="mb-4 text-sm text-slate-500">Latest 100 sessions across users</p>
            <div className="space-y-3">
              {sessions.slice(0, 12).map((session) => <div key={session.session_id} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 text-sm"><div className="min-w-0"><p className="truncate font-medium">{session.user?.name || session.user?.email || "Unknown user"}</p><p className="text-xs text-slate-400">{session.created_at ? new Date(session.created_at).toLocaleString("en-IN") : "Date unavailable"}</p></div><div className="shrink-0 text-right"><p className="font-semibold">{formatDuration(session.total_seconds)}</p><p className="text-xs capitalize text-slate-400">{session.status}</p></div></div>)}
              {!sessions.length && <p className="py-6 text-center text-sm text-slate-400">No focus sessions found.</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-lg font-bold">Website activity</h3><p className="mb-4 text-sm text-slate-500">Aggregated activity by user and category · last 7 days</p>
            <div className="space-y-3">
              {activity.slice(0, 15).map((item, index) => <div key={`${item.user_id}-${item.date}-${item.category}-${index}`} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 text-sm"><div className="min-w-0"><p className="truncate font-medium">{item.user?.name || item.user?.email || "Unknown user"}</p><p className="text-xs capitalize text-slate-400">{item.date} · {item.category}</p></div><p className="shrink-0 font-semibold">{formatDuration(item.seconds)}</p></div>)}
              {!activity.length && <p className="py-6 text-center text-sm text-slate-400">No website activity found for this period.</p>}
            </div>
          </div>
        </section>
        <p className="mt-6 text-xs leading-5 text-slate-400">Admin data is read-only in this version. Password hashes and private authentication fields are never returned by these endpoints.</p>
      </main>
    </div>
  );
}
