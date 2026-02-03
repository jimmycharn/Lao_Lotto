import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import Navbar from './components/Navbar'
import './index.css'

// Lazy load pages - โหลดเฉพาะหน้าที่ใช้
const Home = lazy(() => import('./pages/Home'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const InvitationAccept = lazy(() => import('./pages/InvitationAccept'))
const DealerConnect = lazy(() => import('./pages/DealerConnect'))
const BuyLottery = lazy(() => import('./pages/BuyLottery'))
const Profile = lazy(() => import('./pages/Profile'))
const Dealer = lazy(() => import('./pages/Dealer'))
const Admin = lazy(() => import('./pages/Admin'))
const SuperAdmin = lazy(() => import('./pages/SuperAdmin'))
const UserDashboard = lazy(() => import('./pages/UserDashboard'))

// Loading component for Suspense
function PageLoader() {
  return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>กำลังโหลด...</p>
    </div>
  )
}

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

// Home Redirect Component - Redirects Super Admin/Dealer/User to their respective dashboards
function HomeRedirect() {
  const { user, profile, loading, isDealer, isSuperAdmin } = useAuth()

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>กำลังโหลด...</p>
      </div>
    )
  }

  // Redirect Super Admin to Super Admin dashboard
  if (user && isSuperAdmin) {
    return <Navigate to="/superadmin" replace />
  }

  // Redirect Dealer to Dealer dashboard
  if (user && isDealer) {
    return <Navigate to="/dealer" replace />
  }

  // Redirect logged-in regular users to user dashboard
  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  // Guests see the Home page
  return <Home />
}

function AppContent() {
  return (
    <Router>
      <Navbar />
      <main className="main-content">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/invite" element={<InvitationAccept />} />
            <Route path="/dealer-connect" element={<DealerConnect />} />
          <Route
            path="/profile"
            element={
              <ProtectedRoute requireAuth>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/buy"
            element={
              <ProtectedRoute requireAuth>
                <BuyLottery />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute requireAuth>
                <UserDashboard />
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
          <Route
            path="/superadmin"
            element={
              <ProtectedRoute requireAuth requireAdmin>
                <SuperAdmin />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
    </Router>
  )
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </AuthProvider>
  )
}

export default App
