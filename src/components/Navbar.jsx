import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
    FiMenu,
    FiX,
    FiHome,
    FiEdit,
    FiList,
    FiClock,
    FiUser,
    FiLogOut,
    FiUsers,
    FiSettings,
    FiGift,
    FiSend
} from 'react-icons/fi'
import './Navbar.css'

export default function Navbar() {
    const [isOpen, setIsOpen] = useState(false)
    const { user, profile, signOut, isSuperAdmin, isDealer } = useAuth()
    const navigate = useNavigate()
    const location = useLocation()

    const handleSignOut = async () => {
        await signOut()
        navigate('/')
        setIsOpen(false)
    }

    // Check if user has a dealer
    const hasDealer = profile?.dealer_id

    const navLinks = [
        { path: '/', label: 'หน้าแรก', icon: <FiHome />, hideForDealer: true, hideForSuperAdmin: true },
        { path: '/dashboard', label: 'ส่งเลข', icon: <FiSend />, requireAuth: true, requireDealer: true, hideForDealer: true, hideForSuperAdmin: true },
        { path: '/buy', label: 'ซื้อหวย', icon: <FiEdit />, requireAuth: true, hide: hasDealer, hideForDealer: true, hideForSuperAdmin: true },
        { path: '/profile', label: 'โปรไฟล์', icon: <FiUser />, requireAuth: true, hideForDealer: true, hideForSuperAdmin: true },
    ]

    const adminLinks = [
        { path: '/dealer', label: 'จัดการโพย', icon: <FiUsers />, role: 'dealer' },
        { path: '/admin', label: 'แอดมิน', icon: <FiSettings />, role: 'superadmin' },
        { path: '/superadmin', label: 'Super Admin', icon: <FiSettings />, role: 'superadmin' },
    ]

    const isActive = (path) => location.pathname === path

    return (
        <>
            <nav className="navbar">
                <div className="container navbar-container">
                    {/* Logo */}
                    <Link to="/" className="navbar-logo">
                        <FiGift className="logo-icon" />
                        <span className="logo-text">
                            <span className="logo-lao">ลาว</span>
                            <span className="logo-lotto">หวย</span>
                        </span>
                    </Link>

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
                                <div className="user-info">
                                    <FiUser />
                                    <span>{profile?.full_name || user.email}</span>
                                    {profile?.role && (
                                        <span className={`role-badge role-${profile.role}`}>
                                            {profile.role === 'superadmin' ? 'Admin' :
                                                profile.role === 'dealer' ? 'เจ้ามือ' : 'สมาชิก'}
                                        </span>
                                    )}
                                </div>
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
                                <Link to="/register" className="btn btn-primary btn-sm">
                                    สมัครสมาชิก
                                </Link>
                            </div>
                        )}
                    </div>

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
                                <Link
                                    to="/register"
                                    className="btn btn-primary mobile-auth-btn"
                                    onClick={() => setIsOpen(false)}
                                >
                                    สมัครสมาชิก
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </>
    )
}
