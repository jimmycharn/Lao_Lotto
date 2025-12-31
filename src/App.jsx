import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Login from './pages/Login'
import Register from './pages/Register'
import BuyLottery from './pages/BuyLottery'
import Results from './pages/Results'
import History from './pages/History'
import Dealer from './pages/Dealer'
import Admin from './pages/Admin'
import './index.css'

// Protected Route Component
function ProtectedRoute({ children, requireAuth = false, requireDealer = false, requireAdmin = false }) {
  const { user, loading, isDealer, isSuperAdmin } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>กำลังโหลด...</p>
      </div>
    )
  }

  if (requireAuth && !user) {
    return <Navigate to="/login" replace />
  }

  if (requireDealer && !isDealer && !isSuperAdmin) {
    return <Navigate to="/" replace />
  }

  if (requireAdmin && !isSuperAdmin) {
    return <Navigate to="/" replace />
  }

  return children
}

function AppContent() {
  return (
    <Router>
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/results" element={<Results />} />
          <Route
            path="/buy"
            element={
              <ProtectedRoute requireAuth>
                <BuyLottery />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute requireAuth>
                <History />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dealer"
            element={
              <ProtectedRoute requireAuth requireDealer>
                <Dealer />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute requireAuth requireAdmin>
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </Router>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
