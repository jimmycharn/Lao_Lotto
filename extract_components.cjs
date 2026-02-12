const { readFileSync, writeFileSync, mkdirSync } = require('fs');

const content = readFileSync('src/pages/Dealer.jsx', 'utf8');
const lines = content.split(/\r?\n/);

console.log(`Total lines: ${lines.length}`);

// Components to extract: [startLine, endLine, filename, componentName]
const components = [
    [3416, 5131, 'SubmissionsModal'],
    [5133, 5670, 'DealerProfileTab'],
    [5672, 5903, 'QRScannerModal'],
    [5905, 6225, 'MemberAccordionItem'],
    [6227, 6642, 'UpstreamDealerSettingsInline'],
    [6644, 6882, 'UpstreamDealerAccordionItem'],
    [6884, 7295, 'UpstreamDealersTab'],
    [7297, 7656, 'UpstreamDealerSettings'],
    [7658, 8145, 'MemberSettings'],
];

mkdirSync('src/components/dealer', { recursive: true });

for (const [start, end, name] of components) {
    const componentLines = lines.slice(start - 1, end);
    const code = componentLines.join('\n');

    // Analyze what this component uses
    const usesUseAuth = code.includes('useAuth');
    const usesUseToast = code.includes('useToast') || /\btoast\b/.test(code);
    const usesSupabase = code.includes('supabase');
    const usesUseState = code.includes('useState');
    const usesUseEffect = code.includes('useEffect');
    const usesUseRef = code.includes('useRef');
    const usesJsPDF = code.includes('jsPDF');
    const usesAddThaiFont = code.includes('addThaiFont');
    const usesHtml5Qrcode = code.includes('Html5Qrcode') || code.includes('Html5QrcodeScanner');
    const usesCreditCheck = code.includes('checkUpstreamDealerCredit') || code.includes('checkDealerCreditForBet') || code.includes('updatePendingDeduction');
    const usesGenerateBatchId = code.includes('generateBatchId');
    const usesFetchDealerCredit = code.includes('fetchDealerCredit');
    const usesChangePasswordModal = code.includes('ChangePasswordModal');

    // Find react-icons used
    const fiIcons = new Set();
    const fiRegex = /\bFi[A-Z][a-zA-Z0-9]+/g;
    let match;
    while ((match = fiRegex.exec(code)) !== null) {
        fiIcons.add(match[0]);
    }

    // Find lottery constants used
    const lotteryConsts = [];
    if (code.includes('BET_TYPES')) lotteryConsts.push('BET_TYPES');
    if (code.includes('LOTTERY_TYPES')) lotteryConsts.push('LOTTERY_TYPES');
    if (code.includes('BET_TYPES_BY_LOTTERY')) lotteryConsts.push('BET_TYPES_BY_LOTTERY');
    if (code.includes('DEFAULT_COMMISSIONS')) lotteryConsts.push('DEFAULT_COMMISSIONS');
    if (code.includes('DEFAULT_PAYOUTS')) lotteryConsts.push('DEFAULT_PAYOUTS');
    if (code.includes('normalizeNumber')) lotteryConsts.push('normalizeNumber');
    if (code.includes('generateBatchId')) lotteryConsts.push('generateBatchId');
    if (code.includes('getDefaultLimitsForType')) lotteryConsts.push('getDefaultLimitsForType');
    if (code.includes('getDefaultSetPricesForType')) lotteryConsts.push('getDefaultSetPricesForType');
    if (code.includes('getLotteryTypeKey')) lotteryConsts.push('getLotteryTypeKey');

    // Check for other component references
    const usesMemberSettings = code.includes('MemberSettings') && name !== 'MemberSettings';
    const usesUpstreamSettings = code.includes('UpstreamDealerSettingsInline') && name !== 'UpstreamDealerSettingsInline';
    const usesUpstreamAccordion = code.includes('UpstreamDealerAccordionItem') && name !== 'UpstreamDealerAccordionItem';
    const usesUpstreamDealerSettings = code.includes('UpstreamDealerSettings') && name !== 'UpstreamDealerSettings';

    // Build imports
    let imports = '';

    // React imports
    const reactImports = [];
    if (usesUseState) reactImports.push('useState');
    if (usesUseEffect) reactImports.push('useEffect');
    if (usesUseRef) reactImports.push('useRef');
    if (reactImports.length > 0) {
        imports += `import { ${reactImports.join(', ')} } from 'react'\n`;
    }

    // Auth context
    if (usesUseAuth) {
        imports += `import { useAuth } from '../../contexts/AuthContext'\n`;
    }

    // Toast context  
    if (usesUseToast) {
        imports += `import { useToast } from '../../contexts/ToastContext'\n`;
    }

    // Supabase
    if (usesSupabase) {
        imports += `import { supabase } from '../../lib/supabase'\n`;
    }

    // Credit check utils
    if (usesCreditCheck) {
        const creditImports = [];
        if (code.includes('checkUpstreamDealerCredit')) creditImports.push('checkUpstreamDealerCredit');
        if (code.includes('checkDealerCreditForBet')) creditImports.push('checkDealerCreditForBet');
        if (code.includes('updatePendingDeduction')) creditImports.push('updatePendingDeduction');
        imports += `import { ${creditImports.join(', ')} } from '../../utils/creditCheck'\n`;
    }

    // jsPDF
    if (usesJsPDF) {
        imports += `import { jsPDF } from 'jspdf'\n`;
    }
    if (usesAddThaiFont) {
        imports += `import { addThaiFont } from '../../utils/thaiFontLoader'\n`;
    }

    // Html5Qrcode
    if (usesHtml5Qrcode) {
        const qrImports = [];
        if (code.includes('Html5QrcodeScanner')) qrImports.push('Html5QrcodeScanner');
        if (code.includes('Html5Qrcode')) qrImports.push('Html5Qrcode');
        imports += `import { ${[...new Set(qrImports)].join(', ')} } from 'html5-qrcode'\n`;
    }

    // ChangePasswordModal
    if (usesChangePasswordModal) {
        imports += `import ChangePasswordModal from '../ChangePasswordModal'\n`;
    }

    // React icons
    if (fiIcons.size > 0) {
        imports += `import {\n    ${[...fiIcons].join(',\n    ')}\n} from 'react-icons/fi'\n`;
    }

    // Lottery constants
    if (lotteryConsts.length > 0) {
        imports += `import {\n    ${lotteryConsts.join(',\n    ')}\n} from '../../constants/lotteryTypes'\n`;
    }

    // CSS
    imports += `import '../../pages/Dealer.css'\n`;
    imports += `import '../../pages/SettingsTabs.css'\n`;

    // Other component imports
    if (usesMemberSettings) {
        imports += `import MemberSettings from './MemberSettings'\n`;
    }
    if (usesUpstreamSettings) {
        imports += `import UpstreamDealerSettingsInline from './UpstreamDealerSettingsInline'\n`;
    }
    if (usesUpstreamAccordion) {
        imports += `import UpstreamDealerAccordionItem from './UpstreamDealerAccordionItem'\n`;
    }
    if (usesUpstreamDealerSettings) {
        imports += `import UpstreamDealerSettings from './UpstreamDealerSettings'\n`;
    }

    // Modify function declaration to export default
    let modifiedCode = code.replace(
        /^(\/\/.*\n)?function (\w+)/,
        (match, comment, funcName) => {
            return `${comment || ''}export default function ${funcName}`;
        }
    );

    // If SubmissionsModal uses toast and fetchDealerCredit from closure, 
    // add useToast inside the component  
    if (name === 'SubmissionsModal' && !code.includes('useToast')) {
        // Add toast initialization after the first line of the function body
        modifiedCode = modifiedCode.replace(
            "const { user } = useAuth()",
            "const { user } = useAuth()\n    const { toast } = useToast()"
        );
    }

    const fullFile = `${imports}\n${modifiedCode}\n`;

    const outPath = `src/components/dealer/${name}.jsx`;
    writeFileSync(outPath, fullFile, 'utf8');
    console.log(`✓ ${name} → ${outPath} (${componentLines.length} lines, icons: ${[...fiIcons].join(', ')})`);
}

console.log('\nDone! All components extracted.');
