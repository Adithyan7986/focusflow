import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Register from './pages/Register'
import Home from './pages/Home'
import Settings from './pages/Settings'
import Recommendations from './pages/Recommendations'
import HabitTracking from './pages/HabitTracking'
import WeeklyFocus from './pages/WeeklyFocus'
import AdminDashboard from './pages/AdminDashboard'

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/recommendations" element={<Recommendations />} />
        <Route path="/habits" element={<HabitTracking />} />
        <Route path="/weekly-focus" element={<WeeklyFocus />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}

export default App
