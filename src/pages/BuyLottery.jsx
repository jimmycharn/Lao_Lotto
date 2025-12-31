import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import LotteryCard from '../components/LotteryCard'
import { FiCheck, FiX, FiPlus, FiMinus, FiShoppingCart } from 'react-icons/fi'
import './BuyLottery.css'

const LOTTERY_TYPES = [
    {
        id: 'two_digit',
        type: '2 ตัว',
        digits: 2,
        title: 'หวย 2 ตัว',
        description: 'ทายเลข 2 หลัก',
        rate: 90,
        minPrice: 10
    },
    {
        id: 'three_digit',
        type: '3 ตัว',
        digits: 3,
        title: 'หวย 3 ตัว',
        description: 'ทายเลข 3 หลัก',
        rate: 500,
        minPrice: 10
    },
    {
        id: 'four_digit',
        type: '4 ตัว',
        digits: 4,
        title: 'หวย 4 ตัว',
        description: 'ทายเลข 4 หลัก',
        rate: 5000,
        minPrice: 10
    },
    {
        id: 'six_digit',
        type: '6 ตัว',
        digits: 6,
        title: 'หวย 6 ตัว (รางวัลใหญ่)',
        description: 'ทายเลข 6 หลัก',
        rate: 100000,
        minPrice: 10
    }
]

export default function BuyLottery() {
    const { user, profile } = useAuth()
    const navigate = useNavigate()

    const [selectedType, setSelectedType] = useState(null)
    const [numbers, setNumbers] = useState('')
    const [amount, setAmount] = useState(10)
    const [cart, setCart] = useState([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [success, setSuccess] = useState('')

    const handleSelectType = (lottery) => {
        setSelectedType(lottery)
        setNumbers('')
        setError('')
    }

    const validateNumbers = () => {
        if (!selectedType) return false
        if (numbers.length !== selectedType.digits) return false
        if (!/^\d+$/.test(numbers)) return false
        return true
    }

    const addToCart = () => {
        if (!validateNumbers()) {
            setError(`กรุณากรอกเลข ${selectedType.digits} หลัก`)
            return
        }

        const newItem = {
            id: Date.now(),
            type: selectedType,
            numbers,
            amount,
            potentialWin: amount * selectedType.rate
        }

        setCart([...cart, newItem])
        setNumbers('')
        setSuccess('เพิ่มในตะกร้าเรียบร้อย')
        setTimeout(() => setSuccess(''), 2000)
    }

    const removeFromCart = (id) => {
        setCart(cart.filter(item => item.id !== id))
    }

    const getTotalAmount = () => {
        return cart.reduce((sum, item) => sum + item.amount, 0)
    }

    const handleSubmit = async () => {
        if (cart.length === 0) {
            setError('กรุณาเลือกหวยอย่างน้อย 1 รายการ')
            return
        }

        setLoading(true)
        setError('')

        try {
            // Get latest open draw
            const { data: draw, error: drawError } = await supabase
                .from('lottery_draws')
                .select('id')
                .eq('is_published', false)
                .order('draw_date', { ascending: false })
                .limit(1)
                .single()

            if (drawError || !draw) {
                setError('ไม่มีงวดหวยที่เปิดรับ')
                setLoading(false)
                return
            }

            // Create purchases
            const purchases = cart.map(item => ({
                user_id: user.id,
                draw_id: draw.id,
                bet_type: item.type.id,
                numbers: item.numbers,
                amount: item.amount
            }))

            const { error: purchaseError } = await supabase
                .from('purchases')
                .insert(purchases)

            if (purchaseError) {
                setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
                console.error(purchaseError)
            } else {
                setSuccess('ส่งโพยเรียบร้อย!')
                setCart([])
                setTimeout(() => navigate('/history'), 1500)
            }
        } catch (err) {
            setError('เกิดข้อผิดพลาด กรุณาลองใหม่')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="buy-page">
            <div className="container">
                <div className="page-header">
                    <h1>ซื้อหวย</h1>
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

                        {/* Step 2: Enter Numbers */}
                        {selectedType && (
                            <div className="buy-section animate-slideUp">
                                <h2 className="section-title">
                                    <span className="step-number">2</span>
                                    กรอกเลข {selectedType.digits} หลัก
                                </h2>

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
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/\D/g, '')
                                            setNumbers(val)
                                            setError('')
                                        }}
                                        className="form-input number-input"
                                        placeholder={`กรอกเลข ${selectedType.digits} หลัก`}
                                    />
                                </div>

                                {/* Amount Selection */}
                                <div className="amount-section">
                                    <label className="form-label">จำนวนเงิน (บาท)</label>
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
                                        หากถูกรางวัล: <span className="win-amount">฿{(amount * selectedType.rate).toLocaleString()}</span>
                                    </div>
                                </div>

                                {error && <div className="error-text">{error}</div>}
                                {success && <div className="success-text">{success}</div>}

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
                                                    <span className="cart-item-type">{item.type.type}</span>
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
