import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import LotteryCard from '../components/LotteryCard'
import { FiCheck, FiX, FiPlus, FiMinus, FiShoppingCart, FiRefreshCw } from 'react-icons/fi'
import { toast } from 'react-hot-toast'
import './BuyLottery.css'

const LOTTERY_TYPES = [
    {
        id: 'two_digit',
        type: '2 ตัว',
        digits: 2,
        title: 'หวย 2 ตัว',
        description: 'ทายเลข 2 หลัก',
        rate: 90,
        minPrice: 10,
        betTypes: [
            { id: '2_top', label: 'บน' },
            { id: '2_bottom', label: 'ล่าง' }
        ]
    },
    {
        id: 'three_digit',
        type: '3 ตัว',
        digits: 3,
        title: 'หวย 3 ตัว',
        description: 'ทายเลข 3 หลัก',
        rate: 500,
        minPrice: 10,
        betTypes: [
            { id: '3_top', label: 'บน' },
            { id: '3_tod', label: 'โต๊ด' },
            { id: '3_bottom', label: 'ล่าง' }
        ]
    },
    {
        id: 'four_digit',
        type: '4 ตัว',
        digits: 4,
        title: 'หวย 4 ตัว',
        description: 'ทายเลข 4 หลัก',
        rate: 5000,
        minPrice: 10,
        betTypes: [
            { id: '4_tod', label: 'โต๊ด' }
        ]
    },
    {
        id: 'six_digit',
        type: '6 ตัว',
        digits: 6,
        title: 'หวย 6 ตัว (รางวัลใหญ่)',
        description: 'ทายเลข 6 หลัก',
        rate: 100000,
        minPrice: 10,
        betTypes: [
            { id: '6_top', label: 'บน' }
        ]
    }
]

const SINGLE_DIGIT_BET_TYPES = [
    { id: 'run_top', label: 'วิ่งบน' },
    { id: 'run_bottom', label: 'วิ่งล่าง' },
    { id: 'front_top_1', label: 'หน้าบน' },
    { id: 'middle_top_1', label: 'กลางบน' },
    { id: 'back_top_1', label: 'หลังบน' },
    { id: 'front_bottom_1', label: 'หน้าล่าง' },
    { id: 'back_bottom_1', label: 'หลังล่าง' }
]

export default function BuyLottery() {
    const { user, profile } = useAuth()
    const navigate = useNavigate()

    const [activeRound, setActiveRound] = useState(null)
    const [selectedType, setSelectedType] = useState(null)
    const [selectedBetTypes, setSelectedBetTypes] = useState([])
    const [numbers, setNumbers] = useState('')
    const [amount, setAmount] = useState(10)
    const [isReverse, setIsReverse] = useState(false)
    const [cart, setCart] = useState([])
    const [loading, setLoading] = useState(false)
    const [fetchingRound, setFetchingRound] = useState(true)

    // Fetch active round from dealer
    useEffect(() => {
        if (profile?.dealer_id) {
            fetchActiveRound()
        } else if (profile && !profile.dealer_id) {
            setFetchingRound(false)
        }
    }, [profile])

    async function fetchActiveRound() {
        setFetchingRound(true)
        try {
            const { data, error } = await supabase
                .from('lottery_rounds')
                .select('*')
                .eq('dealer_id', profile.dealer_id)
                .eq('status', 'open')
                .order('close_time', { ascending: true })
                .limit(1)
                .single()

            if (error) {
                console.error('Error fetching round:', error)
            } else {
                setActiveRound(data)
            }
        } catch (err) {
            console.error(err)
        } finally {
            setFetchingRound(false)
        }
    }

    const handleSelectType = (lottery) => {
        setSelectedType(lottery)
        setSelectedBetTypes(lottery.betTypes.map(bt => bt.id)) // Default select all
        setNumbers('')
        setIsReverse(false)
    }

    const toggleBetType = (id) => {
        if (selectedBetTypes.includes(id)) {
            setSelectedBetTypes(selectedBetTypes.filter(t => t !== id))
        } else {
            setSelectedBetTypes([...selectedBetTypes, id])
        }
    }

    const validateNumbers = () => {
        if (!selectedType) return false
        if (numbers.length === 0) return false
        if (!/^\d+$/.test(numbers)) return false
        if (selectedBetTypes.length === 0) return false

        // If single digit, it's valid for special bet types
        if (numbers.length === 1) return true

        // Otherwise must match the selected type's digits
        if (numbers.length !== selectedType.digits) return false

        return true
    }

    const getPermutations = (str) => {
        if (str.length <= 1) return [str]
        const perms = []
        for (let i = 0; i < str.length; i++) {
            const char = str[i]
            const remainingChars = str.slice(0, i) + str.slice(i + 1)
            for (const subPerm of getPermutations(remainingChars)) {
                perms.push(char + subPerm)
            }
        }
        return [...new Set(perms)] // Unique permutations
    }

    const addToCart = () => {
        if (!validateNumbers()) {
            const msg = numbers.length === 1
                ? 'กรุณาเลือกประเภทการแทงสำหรับเลขวิ่ง/รูด'
                : `กรุณากรอกเลข ${selectedType.digits} หลัก และเลือกประเภทการแทง`
            toast.error(msg)
            return
        }

        const isSingleDigit = numbers.length === 1
        const numbersToBet = (isReverse && !isSingleDigit) ? getPermutations(numbers) : [numbers]
        const newItems = []

        numbersToBet.forEach(num => {
            selectedBetTypes.forEach(betTypeId => {
                let betTypeLabel = ''
                if (isSingleDigit) {
                    betTypeLabel = SINGLE_DIGIT_BET_TYPES.find(bt => bt.id === betTypeId)?.label
                } else {
                    betTypeLabel = selectedType.betTypes.find(bt => bt.id === betTypeId)?.label
                }

                newItems.push({
                    id: `${Date.now()}-${num}-${betTypeId}`,
                    type: selectedType,
                    betTypeId,
                    betTypeLabel,
                    numbers: num,
                    amount,
                    potentialWin: amount * selectedType.rate
                })
            })
        })

        setCart([...cart, ...newItems])
        setNumbers('')
        toast.success(`เพิ่ม ${newItems.length} รายการลงตะกร้า`)

        // Auto-focus number input for next entry
        setTimeout(() => {
            const input = document.querySelector('.number-input')
            if (input) input.focus()
        }, 100)
    }

    const removeFromCart = (id) => {
        setCart(cart.filter(item => item.id !== id))
    }

    const getTotalAmount = () => {
        return cart.reduce((sum, item) => sum + item.amount, 0)
    }

    const handleSubmit = async () => {
        if (cart.length === 0) {
            toast.error('กรุณาเลือกหวยอย่างน้อย 1 รายการ')
            return
        }

        if (!activeRound) {
            toast.error('ไม่มีงวดที่เปิดรับในขณะนี้')
            return
        }

        setLoading(true)

        try {
            const submissions = cart.map(item => ({
                round_id: activeRound.id,
                user_id: user.id,
                bet_type: item.betTypeId,
                numbers: item.numbers,
                amount: item.amount
            }))

            const { error } = await supabase
                .from('submissions')
                .insert(submissions)

            if (error) {
                toast.error('เกิดข้อผิดพลาด: ' + error.message)
                console.error(error)
            } else {
                toast.success('ส่งโพยเรียบร้อย!')
                setCart([])
                setTimeout(() => navigate('/history'), 1500)
            }
        } catch (err) {
            toast.error('เกิดข้อผิดพลาด กรุณาลองใหม่')
        } finally {
            setLoading(false)
        }
    }

    if (fetchingRound) {
        return (
            <div className="loading-screen">
                <div className="spinner"></div>
                <p>กำลังโหลดข้อมูล...</p>
            </div>
        )
    }

    if (!profile?.dealer_id) {
        return (
            <div className="container" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                <div className="card">
                    <h2>ยังไม่มีเจ้ามือ</h2>
                    <p>กรุณาติดต่อเจ้ามือเพื่อขอลิงก์สมัครสมาชิก หรือสแกน QR Code เพื่อเข้ากลุ่ม</p>
                </div>
            </div>
        )
    }

    if (!activeRound) {
        return (
            <div className="container" style={{ padding: '4rem 2rem', textAlign: 'center' }}>
                <div className="card">
                    <h2>ปิดรับแทงชั่วคราว</h2>
                    <p>ขณะนี้ยังไม่มีงวดที่เปิดรับแทง กรุณารอเจ้ามือเปิดงวดใหม่</p>
                </div>
            </div>
        )
    }

    return (
        <div className="buy-page">
            <div className="container">
                <div className="page-header">
                    <div className="header-content">
                        <h1>ซื้อหวย</h1>
                        <div className="round-badge">
                            <span className="dot"></span>
                            {activeRound.lottery_name || 'หวยลาว'} - งวดวันที่ {new Date(activeRound.round_date).toLocaleDateString('th-TH')}
                        </div>
                    </div>
                    <p>เลือกประเภทหวยและกรอกเลขที่ต้องการ</p>
                </div>

                <div className="buy-layout">
                    {/* Left Column - Lottery Selection */}
                    <div className="buy-main">
                        {/* Step 1: Select Type */}
                        <div className="buy-section">
                            <h2 className="section-title">
                                <span className="step-number">1</span>
                                เลือกประเภทหวย
                            </h2>
                            <div className="lottery-type-grid">
                                {LOTTERY_TYPES.map((lottery) => (
                                    <LotteryCard
                                        key={lottery.id}
                                        {...lottery}
                                        selected={selectedType?.id === lottery.id}
                                        onClick={() => handleSelectType(lottery)}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Step 2: Enter Numbers & Bet Types */}
                        {selectedType && (
                            <div className="buy-section animate-slideUp">
                                <h2 className="section-title">
                                    <span className="step-number">2</span>
                                    ระบุเลขและประเภทการแทง
                                </h2>

                                <div className="bet-config-grid">
                                    {/* Number Input */}
                                    <div className="number-input-section">
                                        <div className="number-display">
                                            {Array.from({ length: selectedType.digits }).map((_, i) => (
                                                <span key={i} className={`digit-display ${numbers[i] ? 'filled' : ''}`}>
                                                    {numbers[i] || ''}
                                                </span>
                                            ))}
                                        </div>

                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            maxLength={selectedType.digits}
                                            value={numbers}
                                            autoFocus
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/\D/g, '')
                                                setNumbers(val)
                                            }}
                                            className="form-input number-input"
                                            placeholder={`กรอกเลข ${selectedType.digits} หลัก`}
                                        />
                                    </div>

                                    {/* Bet Type Selection & Reverse */}
                                    <div className="bet-options-section">
                                        <div className="bet-types-toggle">
                                            <label className="form-label">ประเภทการแทง</label>
                                            <div className="toggle-grid">
                                                {numbers.length === 1 ? (
                                                    SINGLE_DIGIT_BET_TYPES.map(bt => (
                                                        <button
                                                            key={bt.id}
                                                            className={`toggle-btn ${selectedBetTypes.includes(bt.id) ? 'active' : ''}`}
                                                            onClick={() => toggleBetType(bt.id)}
                                                        >
                                                            {bt.label}
                                                        </button>
                                                    ))
                                                ) : (
                                                    selectedType.betTypes.map(bt => (
                                                        <button
                                                            key={bt.id}
                                                            className={`toggle-btn ${selectedBetTypes.includes(bt.id) ? 'active' : ''}`}
                                                            onClick={() => toggleBetType(bt.id)}
                                                        >
                                                            {bt.label}
                                                        </button>
                                                    ))
                                                )}
                                            </div>
                                        </div>

                                        <div className="reverse-section">
                                            <label className="form-label">ตัวเลือกพิเศษ</label>
                                            <button
                                                className={`reverse-btn ${isReverse ? 'active' : ''}`}
                                                onClick={() => setIsReverse(!isReverse)}
                                                disabled={numbers.length === 1}
                                            >
                                                <FiRefreshCw className={isReverse ? 'spin' : ''} />
                                                กลับเลข
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Amount Selection */}
                                <div className="amount-section">
                                    <label className="form-label">จำนวนเงิน (ต่อรายการ)</label>
                                    <div className="amount-controls">
                                        <button
                                            className="amount-btn"
                                            onClick={() => setAmount(Math.max(10, amount - 10))}
                                        >
                                            <FiMinus />
                                        </button>
                                        <input
                                            type="number"
                                            min="10"
                                            step="10"
                                            value={amount}
                                            onChange={(e) => setAmount(Math.max(10, parseInt(e.target.value) || 10))}
                                            className="form-input amount-input"
                                        />
                                        <button
                                            className="amount-btn"
                                            onClick={() => setAmount(amount + 10)}
                                        >
                                            <FiPlus />
                                        </button>
                                    </div>
                                    <div className="potential-win">
                                        อัตราจ่าย: <span className="win-amount">x{selectedType.rate}</span>
                                    </div>
                                </div>

                                <button
                                    className="btn btn-primary btn-lg add-to-cart-btn"
                                    onClick={addToCart}
                                    disabled={!validateNumbers()}
                                >
                                    <FiShoppingCart />
                                    เพิ่มในตะกร้า
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Right Column - Cart */}
                    <div className="buy-sidebar">
                        <div className="cart-section card">
                            <h3 className="cart-title">
                                <FiShoppingCart />
                                ตะกร้าของคุณ
                                {cart.length > 0 && <span className="cart-count">{cart.length}</span>}
                            </h3>

                            {cart.length === 0 ? (
                                <div className="cart-empty">
                                    <p>ยังไม่มีรายการ</p>
                                </div>
                            ) : (
                                <>
                                    <div className="cart-items">
                                        {cart.map((item) => (
                                            <div key={item.id} className="cart-item">
                                                <div className="cart-item-info">
                                                    <span className="cart-item-type">{item.type.type} {item.betTypeLabel}</span>
                                                    <span className="cart-item-numbers">{item.numbers}</span>
                                                </div>
                                                <div className="cart-item-amount">
                                                    ฿{item.amount}
                                                </div>
                                                <button
                                                    className="cart-item-remove"
                                                    onClick={() => removeFromCart(item.id)}
                                                >
                                                    <FiX />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="cart-total">
                                        <span>รวมทั้งหมด</span>
                                        <span className="total-amount">฿{getTotalAmount().toLocaleString()}</span>
                                    </div>

                                    <button
                                        className="btn btn-accent btn-lg submit-btn"
                                        onClick={handleSubmit}
                                        disabled={loading}
                                    >
                                        {loading ? (
                                            <div className="spinner" style={{ width: 20, height: 20 }}></div>
                                        ) : (
                                            <>
                                                <FiCheck />
                                                ส่งโพย
                                            </>
                                        )}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
