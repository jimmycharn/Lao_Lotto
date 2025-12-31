import './LotteryCard.css'

export default function LotteryCard({
    type,
    digits,
    title,
    description,
    rate,
    onClick,
    selected = false,
    disabled = false
}) {
    return (
        <div
            className={`lottery-card ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
            onClick={!disabled ? onClick : undefined}
        >
            <div className="lottery-card-header">
                <span className="lottery-type">{type}</span>
                <span className="lottery-rate">x{rate}</span>
            </div>

            <div className="lottery-digits">
                {Array.from({ length: digits }).map((_, i) => (
                    <span key={i} className="digit-box">?</span>
                ))}
            </div>

            <h3 className="lottery-title">{title}</h3>
            <p className="lottery-description">{description}</p>

            {selected && (
                <div className="selected-badge">
                    <span>✓</span>
                </div>
            )}
        </div>
    )
}
