// frontend/src/config/countries.js
//
// The country list is driven by shared/constants/currencies.js
// so that every country the operator can select has a known currency.
//
// NOTE: `shared` is a workspace package (symlinked into node_modules by
// frontend/package.json's postinstall: `ln -s ../shared node_modules/shared`),
// so we import it by package name rather than a relative path. This keeps
// the import stable regardless of how deep this file lives.
import {
    COUNTRY_NAMES,
    getCountryConfig,
    FALLBACK_CURRENCY,
} from 'constants/currencies';

// Both `value` and `label` are the display name so that:
//   • Existing rows storing display names hydrate cleanly into <select>.
//   • New writes go in as display names, matching the DB.
// Currency metadata is attached for callers that need it.
export const COUNTRY_OPTIONS = COUNTRY_NAMES.map((name) => {
    const cfg = getCountryConfig(name) || FALLBACK_CURRENCY;
    return {
        value: name,
        label: name,
        code: cfg.countryCode,
        currencyCode: cfg.currencyCode,
        currencySymbol: cfg.symbol,
    };
});

const COUNTRY_NAME_SET = new Set(COUNTRY_OPTIONS.map((o) => o.value));

/**
 * Normalise an incoming country string to one of our known display
 * names. Accepts exact display names and case-insensitive matches.
 * Returns '' if the value is empty or unrecognised, so the caller can
 * decide whether to fall back to a default.
 */
export const normaliseCountryName = (raw) => {
    const value = (raw || '').trim();
    if (!value) return '';
    if (COUNTRY_NAME_SET.has(value)) return value;
    const ciMatch = COUNTRY_OPTIONS.find(
        (o) => o.label.toLowerCase() === value.toLowerCase(),
    );
    if (ciMatch) return ciMatch.label;
    return '';
};

/** Display name → ISO alpha-2 code, or '' if unknown. */
export const countryNameToCode = (name) => {
    const normalised = normaliseCountryName(name);
    if (!normalised) return '';
    const cfg = getCountryConfig(normalised);
    return cfg ? cfg.countryCode : '';
};

/** ISO alpha-2 code → display name, or '' if unknown. */
export const countryCodeToName = (code) => {
    if (!code) return '';
    const target = code.trim().toUpperCase();
    const match = COUNTRY_OPTIONS.find((o) => o.code === target);
    return match ? match.value : '';
};

/**
 * ✅ NEW: reorder options so the platform-configured country appears
 * first. Every consumer that renders a country <select> should call
 * this with `useSettings().settings.country` so the dropdown follows
 * the deployment configuration instead of a hardcoded default.
 *
 * If the configured country isn't in the catalog (e.g. legacy value
 * or a typo on the settings page), it is prepended as a custom option
 * so the select can still represent it — same defensive behaviour as
 * the Venue form's `countryOptions` memo.
 */
export const getCountryOptionsWithDefault = (platformCountry) => {
    const normalised = normaliseCountryName(platformCountry);
    if (!normalised) return COUNTRY_OPTIONS;

    const preferred = COUNTRY_OPTIONS.filter((o) => o.value === normalised);
    const rest = COUNTRY_OPTIONS.filter((o) => o.value !== normalised);

    if (preferred.length === 0) {
        // Configured country is not in the catalog — surface it anyway
        // so the operator can see and correct it.
        const fallbackCfg = FALLBACK_CURRENCY;
        return [
            {
                value: normalised,
                label: normalised,
                code: fallbackCfg.countryCode,
                currencyCode: fallbackCfg.currencyCode,
                currencySymbol: fallbackCfg.symbol,
            },
            ...rest,
        ];
    }

    return [...preferred, ...rest];
};

/** Default country when the form starts fresh or clears the field. */
export const DEFAULT_COUNTRY = 'Hong Kong';