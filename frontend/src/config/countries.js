// frontend/src/config/countries.js
import countries from 'i18n-iso-countries';
import en from 'i18n-iso-countries/langs/en.json';

countries.registerLocale(en);

// ISO 3166-1 alpha-2 codes, official English names, sorted A→Z.
export const COUNTRY_OPTIONS = Object.entries(countries.getNames('en', { select: 'official' }))
    .map(([code, name]) => ({ value: code, label: name }))
    .sort((a, b) => a.label.localeCompare(b.label));

// Convert a display name (e.g. "India") back to ISO code ("IN"), or null.
export const countryNameToCode = (name) => {
    if (!name) return '';
    // Accept either the code itself or the display name.
    const byCode = countries.getName(name, 'en');
    if (byCode) return name;
    const code = countries.getAlpha2Code(name, 'en');
    return code || '';
};

// Convert an ISO code back to display name.
export const countryCodeToName = (code) => {
    if (!code) return '';
    // If already a name, pass through.
    return countries.getName(code, 'en', { select: 'official' }) || code;
};