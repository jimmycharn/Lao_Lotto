const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/pages/Dealer.jsx');
let lines = fs.readFileSync(filePath, 'utf8').split('\n');

for (let i = 2805; i < 2835; i++) {
    if (lines[i].includes('span className="round-date"')) {
        const indent = lines[i].substring(0, lines[i].indexOf('<'));
        const trashBtnLines = [
            `${indent}<button`,
            `${indent}    title="ลบประวัติงวดนี้"`,
            `${indent}    onClick={(e) => {`,
            `${indent}        e.stopPropagation();`,
            `${indent}        setDeleteHistoryItem(history);`,
            `${indent}    }}`,
            `${indent}    style={{`,
            `${indent}        background: 'none',`,
            `${indent}        border: 'none',`,
            `${indent}        color: '#ef4444',`,
            `${indent}        cursor: 'pointer',`,
            `${indent}        padding: '0.15rem 0.35rem',`,
            `${indent}        borderRadius: '4px',`,
            `${indent}        display: 'inline-flex',`,
            `${indent}        alignItems: 'center',`,
            `${indent}        justifyContent: 'center',`,
            `${indent}        marginLeft: '0.25rem',`,
            `${indent}        marginRight: '0.15rem',`,
            `${indent}        transition: 'background 0.2s'`,
            `${indent}    }}`,
            `${indent}    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'}`,
            `${indent}    onMouseLeave={(e) => e.currentTarget.style.background = 'none'}`,
            `${indent}>`,
            `${indent}    <FiTrash2 size={16} />`,
            `${indent}</button>`
        ];
        lines.splice(i, 0, ...trashBtnLines);
        console.log('Inserted trash button before round-date line!');
        break;
    }
}

fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
console.log('Done inserting trash button!');
