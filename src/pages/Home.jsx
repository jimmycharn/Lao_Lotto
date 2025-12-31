import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import LotteryCard from '../components/LotteryCard'
import { FiArrowRight, FiCalendar, FiAward, FiTrendingUp, FiGift } from 'react-icons/fi'
import './Home.css'

const LOTTERY_TYPES = [
    {
        type: '2 ตัว',
        digits: 2,
        title: 'หวย 2 ตัว',
        description: 'ทายเลข 2 หลัก',
        rate: 90
    },
    {
        type: '3 ตัว',
        digits: 3,
        title: 'หวย 3 ตัว',
        description: 'ทายเลข 3 หลัก',
        rate: 500
    },
    {
        type: '4 ตัว',
        digits: 4,
        title: 'หวย 4 ตัว',
        description: 'ทายเลข 4 หลัก',
        rate: 5000
    },
    {
        type: '6 ตัว',
        digits: 6,
        title: 'หวย 6 ตัว',
        description: 'ทายเลข 6 หลัก (รางวัลใหญ่)',
        rate: 100000
    }
]

export default function Home() {
    const { isAuthenticated } = useAuth()
    const [latestResult, setLatestResult] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchLatestResult()
    }, [])

    async function fetchLatestResult() {
        if (!supabase) {
            setLoading(false)
            return
        }

        try {
            const { data, error } = await supabase
                .from('lottery_draws')
                .select('*')
                .eq('is_published', true)
                .order('draw_date', { ascending: false })
                .limit(1)
                .single()

            if (!error) {
                setLatestResult(data)
            }
        } catch (error) {
            console.error('Error fetching latest result:', error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="home-page">
            {/* Hero Section */}
            <section className="hero">
                <div className="container">
                    <div className="hero-content animate-slideUp">
                        <div className="hero-badge">
                            <FiGift />
                            <span>หวยลาว ออนไลน์</span>
                        </div>
                        <h1 className="hero-title">
                            <span className="text-gold">โชคดี</span> รอคุณอยู่
                        </h1>
                        <p className="hero-description">
                            ซื้อหวยลาวออนไลน์ ง่าย สะดวก ปลอดภัย<br />
                            มีผลหวยทุกงวด จ่ายจริง จ่ายเร็ว
                        </p>
                        <div className="hero-actions">
                            {isAuthenticated ? (
                                <Link to="/buy" className="btn btn-primary btn-lg">
                                    ซื้อหวยเลย
                                    <FiArrowRight />
                                </Link>
                            ) : (
                                <>
                                    <Link to="/register" className="btn btn-primary btn-lg">
                                        สมัครสมาชิก
                                        <FiArrowRight />
                                    </Link>
                                    <Link to="/results" className="btn btn-secondary btn-lg">
                                        ดูผลหวย
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="hero-stats">
                        <div className="stat-card">
                            <FiTrendingUp className="stat-icon" />
                            <div className="stat-value">10K+</div>
                            <div className="stat-label">ผู้เล่น</div>
                        </div>
                        <div className="stat-card">
                            <FiAward className="stat-icon gold" />
                            <div className="stat-value">฿5M+</div>
                            <div className="stat-label">จ่ายรางวัลแล้ว</div>
                        </div>
                        <div className="stat-card">
                            <FiAward className="stat-icon" />
                            <div className="stat-value">100%</div>
                            <div className="stat-label">ปลอดภัย</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Latest Result Section */}
            <section className="latest-result">
                <div className="container">
                    <div className="section-header">
                        <h2>
                            <FiCalendar />
                            ผลหวยงวดล่าสุด
                        </h2>
                        <Link to="/results" className="see-all">
                            ดูทั้งหมด <FiArrowRight />
                        </Link>
                    </div>

                    {loading ? (
                        <div className="loading-state">
                            <div className="spinner"></div>
                        </div>
                    ) : latestResult ? (
                        <div className="result-card card animate-fadeIn">
                            <div className="result-date">
                                งวดวันที่ {new Date(latestResult.draw_date).toLocaleDateString('th-TH', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                })}
                            </div>
                            <div className="result-numbers">
                                <div className="result-item">
                                    <span className="result-label">2 ตัว</span>
                                    <span className="result-value">{latestResult.two_digit || '--'}</span>
                                </div>
                                <div className="result-item">
                                    <span className="result-label">3 ตัว</span>
                                    <span className="result-value">{latestResult.three_digit || '---'}</span>
                                </div>
                                <div className="result-item">
                                    <span className="result-label">4 ตัว</span>
                                    <span className="result-value">{latestResult.four_digit || '----'}</span>
                                </div>
                                <div className="result-item highlight">
                                    <span className="result-label">6 ตัว (รางวัลใหญ่)</span>
                                    <span className="result-value big">{latestResult.six_digit || '------'}</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state card">
                            <FiGift className="empty-icon" />
                            <p>ยังไม่มีผลหวย</p>
                        </div>
                    )}
                </div>
            </section>

            {/* Lottery Types Section */}
            <section className="lottery-types">
                <div className="container">
                    <div className="section-header">
                        <h2>
                            <FiGift />
                            ประเภทหวย
                        </h2>
                    </div>

                    <div className="lottery-grid">
                        {LOTTERY_TYPES.map((lottery, index) => (
                            <LotteryCard
                                key={lottery.type}
                                {...lottery}
                                onClick={() => { }}
                            />
                        ))}
                    </div>

                    <div className="cta-section">
                        {isAuthenticated ? (
                            <Link to="/buy" className="btn btn-primary btn-lg">
                                เริ่มซื้อหวยเลย
                                <FiArrowRight />
                            </Link>
                        ) : (
                            <Link to="/register" className="btn btn-primary btn-lg">
                                สมัครเพื่อซื้อหวย
                                <FiArrowRight />
                            </Link>
                        )}
                    </div>
                </div>
            </section>
        </div>
    )
}
