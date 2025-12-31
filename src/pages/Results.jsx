import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { FiCalendar, FiChevronLeft, FiChevronRight, FiGift } from 'react-icons/fi'
import './Results.css'

export default function Results() {
    const { profile } = useAuth()
    const [results, setResults] = useState([])
    const [loading, setLoading] = useState(true)
    const [currentPage, setCurrentPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const itemsPerPage = 10

    useEffect(() => {
        if (profile?.dealer_id) {
            fetchResults()
        }
    }, [currentPage, profile])

    async function fetchResults() {
        setLoading(true)
        try {
            // Get total count
            const { count } = await supabase
                .from('lottery_rounds')
                .select('*', { count: 'exact', head: true })
                .eq('dealer_id', profile.dealer_id)
                .eq('is_result_announced', true)

            setTotalPages(Math.ceil((count || 0) / itemsPerPage))

            // Get paginated results
            const { data, error } = await supabase
                .from('lottery_rounds')
                .select('*')
                .eq('dealer_id', profile.dealer_id)
                .eq('is_result_announced', true)
                .order('round_date', { ascending: false })
                .range((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage - 1)

            if (error) {
                console.error('Error:', error)
            } else {
                setResults(data || [])
            }
        } catch (error) {
            console.error('Error fetching results:', error)
        } finally {
            setLoading(false)
        }
    }

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('th-TH', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })
    }

    return (
        <div className="results-page">
            <div className="container">
                <div className="page-header">
                    <h1>
                        <FiCalendar />
                        ผลรางวัล
                    </h1>
                    <p>ผลการออกรางวัลจากเจ้ามือของคุณ</p>
                </div>

                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>กำลังโหลด...</p>
                    </div>
                ) : results.length === 0 ? (
                    <div className="empty-state card animate-fadeIn">
                        <FiGift className="empty-icon" />
                        <h3>ยังไม่มีผลรางวัล</h3>
                        <p>ผลรางวัลจะปรากฏที่นี่เมื่อมีการประกาศ</p>
                    </div>
                ) : (
                    <>
                        <div className="results-list">
                            {results.map((result, index) => (
                                <div
                                    key={result.id}
                                    className="result-card card animate-slideUp"
                                    style={{ animationDelay: `${index * 0.05}s` }}
                                >
                                    <div className="result-header">
                                        <div className="result-date">
                                            <FiCalendar />
                                            {result.lottery_name || 'หวยลาว'} - {formatDate(result.round_date)}
                                        </div>
                                        <span className="result-badge">งวดที่ผ่านมา</span>
                                    </div>

                                    <div className="result-grid">
                                        <div className="result-item">
                                            <span className="result-label">2 ตัวบน</span>
                                            <span className="result-number">{result.winning_numbers?.['2_top'] || '--'}</span>
                                        </div>
                                        <div className="result-item">
                                            <span className="result-label">2 ตัวล่าง</span>
                                            <span className="result-number">{result.winning_numbers?.['2_bottom'] || '--'}</span>
                                        </div>
                                        <div className="result-item">
                                            <span className="result-label">3 ตัวบน</span>
                                            <span className="result-number">{result.winning_numbers?.['3_top'] || '---'}</span>
                                        </div>
                                        <div className="result-item highlight">
                                            <span className="result-label">6 ตัว (รางวัลใหญ่)</span>
                                            <span className="result-number big">{result.winning_numbers?.['6_top'] || '------'}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="pagination">
                                <button
                                    className="pagination-btn"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                >
                                    <FiChevronLeft />
                                </button>

                                <div className="pagination-info">
                                    หน้า {currentPage} จาก {totalPages}
                                </div>

                                <button
                                    className="pagination-btn"
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                >
                                    <FiChevronRight />
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}
