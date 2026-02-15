import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme, THEMES, DASHBOARDS } from '../contexts/ThemeContext'
import {
    FiMenu,
    FiX,
    FiEdit,
    FiList,
    FiUser,
    FiLogOut,
    FiUsers,
    FiSettings,
    FiSun,
    FiMoon
} from 'react-icons/fi'
import './Navbar.css'

export default function Navbar() {
    const [isOpen, setIsOpen] = useState(false)
    const { user, profile, signOut, isSuperAdmin, isDealer } = useAuth()
    const { themes, toggleTheme, activeDashboard, setActiveDashboard } = useTheme()
    const navigate = useNavigate()
    const location = useLocation()

    // Sync activeDashboard when route changes (so theme toggle saves to correct key)
    useEffect(() => {
        const path = location.pathname
        let dashboard = DASHBOARDS.GLOBAL
        if (path.includes('/dealer')) dashboard = DASHBOARDS.DEALER
        else if (path.includes('/superadmin')) dashboard = DASHBOARDS.SUPERADMIN
        else if (path.includes('/user') || path.includes('/dashboard')) dashboard = DASHBOARDS.USER
        else if (path.includes('/admin')) dashboard = DASHBOARDS.ADMIN
        setActiveDashboard(dashboard)
    }, [location.pathname, setActiveDashboard])
    
    // Get current theme based on active dashboard or global
    const currentTheme = themes[activeDashboard] || themes[DASHBOARDS.GLOBAL] || THEMES.DARK
    const isDarkTheme = currentTheme === THEMES.DARK
    
    const handleThemeToggle = () => {
        toggleTheme(activeDashboard || DASHBOARDS.GLOBAL)
    }

    const handleSignOut = async () => {
        await signOut()
        navigate('/login')
        setIsOpen(false)
    }

    // Check if user has a dealer
    const hasDealer = profile?.dealer_id

    const navLinks = [
        { path: '/dashboard', label: 'ส่งเลข', icon: <FiEdit />, requireAuth: true, hideForDealer: true, hideForSuperAdmin: true },
        { path: '/profile', label: 'โปรไฟล์', icon: <FiUser />, requireAuth: true, hideForDealer: true, hideForSuperAdmin: true },
    ]

    const adminLinks = [
        { path: '/dealer', label: 'จัดการโพย', icon: <FiUsers />, role: 'dealer' },
        { path: '/dealer?tab=profile', label: 'โปรไฟล์', icon: <FiUser />, role: 'dealer' },
        { path: '/admin', label: 'แอดมิน', icon: <FiSettings />, role: 'superadmin' },
        { path: '/superadmin', label: 'Super Admin', icon: <FiSettings />, role: 'superadmin' },
    ]

    const isActive = (path) => location.pathname === path

    return (
        <>
            <nav className="navbar">
                <div className="container navbar-container">
                    {/* Logo with User Name and Role Badge */}
                    <div className="navbar-brand">
                        <Link to="/" className="navbar-logo">
                            <img src="/logo.png" alt="Big Lotto" className="logo-image" />
                            <span className="logo-text">
                                <span className="logo-lao">Big</span>
                                <span className="logo-lotto">Lotto</span>
                            </span>
                        </Link>
                        {user && (
                            <div className="brand-user-info">
                                <span className="brand-user-name">
                                    {profile?.full_name || user.email}
                                </span>
                                {profile?.role && (
                                    <span className={`brand-role-badge role-${profile.role}`}>
                                        {profile.role === 'superadmin' ? 'Admin' :
                                            profile.role === 'dealer' ? 'เจ้ามือ' : 'สมาชิก'}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Desktop Nav */}
                    <div className="navbar-links desktop-only">
                        {navLinks.map(link => {
                            // Check conditions
                            if (link.hide) return null
                            if (link.hideForDealer && isDealer) return null
                            if (link.hideForSuperAdmin && isSuperAdmin) return null
                            if (link.requireAuth && !user) return null
                            if (link.requireDealer && !hasDealer) return null

                            return (
                                <Link
                                    key={link.path}
                                    to={link.path}
                                    className={`nav-link ${isActive(link.path) ? 'active' : ''}`}
                                >
                                    {link.icon}
                                    <span>{link.label}</span>
                                </Link>
                            )
                        })}

                        {/* Admin/Dealer Links */}
                        {(isSuperAdmin || isDealer) && adminLinks.map(link => (
                            ((link.role === 'dealer' && isDealer) || (link.role === 'superadmin' && isSuperAdmin)) && (
                                <Link
                                    key={link.path}
                                    to={link.path}
                                    className={`nav-link admin-link ${isActive(link.path) ? 'active' : ''}`}
                                >
                                    {link.icon}
                                    <span>{link.label}</span>
                                </Link>
                            )
                        ))}
                    </div>

                    {/* Auth Buttons */}
                    <div className="navbar-auth desktop-only">
                        {user ? (
                            <div className="user-menu">
                                <button onClick={handleSignOut} className="btn btn-outline btn-sm">
                                    <FiLogOut />
                                    ออกจากระบบ
                                </button>
                            </div>
                        ) : (
                            <div className="auth-buttons">
                                <Link to="/login" className="btn btn-secondary btn-sm">
                                    เข้าสู่ระบบ
                                </Link>
                            </div>
                        )}
                    </div>

                    {/* Theme Toggle Button */}
                    <button
                        className="theme-toggle-btn"
                        onClick={handleThemeToggle}
                        aria-label="Toggle theme"
                        title={isDarkTheme ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด'}
                    >
                        {isDarkTheme ? <FiSun /> : <FiMoon />}
                    </button>

                    {/* Mobile Menu Button */}
                    <button
                        className="mobile-menu-btn"
                        onClick={() => setIsOpen(!isOpen)}
                        aria-label="Toggle menu"
                    >
                        {isOpen ? <FiX /> : <FiMenu />}
                    </button>
                </div>
            </nav>

            {/* Mobile Menu */}
            <div className={`mobile-menu ${isOpen ? 'open' : ''}`}>
                <div className="mobile-menu-content">
                    {navLinks.map(link => {
                        if (link.hide) return null
                        if (link.hideForDealer && isDealer) return null
                        if (link.hideForSuperAdmin && isSuperAdmin) return null
                        if (link.requireAuth && !user) return null
                        if (link.requireDealer && !hasDealer) return null

                        return (
                            <Link
                                key={link.path}
                                to={link.path}
                                className={`mobile-nav-link ${isActive(link.path) ? 'active' : ''}`}
                                onClick={() => setIsOpen(false)}
                            >
                                {link.icon}
                                <span>{link.label}</span>
                            </Link>
                        )
                    })}

                    {/* Admin/Dealer Links */}
                    {(isSuperAdmin || isDealer) && (
                        <div className="mobile-admin-section">
                            <div className="mobile-section-title">จัดการระบบ</div>
                            {adminLinks.map(link => (
                                ((link.role === 'dealer' && isDealer) || (link.role === 'superadmin' && isSuperAdmin)) && (
                                    <Link
                                        key={link.path}
                                        to={link.path}
                                        className={`mobile-nav-link admin-link ${isActive(link.path) ? 'active' : ''}`}
                                        onClick={() => setIsOpen(false)}
                                    >
                                        {link.icon}
                                        <span>{link.label}</span>
                                    </Link>
                                )
                            ))}
                        </div>
                    )}

                    <div className="mobile-auth">
                        {user ? (
                            <>
                                <div className="mobile-user-info">
                                    <FiUser />
                                    <span>{profile?.full_name || user.email}</span>
                                </div>
                                <button
                                    onClick={handleSignOut}
                                    className="btn btn-outline mobile-auth-btn"
                                >
                                    <FiLogOut />
                                    ออกจากระบบ
                                </button>
                            </>
                        ) : (
                            <>
                                <Link
                                    to="/login"
                                    className="btn btn-secondary mobile-auth-btn"
                                    onClick={() => setIsOpen(false)}
                                >
                                    เข้าสู่ระบบ
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}
