// frontend/src/config/timezones.js
// Timezone catalog grouped by region.

export const TIMEZONE_GROUPS = [
    {
        region: '🌏 Asia',
        timezones: [
            { value: 'Asia/Kolkata',       label: 'Asia/Kolkata — India' },
            { value: 'Asia/Hong_Kong',     label: 'Asia/Hong_Kong — Hong Kong' },
            { value: 'Asia/Singapore',     label: 'Asia/Singapore — Singapore' },
            { value: 'Asia/Tokyo',         label: 'Asia/Tokyo — Japan' },
            { value: 'Asia/Seoul',         label: 'Asia/Seoul — South Korea' },
            { value: 'Asia/Shanghai',      label: 'Asia/Shanghai — China' },
            { value: 'Asia/Dubai',         label: 'Asia/Dubai — UAE' },
            { value: 'Asia/Riyadh',        label: 'Asia/Riyadh — Saudi Arabia' },
            { value: 'Asia/Karachi',       label: 'Asia/Karachi — Pakistan' },
            { value: 'Asia/Dhaka',         label: 'Asia/Dhaka — Bangladesh' },
            { value: 'Asia/Colombo',       label: 'Asia/Colombo — Sri Lanka' },
            { value: 'Asia/Kathmandu',     label: 'Asia/Kathmandu — Nepal' },
            { value: 'Asia/Bangkok',       label: 'Asia/Bangkok — Thailand' },
            { value: 'Asia/Jakarta',       label: 'Asia/Jakarta — Indonesia' },
            { value: 'Asia/Kuala_Lumpur',  label: 'Asia/Kuala_Lumpur — Malaysia' },
            { value: 'Asia/Manila',        label: 'Asia/Manila — Philippines' },
            { value: 'Asia/Taipei',        label: 'Asia/Taipei — Taiwan' },
            { value: 'Asia/Yangon',        label: 'Asia/Yangon — Myanmar' },
            { value: 'Asia/Kabul',         label: 'Asia/Kabul — Afghanistan' },
            { value: 'Asia/Tehran',        label: 'Asia/Tehran — Iran' },
            { value: 'Asia/Baghdad',       label: 'Asia/Baghdad — Iraq' },
            { value: 'Asia/Jerusalem',     label: 'Asia/Jerusalem — Israel' },
            { value: 'Asia/Beirut',        label: 'Asia/Beirut — Lebanon' },
            { value: 'Asia/Kuwait',        label: 'Asia/Kuwait — Kuwait' },
            { value: 'Asia/Qatar',         label: 'Asia/Qatar — Qatar' },
            { value: 'Asia/Bahrain',       label: 'Asia/Bahrain — Bahrain' },
            { value: 'Asia/Muscat',        label: 'Asia/Muscat — Oman' },
        ],
    },
    {
        region: '🌍 Europe',
        timezones: [
            { value: 'Europe/London',      label: 'Europe/London — United Kingdom' },
            { value: 'Europe/Paris',       label: 'Europe/Paris — France' },
            { value: 'Europe/Berlin',      label: 'Europe/Berlin — Germany' },
            { value: 'Europe/Madrid',      label: 'Europe/Madrid — Spain' },
            { value: 'Europe/Rome',        label: 'Europe/Rome — Italy' },
            { value: 'Europe/Amsterdam',   label: 'Europe/Amsterdam — Netherlands' },
            { value: 'Europe/Brussels',    label: 'Europe/Brussels — Belgium' },
            { value: 'Europe/Vienna',      label: 'Europe/Vienna — Austria' },
            { value: 'Europe/Zurich',      label: 'Europe/Zurich — Switzerland' },
            { value: 'Europe/Stockholm',   label: 'Europe/Stockholm — Sweden' },
            { value: 'Europe/Oslo',        label: 'Europe/Oslo — Norway' },
            { value: 'Europe/Copenhagen',  label: 'Europe/Copenhagen — Denmark' },
            { value: 'Europe/Helsinki',    label: 'Europe/Helsinki — Finland' },
            { value: 'Europe/Warsaw',      label: 'Europe/Warsaw — Poland' },
            { value: 'Europe/Prague',      label: 'Europe/Prague — Czech Republic' },
            { value: 'Europe/Budapest',    label: 'Europe/Budapest — Hungary' },
            { value: 'Europe/Athens',      label: 'Europe/Athens — Greece' },
            { value: 'Europe/Lisbon',      label: 'Europe/Lisbon — Portugal' },
            { value: 'Europe/Dublin',      label: 'Europe/Dublin — Ireland' },
            { value: 'Europe/Moscow',      label: 'Europe/Moscow — Russia' },
            { value: 'Europe/Istanbul',    label: 'Europe/Istanbul — Turkey' },
            { value: 'Europe/Kyiv',        label: 'Europe/Kyiv — Ukraine' },
        ],
    },
    {
        region: '🌎 Americas',
        timezones: [
            { value: 'America/New_York',     label: 'America/New_York — USA (Eastern)' },
            { value: 'America/Chicago',      label: 'America/Chicago — USA (Central)' },
            { value: 'America/Denver',       label: 'America/Denver — USA (Mountain)' },
            { value: 'America/Phoenix',      label: 'America/Phoenix — USA (Arizona)' },
            { value: 'America/Los_Angeles',  label: 'America/Los_Angeles — USA (Pacific)' },
            { value: 'America/Anchorage',    label: 'America/Anchorage — USA (Alaska)' },
            { value: 'Pacific/Honolulu',     label: 'Pacific/Honolulu — USA (Hawaii)' },
            { value: 'America/Toronto',      label: 'America/Toronto — Canada (Eastern)' },
            { value: 'America/Vancouver',    label: 'America/Vancouver — Canada (Pacific)' },
            { value: 'America/Mexico_City',  label: 'America/Mexico_City — Mexico' },
            { value: 'America/Sao_Paulo',    label: 'America/Sao_Paulo — Brazil' },
            { value: 'America/Argentina/Buenos_Aires', label: 'America/Argentina/Buenos_Aires — Argentina' },
            { value: 'America/Bogota',       label: 'America/Bogota — Colombia' },
            { value: 'America/Lima',         label: 'America/Lima — Peru' },
            { value: 'America/Santiago',     label: 'America/Santiago — Chile' },
            { value: 'America/Caracas',      label: 'America/Caracas — Venezuela' },
        ],
    },
    {
        region: '🌏 Oceania',
        timezones: [
            { value: 'Australia/Sydney',    label: 'Australia/Sydney — Australia (Eastern)' },
            { value: 'Australia/Melbourne', label: 'Australia/Melbourne — Australia (Victoria)' },
            { value: 'Australia/Brisbane',  label: 'Australia/Brisbane — Australia (Queensland)' },
            { value: 'Australia/Perth',     label: 'Australia/Perth — Australia (Western)' },
            { value: 'Australia/Adelaide',  label: 'Australia/Adelaide — Australia (South)' },
            { value: 'Pacific/Auckland',    label: 'Pacific/Auckland — New Zealand' },
            { value: 'Pacific/Fiji',        label: 'Pacific/Fiji — Fiji' },
        ],
    },
    {
        region: '🌍 Africa',
        timezones: [
            { value: 'Africa/Cairo',        label: 'Africa/Cairo — Egypt' },
            { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg — South Africa' },
            { value: 'Africa/Lagos',        label: 'Africa/Lagos — Nigeria' },
            { value: 'Africa/Nairobi',      label: 'Africa/Nairobi — Kenya' },
            { value: 'Africa/Casablanca',   label: 'Africa/Casablanca — Morocco' },
            { value: 'Africa/Accra',        label: 'Africa/Accra — Ghana' },
            { value: 'Africa/Addis_Ababa',  label: 'Africa/Addis_Ababa — Ethiopia' },
        ],
    },
    {
        region: '🌐 UTC',
        timezones: [{ value: 'UTC', label: 'UTC — Coordinated Universal Time' }],
    },
];

export const getTimezoneLabel = (value) => {
    for (const group of TIMEZONE_GROUPS) {
        const found = group.timezones.find((tz) => tz.value === value);
        if (found) return found.label;
    }
    return value || '';
};

/**
 * ✅ NEW: return TIMEZONE_GROUPS with the platform-configured timezone
 * promoted to the top of the list. Every consumer that renders a
 * timezone <select> should call this with
 * `useSettings().settings.default_timezone` so the dropdown follows
 * the deployment config instead of a hardcoded default.
 *
 * If the configured timezone isn't in the catalog (legacy value or a
 * typo on the settings page), it is prepended as a custom option so
 * the select can still represent it.
 */
export const getTimezoneGroups = (platformDefault) => {
    const preferred = (platformDefault || '').trim();
    if (!preferred) return TIMEZONE_GROUPS;

    // Check whether the configured timezone is already in the catalog.
    const inCatalog = TIMEZONE_GROUPS.some((group) =>
        group.timezones.some((tz) => tz.value === preferred),
    );

    if (!inCatalog) {
        return [
            {
                region: '⭐ Platform Default',
                timezones: [{ value: preferred, label: preferred }],
            },
            ...TIMEZONE_GROUPS,
        ];
    }

    // Move the preferred timezone to the top of its group and label
    // the group so the operator can spot it instantly.
    return TIMEZONE_GROUPS.map((group) => {
        const idx = group.timezones.findIndex((tz) => tz.value === preferred);
        if (idx === -1) return group;
        const preferredEntry = group.timezones[idx];
        const rest = group.timezones.filter((_, i) => i !== idx);
        return {
            ...group,
            timezones: [
                { ...preferredEntry, label: `⭐ ${preferredEntry.label}` },
                ...rest,
            ],
        };
    });
};