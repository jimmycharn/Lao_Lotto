// Thai Font Loader for jsPDF
// This module fetches the Thai Sarabun font and adds it to jsPDF

const SARABUN_FONT_URL = 'https://fonts.gstatic.com/s/sarabun/v17/DtVjJx26TKEr37c9WBI.ttf';

let fontLoaded = false;
let fontData = null;

export const loadThaiFont = async () => {
    if (fontLoaded && fontData) return fontData;

    try {
        const response = await fetch(SARABUN_FONT_URL);
        const arrayBuffer = await response.arrayBuffer();

        // Convert to base64
        const base64 = arrayBufferToBase64(arrayBuffer);
        fontData = base64;
        fontLoaded = true;

        return base64;
    } catch (error) {
        console.error('Failed to load Thai font:', error);
        return null;
    }
};

export const addThaiFont = async (doc) => {
    const base64Font = await loadThaiFont();
    if (!base64Font) return false;

    try {
        // Add font to jsPDF
        doc.addFileToVFS('Sarabun-normal.ttf', base64Font);
        doc.addFont('Sarabun-normal.ttf', 'Sarabun', 'normal');
        doc.setFont('Sarabun');
        return true;
    } catch (error) {
        console.error('Failed to add Thai font to PDF:', error);
        return false;
    }
};

// Helper function to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export default { loadThaiFont, addThaiFont };
