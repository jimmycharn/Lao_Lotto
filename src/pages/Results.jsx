import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { FiCalendar, FiChevronLeft, FiChevronRight, FiGift } from 'react-icons/fi'
import './Results.css'

export default function Results() {
    const [results, setResults] = useState([])
    const [loading, setLoading] = useState(true)
    const [currentPage, setCurrentPage] = useState(1)
    const [totalPages, setTotalPages] = useState(1)
    const itemsPerPage = 10

    useEffect(() => {
        fetchResults()
    }, [currentPage])

    async function fetchResults() {
        setLoading(true)
        try {
            // Get total count
            const { count } = await supabase
                .from('lottery_draws')
                .select('*', { count: 'exact', head: true })
                .eq('is_published', true)

            setTotalPages(Math.ceil((count || 0) / itemsPerPage))

            // Get paginated results
            const { data, error } = await supabase
                .from('lottery_draws')
                .select('*')
                .eq('is_published', true)
                .order('draw_date', { ascending: false })
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
                        ผลหวยลาว
                    </h1>
                    <p>ผลการออกรางวัลหวยลาวทุกงวด</p>
                </div>

                {loading ? (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>กำลังโหลด...</p>
                    </div>
                ) : results.length === 0 ? (
                    <div className="empty-state card animate-fadeIn">
                        <FiGift className="empty-icon" />
                        <h3>ยังไม่มีผลหวย</h3>
                        <p>ผลหวยจะปรากฏที่นี่เมื่อมีการประกาศ</p>
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
                                            {formatDate(result.draw_date)}
                                        </div>
                                        <span className="result-badge">งวดที่ผ่านมา</span>
                                    </div>

                                    <div className="result-grid">
                                        <div className="result-item">
                                            <span className="result-label">2 ตัว</span>
                                            <span className="result-number">{result.two_digit || '--'}</span>
                                            <span className="result-rate">x90</span>
                                        </div>
                                        <div className="result-item">
                                            <span className="result-label">3 ตัว</span>
                                            <span className="result-number">{result.three_digit || '---'}</span>
                                            <span className="result-rate">x500</span>
                                        </div>
                                        <div className="result-item">
                                            <span className="result-label">4 ตัว</span>
                                            <span className="result-number">{result.four_digit || '----'}</span>
                                            <span className="result-rate">x5,000</span>
                                        </div>
                                        <div className="result-item highlight">
                                            <span className="result-label">6 ตัว (รางวัลใหญ่)</span>
                                            <span className="result-number big">{result.six_digit || '------'}</span>
                                            <span className="result-rate">x100,000</span>
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
