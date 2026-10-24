// frontend/src/config/countries.js
//
// Single source of truth for the country list used by every form that
// writes `UserProfile.country`.
//
// Design decision: the backend stores `country` as a free-text
// `CharField(max_length=100)` that already contains **display names**
// ("India", "United States") from prior data. So this module:
//   • Exposes COUNTRY_OPTIONS as { value, label } where BOTH value and
//     label are the display name. This means existing rows hydrate
//     cleanly into the <select> without migration, and new writes go
//     in as display names — matching what's already in the DB.
//   • Provides countryNameToCode / countryCodeToName for any future
//     code that needs to round-trip through ISO codes (e.g. shipping,
//     address validation). We do NOT use codes in the select today.
//
// If you later migrate `UserProfile.country` to ISO codes, change
// COUNTRY_OPTIONS to { value: code, label: name } and update the two
// helpers — nothing else in the app needs to change.

import countries from 'i18n-iso-countries';
import en from 'i18n-iso-countries/langs/en.json';

countries.registerLocale(en);

// 249 entries, official English names, sorted A→Z by label.
// Both `value` and `label` are the display name, so writing the
// selected option to the backend stores "United States" (which is
// what the existing rows already contain), not "US".
export const COUNTRY_OPTIONS = Object.entries(
    countries.getNames('en', { select: 'official' })
)
    .map(([code, name]) => ({ value: name, label: name, code }))
    .sort((a, b) => a.label.localeCompare(b.label));

// Fast lookup sets used by the validator below.
const COUNTRY_NAME_SET = new Set(COUNTRY_OPTIONS.map((o) => o.value));

/**
 * Normalise an incoming country string to one of our known display
 * names. Accepts:
 *   • Exact display name:          "India"          → "India"
 *   • ISO-3166 alpha-2 code:       "IN"             → "India"
 *   • alpha-3 code:                "IND"            → "India"
 *   • Case-insensitive name match: "united states"  → "United States"
 * Returns '' if the value is empty or unrecognised, so the caller can
 * decide whether to fall back to a default.
 */
export const normaliseCountryName = (raw) => {
    const value = (raw || '').trim();
    if (!value) return '';

    // Already a display name we ship.
    if (COUNTRY_NAME_SET.has(value)) return value;

    // Case-insensitive display-name match.
    const ciMatch = COUNTRY_OPTIONS.find(
        (o) => o.label.toLowerCase() === value.toLowerCase()
    );
    if (ciMatch) return ciMatch.label;

    // Treat as ISO code (alpha-2 or alpha-3).
    const name =
        countries.getName(value.toUpperCase(), 'en', { select: 'official' }) ||
        countries.getName(value, 'en', { select: 'official' });
    if (name) return name;

    // Unknown — let the caller decide.
    return '';
};

/** Display name → ISO alpha-2 code, or '' if unknown. */
export const countryNameToCode = (name) => {
    const normalised = normaliseCountryName(name);
    if (!normalised) return '';
    return countries.getAlpha2Code(normalised, 'en') || '';
};

/** ISO alpha-2 code → display name, or '' if unknown. */
export const countryCodeToName = (code) => {
    if (!code) return '';
    return countries.getName(code.toUpperCase(), 'en', { select: 'official' }) || '';
};

/** Default country when the form starts fresh or clears the field. */
export const DEFAULT_COUNTRY = 'Hong Kong';