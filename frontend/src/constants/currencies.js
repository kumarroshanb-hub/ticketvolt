// shared/constants/currencies.js
//
// SINGLE SOURCE OF TRUTH for country → currency mapping.
//
// Anywhere the app needs to know "what is the currency of country X?"
// or "what is the default symbol for currency Y?", it MUST read from
// this file (frontend/gateway) or from the generated Python mirror at
// backend/ticket_bookings/data/currencies.py.
//
// Fields per entry:
//   countryCode  — ISO-3166-1 alpha-2 (e.g. 'HK')
//   countryName  — official English display name (matches UserProfile.country)
//   currencyCode — ISO-4217 (e.g. 'HKD')
//   currencyName — human label
//   symbol       — the display symbol (HK$, ₹, $, £, €, …)
//   locale       — BCP-47 locale used with Intl.NumberFormat
//   timezone     — default IANA timezone for the country
//
// Kept intentionally hand-curated (not derived from a package) so
// entries never change under us, and the symbol/spacing matches what
// the product wants to show.

export const COUNTRY_CURRENCIES = [
    // ---------------- Asia ----------------
    { countryCode: 'HK', countryName: 'Hong Kong',            currencyCode: 'HKD', currencyName: 'Hong Kong Dollar',       symbol: 'HK$',  locale: 'en-HK', timezone: 'Asia/Hong_Kong' },
    { countryCode: 'IN', countryName: 'India',                currencyCode: 'INR', currencyName: 'Indian Rupee',           symbol: '₹',    locale: 'en-IN', timezone: 'Asia/Kolkata' },
    { countryCode: 'SG', countryName: 'Singapore',            currencyCode: 'SGD', currencyName: 'Singapore Dollar',       symbol: 'S$',   locale: 'en-SG', timezone: 'Asia/Singapore' },
    { countryCode: 'MY', countryName: 'Malaysia',             currencyCode: 'MYR', currencyName: 'Malaysian Ringgit',      symbol: 'RM',   locale: 'en-MY', timezone: 'Asia/Kuala_Lumpur' },
    { countryCode: 'ID', countryName: 'Indonesia',            currencyCode: 'IDR', currencyName: 'Indonesian Rupiah',      symbol: 'Rp',   locale: 'id-ID', timezone: 'Asia/Jakarta' },
    { countryCode: 'TH', countryName: 'Thailand',             currencyCode: 'THB', currencyName: 'Thai Baht',              symbol: '฿',    locale: 'th-TH', timezone: 'Asia/Bangkok' },
    { countryCode: 'VN', countryName: 'Vietnam',              currencyCode: 'VND', currencyName: 'Vietnamese Dong',        symbol: '₫',    locale: 'vi-VN', timezone: 'Asia/Ho_Chi_Minh' },
    { countryCode: 'PH', countryName: 'Philippines',          currencyCode: 'PHP', currencyName: 'Philippine Peso',        symbol: '₱',    locale: 'en-PH', timezone: 'Asia/Manila' },
    { countryCode: 'CN', countryName: 'China',                currencyCode: 'CNY', currencyName: 'Chinese Yuan',           symbol: '¥',    locale: 'zh-CN', timezone: 'Asia/Shanghai' },
    { countryCode: 'TW', countryName: 'Taiwan',               currencyCode: 'TWD', currencyName: 'New Taiwan Dollar',      symbol: 'NT$',  locale: 'zh-TW', timezone: 'Asia/Taipei' },
    { countryCode: 'JP', countryName: 'Japan',                currencyCode: 'JPY', currencyName: 'Japanese Yen',           symbol: '¥',    locale: 'ja-JP', timezone: 'Asia/Tokyo' },
    { countryCode: 'KR', countryName: 'South Korea',          currencyCode: 'KRW', currencyName: 'South Korean Won',       symbol: '₩',    locale: 'ko-KR', timezone: 'Asia/Seoul' },
    { countryCode: 'PK', countryName: 'Pakistan',             currencyCode: 'PKR', currencyName: 'Pakistani Rupee',        symbol: '₨',    locale: 'en-PK', timezone: 'Asia/Karachi' },
    { countryCode: 'BD', countryName: 'Bangladesh',           currencyCode: 'BDT', currencyName: 'Bangladeshi Taka',       symbol: '৳',    locale: 'bn-BD', timezone: 'Asia/Dhaka' },
    { countryCode: 'LK', countryName: 'Sri Lanka',            currencyCode: 'LKR', currencyName: 'Sri Lankan Rupee',       symbol: 'Rs',   locale: 'en-LK', timezone: 'Asia/Colombo' },
    { countryCode: 'NP', countryName: 'Nepal',                currencyCode: 'NPR', currencyName: 'Nepalese Rupee',         symbol: 'Rs',   locale: 'ne-NP', timezone: 'Asia/Kathmandu' },
    { countryCode: 'MM', countryName: 'Myanmar',              currencyCode: 'MMK', currencyName: 'Myanmar Kyat',           symbol: 'K',    locale: 'my-MM', timezone: 'Asia/Yangon' },
    { countryCode: 'KH', countryName: 'Cambodia',             currencyCode: 'KHR', currencyName: 'Cambodian Riel',         symbol: '៛',    locale: 'km-KH', timezone: 'Asia/Phnom_Penh' },
    { countryCode: 'LA', countryName: 'Laos',                 currencyCode: 'LAK', currencyName: 'Lao Kip',                symbol: '₭',    locale: 'lo-LA', timezone: 'Asia/Vientiane' },
    { countryCode: 'MN', countryName: 'Mongolia',             currencyCode: 'MNT', currencyName: 'Mongolian Tögrög',       symbol: '₮',    locale: 'mn-MN', timezone: 'Asia/Ulaanbaatar' },
    { countryCode: 'AE', countryName: 'United Arab Emirates', currencyCode: 'AED', currencyName: 'UAE Dirham',             symbol: 'د.إ',  locale: 'en-AE', timezone: 'Asia/Dubai' },
    { countryCode: 'SA', countryName: 'Saudi Arabia',         currencyCode: 'SAR', currencyName: 'Saudi Riyal',            symbol: '﷼',    locale: 'ar-SA', timezone: 'Asia/Riyadh' },
    { countryCode: 'QA', countryName: 'Qatar',                currencyCode: 'QAR', currencyName: 'Qatari Riyal',           symbol: 'ر.ق',  locale: 'ar-QA', timezone: 'Asia/Qatar' },
    { countryCode: 'KW', countryName: 'Kuwait',               currencyCode: 'KWD', currencyName: 'Kuwaiti Dinar',          symbol: 'د.ك',  locale: 'ar-KW', timezone: 'Asia/Kuwait' },
    { countryCode: 'BH', countryName: 'Bahrain',              currencyCode: 'BHD', currencyName: 'Bahraini Dinar',         symbol: 'ب.د',  locale: 'ar-BH', timezone: 'Asia/Bahrain' },
    { countryCode: 'OM', countryName: 'Oman',                 currencyCode: 'OMR', currencyName: 'Omani Rial',             symbol: 'ر.ع.', locale: 'ar-OM', timezone: 'Asia/Muscat' },
    { countryCode: 'JO', countryName: 'Jordan',               currencyCode: 'JOD', currencyName: 'Jordanian Dinar',        symbol: 'د.ا',  locale: 'ar-JO', timezone: 'Asia/Amman' },
    { countryCode: 'IL', countryName: 'Israel',               currencyCode: 'ILS', currencyName: 'Israeli New Shekel',     symbol: '₪',    locale: 'he-IL', timezone: 'Asia/Jerusalem' },
    { countryCode: 'TR', countryName: 'Turkey',               currencyCode: 'TRY', currencyName: 'Turkish Lira',           symbol: '₺',    locale: 'tr-TR', timezone: 'Europe/Istanbul' },
    { countryCode: 'IR', countryName: 'Iran',                 currencyCode: 'IRR', currencyName: 'Iranian Rial',           symbol: '﷼',    locale: 'fa-IR', timezone: 'Asia/Tehran' },
    { countryCode: 'IQ', countryName: 'Iraq',                 currencyCode: 'IQD', currencyName: 'Iraqi Dinar',            symbol: 'ع.د',  locale: 'ar-IQ', timezone: 'Asia/Baghdad' },
    { countryCode: 'LB', countryName: 'Lebanon',              currencyCode: 'LBP', currencyName: 'Lebanese Pound',         symbol: 'ل.ل',  locale: 'ar-LB', timezone: 'Asia/Beirut' },
    { countryCode: 'AF', countryName: 'Afghanistan',          currencyCode: 'AFN', currencyName: 'Afghan Afghani',         symbol: '؋',    locale: 'fa-AF', timezone: 'Asia/Kabul' },
    { countryCode: 'KZ', countryName: 'Kazakhstan',           currencyCode: 'KZT', currencyName: 'Kazakhstani Tenge',      symbol: '₸',    locale: 'kk-KZ', timezone: 'Asia/Almaty' },
    { countryCode: 'UZ', countryName: 'Uzbekistan',           currencyCode: 'UZS', currencyName: 'Uzbekistani Som',        symbol: 'soʻm', locale: 'uz-UZ', timezone: 'Asia/Tashkent' },

    // ---------------- Europe ----------------
    { countryCode: 'GB', countryName: 'United Kingdom',       currencyCode: 'GBP', currencyName: 'British Pound',          symbol: '£',    locale: 'en-GB', timezone: 'Europe/London' },
    { countryCode: 'IE', countryName: 'Ireland',              currencyCode: 'EUR', currencyName: 'Euro',                   symbol: '€',    locale: 'en-IE', timezone: 'Europe/Dublin' },
    { countryCode: 'FR', countryName: 'France',               currencyCode: 'EUR', currencyName: 'Euro',                   symbol: '€',    locale: 'fr-FR', timezone: 'Europe/Paris' },
    { countryCode: 'DE', countryName: 'Germany',              currencyCode: 'EUR', currencyName: 'Euro',                   symbol: '€',    locale: 'de-DE', timezone: 'Europe/Berlin' },
    { countryCode: 'ES', countryName: 'Spain',                currencyCode: 'EUR', currencyName: 'Euro',                   symbol: '€',    locale: 'es-ES', timezone: 'Europe/Madrid' },
    { countryCode: 'IT', countryName: 'Italy',                currencyCode: 'EUR', currencyName: 'Euro',                   symbol: '€',    locale: 'it-IT', timezone: 'Europe/Rome' },
    { countryCode: 'PT', countryName: 'Portugal',             currencyCode: 'EUR', currencyName: 'Euro',                   symbol: '€',    locale: 'pt-PT', timezone: 'Europe/Lisbon' },
    { countryCode: 'NL', countryName: 'Netherlands',          currencyCode: 'EUR', currencyName: 'Euro',                   symbol: '€',    locale: 'nl-NL', timezone: 'Europe/Amsterdam' },
    { countryCode: 'BE', countryName: 'Belgium',              currencyCode: 'EUR', currencyName: 'Euro',                   symbol: '€',    locale: 'nl-BE', timezone: 'Europe/Brussels' },
    { countryCode: 'AT', countryName: 'Austria',              currencyCode: 'EUR', currencyName: 'Euro',                   symbol: '€',    locale: 'de-AT', timezone: 'Europe/Vienna' },
    { countryCode: 'CH', countryName: 'Switzerland',          currencyCode: 'CHF', currencyName: 'Swiss Franc',            symbol: 'CHF',  locale: 'de-CH', timezone: 'Europe/Zurich' },
    { countryCode: 'SE', countryName: 'Sweden',               currencyCode: 'SEK', currencyName: 'Swedish Krona',          symbol: 'kr',   locale: 'sv-SE', timezone: 'Europe/Stockholm' },
    { countryCode: 'NO', countryName: 'Norway',               currencyCode: 'NOK', currencyName: 'Norwegian Krone',        symbol: 'kr',   locale: 'nb-NO', timezone: 'Europe/Oslo' },
    { countryCode: 'DK', countryName: 'Denmark',              currencyCode: 'DKK', currencyName: 'Danish Krone',           symbol: 'kr',   locale: 'da-DK', timezone: 'Europe/Copenhagen' },
    { countryCode: 'FI', countryName: 'Finland',              currencyCode: 'EUR', currencyName: 'Euro',                   symbol: '€',    locale: 'fi-FI', timezone: 'Europe/Helsinki' },
    { countryCode: 'IS', countryName: 'Iceland',              currencyCode: 'ISK', currencyName: 'Icelandic Króna',        symbol: 'kr',   locale: 'is-IS', timezone: 'Atlantic/Reykjavik' },
    { countryCode: 'PL', countryName: 'Poland',               currencyCode: 'PLN', currencyName: 'Polish Złoty',           symbol: 'zł',   locale: 'pl-PL', timezone: 'Europe/Warsaw' },
    { countryCode: 'CZ', countryName: 'Czech Republic',       currencyCode: 'CZK', currencyName: 'Czech Koruna',           symbol: 'Kč',   locale: 'cs-CZ', timezone: 'Europe/Prague' },
    { countryCode: 'SK', countryName: 'Slovakia',             currencyCode: 'EUR', currencyName: 'Euro',                   symbol: '€',    locale: 'sk-SK', timezone: 'Europe/Bratislava' },
    { countryCode: 'HU', countryName: 'Hungary',              currencyCode: 'HUF', currencyName: 'Hungarian Forint',       symbol: 'Ft',   locale: 'hu-HU', timezone: 'Europe/Budapest' },
    { countryCode: 'RO', countryName: 'Romania',              currencyCode: 'RON', currencyName: 'Romanian Leu',           symbol: 'lei',  locale: 'ro-RO', timezone: 'Europe/Bucharest' },
    { countryCode: 'BG', countryName: 'Bulgaria',             currencyCode: 'BGN', currencyName: 'Bulgarian Lev',          symbol: 'лв',   locale: 'bg-BG', timezone: 'Europe/Sofia' },
    { countryCode: 'GR', countryName: 'Greece',               currencyCode: 'EUR', currencyName: 'Euro',                   symbol: '€',    locale: 'el-GR', timezone: 'Europe/Athens' },
    { countryCode: 'HR', countryName: 'Croatia',              currencyCode: 'EUR', currencyName: 'Euro',                   symbol: '€',    locale: 'hr-HR', timezone: 'Europe/Zagreb' },
    { countryCode: 'SI', countryName: 'Slovenia',             currencyCode: 'EUR', currencyName: 'Euro',                   symbol: '€',    locale: 'sl-SI', timezone: 'Europe/Ljubljana' },
    { countryCode: 'RS', countryName: 'Serbia',               currencyCode: 'RSD', currencyName: 'Serbian Dinar',          symbol: 'дин',  locale: 'sr-RS', timezone: 'Europe/Belgrade' },
    { countryCode: 'UA', countryName: 'Ukraine',              currencyCode: 'UAH', currencyName: 'Ukrainian Hryvnia',      symbol: '₴',    locale: 'uk-UA', timezone: 'Europe/Kyiv' },
    { countryCode: 'RU', countryName: 'Russia',               currencyCode: 'RUB', currencyName: 'Russian Ruble',          symbol: '₽',    locale: 'ru-RU', timezone: 'Europe/Moscow' },
    { countryCode: 'LT', countryName: 'Lithuania',            currencyCode: 'EUR', currencyName: 'Euro',                   symbol: '€',    locale: 'lt-LT', timezone: 'Europe/Vilnius' },
    { countryCode: 'LV', countryName: 'Latvia',               currencyCode: 'EUR', currencyName: 'Euro',                   symbol: '€',    locale: 'lv-LV', timezone: 'Europe/Riga' },
    { countryCode: 'EE', countryName: 'Estonia',              currencyCode: 'EUR', currencyName: 'Euro',                   symbol: '€',    locale: 'et-EE', timezone: 'Europe/Tallinn' },
    { countryCode: 'LU', countryName: 'Luxembourg',           currencyCode: 'EUR', currencyName: 'Euro',                   symbol: '€',    locale: 'fr-LU', timezone: 'Europe/Luxembourg' },
    { countryCode: 'MT', countryName: 'Malta',                currencyCode: 'EUR', currencyName: 'Euro',                   symbol: '€',    locale: 'mt-MT', timezone: 'Europe/Malta' },
    { countryCode: 'CY', countryName: 'Cyprus',               currencyCode: 'EUR', currencyName: 'Euro',                   symbol: '€',    locale: 'el-CY', timezone: 'Asia/Nicosia' },

    // ---------------- Americas ----------------
    { countryCode: 'US', countryName: 'United States',        currencyCode: 'USD', currencyName: 'US Dollar',              symbol: '$',    locale: 'en-US', timezone: 'America/New_York' },
    { countryCode: 'CA', countryName: 'Canada',               currencyCode: 'CAD', currencyName: 'Canadian Dollar',         symbol: 'C$',   locale: 'en-CA', timezone: 'America/Toronto' },
    { countryCode: 'MX', countryName: 'Mexico',               currencyCode: 'MXN', currencyName: 'Mexican Peso',            symbol: 'Mex$', locale: 'es-MX', timezone: 'America/Mexico_City' },
    { countryCode: 'BR', countryName: 'Brazil',               currencyCode: 'BRL', currencyName: 'Brazilian Real',          symbol: 'R$',   locale: 'pt-BR', timezone: 'America/Sao_Paulo' },
    { countryCode: 'AR', countryName: 'Argentina',            currencyCode: 'ARS', currencyName: 'Argentine Peso',         symbol: 'AR$',  locale: 'es-AR', timezone: 'America/Argentina/Buenos_Aires' },
    { countryCode: 'CL', countryName: 'Chile',                currencyCode: 'CLP', currencyName: 'Chilean Peso',           symbol: 'CLP$', locale: 'es-CL', timezone: 'America/Santiago' },
    { countryCode: 'CO', countryName: 'Colombia',             currencyCode: 'COP', currencyName: 'Colombian Peso',         symbol: 'COL$', locale: 'es-CO', timezone: 'America/Bogota' },
    { countryCode: 'PE', countryName: 'Peru',                 currencyCode: 'PEN', currencyName: 'Peruvian Sol',           symbol: 'S/',   locale: 'es-PE', timezone: 'America/Lima' },
    { countryCode: 'VE', countryName: 'Venezuela',            currencyCode: 'VES', currencyName: 'Venezuelan Bolívar',     symbol: 'Bs.',  locale: 'es-VE', timezone: 'America/Caracas' },
    { countryCode: 'EC', countryName: 'Ecuador',              currencyCode: 'USD', currencyName: 'US Dollar',              symbol: '$',    locale: 'es-EC', timezone: 'America/Guayaquil' },
    { countryCode: 'UY', countryName: 'Uruguay',              currencyCode: 'UYU', currencyName: 'Uruguayan Peso',         symbol: '$U',   locale: 'es-UY', timezone: 'America/Montevideo' },
    { countryCode: 'PA', countryName: 'Panama',               currencyCode: 'PAB', currencyName: 'Panamanian Balboa',      symbol: 'B/.',  locale: 'es-PA', timezone: 'America/Panama' },
    { countryCode: 'CR', countryName: 'Costa Rica',           currencyCode: 'CRC', currencyName: 'Costa Rican Colón',      symbol: '₡',    locale: 'es-CR', timezone: 'America/Costa_Rica' },
    { countryCode: 'GT', countryName: 'Guatemala',            currencyCode: 'GTQ', currencyName: 'Guatemalan Quetzal',     symbol: 'Q',    locale: 'es-GT', timezone: 'America/Guatemala' },
    { countryCode: 'DO', countryName: 'Dominican Republic',   currencyCode: 'DOP', currencyName: 'Dominican Peso',         symbol: 'RD$',  locale: 'es-DO', timezone: 'America/Santo_Domingo' },
    { countryCode: 'JM', countryName: 'Jamaica',              currencyCode: 'JMD', currencyName: 'Jamaican Dollar',        symbol: 'J$',   locale: 'en-JM', timezone: 'America/Jamaica' },
    { countryCode: 'TT', countryName: 'Trinidad and Tobago',  currencyCode: 'TTD', currencyName: 'Trinidad and Tobago Dollar', symbol: 'TT$', locale: 'en-TT', timezone: 'America/Port_of_Spain' },
    { countryCode: 'BS', countryName: 'Bahamas',              currencyCode: 'BSD', currencyName: 'Bahamian Dollar',        symbol: 'B$',   locale: 'en-BS', timezone: 'America/Nassau' },

    // ---------------- Oceania ----------------
    { countryCode: 'AU', countryName: 'Australia',            currencyCode: 'AUD', currencyName: 'Australian Dollar',       symbol: 'A$',   locale: 'en-AU', timezone: 'Australia/Sydney' },
    { countryCode: 'NZ', countryName: 'New Zealand',          currencyCode: 'NZD', currencyName: 'New Zealand Dollar',     symbol: 'NZ$',  locale: 'en-NZ', timezone: 'Pacific/Auckland' },
    { countryCode: 'FJ', countryName: 'Fiji',                 currencyCode: 'FJD', currencyName: 'Fijian Dollar',          symbol: 'FJ$',  locale: 'en-FJ', timezone: 'Pacific/Fiji' },
    { countryCode: 'PG', countryName: 'Papua New Guinea',     currencyCode: 'PGK', currencyName: 'Papua New Guinean Kina', symbol: 'K',    locale: 'en-PG', timezone: 'Pacific/Port_Moresby' },

    // ---------------- Africa ----------------
    { countryCode: 'ZA', countryName: 'South Africa',         currencyCode: 'ZAR', currencyName: 'South African Rand',      symbol: 'R',    locale: 'en-ZA', timezone: 'Africa/Johannesburg' },
    { countryCode: 'NG', countryName: 'Nigeria',              currencyCode: 'NGN', currencyName: 'Nigerian Naira',         symbol: '₦',    locale: 'en-NG', timezone: 'Africa/Lagos' },
    { countryCode: 'KE', countryName: 'Kenya',                currencyCode: 'KES', currencyName: 'Kenyan Shilling',        symbol: 'KSh',  locale: 'en-KE', timezone: 'Africa/Nairobi' },
    { countryCode: 'EG', countryName: 'Egypt',                currencyCode: 'EGP', currencyName: 'Egyptian Pound',         symbol: 'E£',   locale: 'ar-EG', timezone: 'Africa/Cairo' },
    { countryCode: 'MA', countryName: 'Morocco',              currencyCode: 'MAD', currencyName: 'Moroccan Dirham',        symbol: 'DH',   locale: 'ar-MA', timezone: 'Africa/Casablanca' },
    { countryCode: 'TN', countryName: 'Tunisia',              currencyCode: 'TND', currencyName: 'Tunisian Dinar',         symbol: 'د.ت',  locale: 'ar-TN', timezone: 'Africa/Tunis' },
    { countryCode: 'DZ', countryName: 'Algeria',              currencyCode: 'DZD', currencyName: 'Algerian Dinar',         symbol: 'د.ج',  locale: 'ar-DZ', timezone: 'Africa/Algiers' },
    { countryCode: 'GH', countryName: 'Ghana',                currencyCode: 'GHS', currencyName: 'Ghanaian Cedi',          symbol: '₵',    locale: 'en-GH', timezone: 'Africa/Accra' },
    { countryCode: 'TZ', countryName: 'Tanzania',             currencyCode: 'TZS', currencyName: 'Tanzanian Shilling',     symbol: 'TSh',  locale: 'en-TZ', timezone: 'Africa/Dar_es_Salaam' },
    { countryCode: 'UG', countryName: 'Uganda',               currencyCode: 'UGX', currencyName: 'Ugandan Shilling',       symbol: 'USh',  locale: 'en-UG', timezone: 'Africa/Kampala' },
    { countryCode: 'ET', countryName: 'Ethiopia',             currencyCode: 'ETB', currencyName: 'Ethiopian Birr',         symbol: 'Br',   locale: 'am-ET', timezone: 'Africa/Addis_Ababa' },
    { countryCode: 'ZW', countryName: 'Zimbabwe',             currencyCode: 'USD', currencyName: 'US Dollar',              symbol: '$',    locale: 'en-ZW', timezone: 'Africa/Harare' },
    { countryCode: 'MU', countryName: 'Mauritius',            currencyCode: 'MUR', currencyName: 'Mauritian Rupee',        symbol: '₨',    locale: 'en-MU', timezone: 'Indian/Mauritius' },
    { countryCode: 'SN', countryName: 'Senegal',              currencyCode: 'XOF', currencyName: 'West African CFA Franc', symbol: 'CFA',  locale: 'fr-SN', timezone: 'Africa/Dakar' },
    { countryCode: 'CI', countryName: 'Ivory Coast',          currencyCode: 'XOF', currencyName: 'West African CFA Franc', symbol: 'CFA',  locale: 'fr-CI', timezone: 'Africa/Abidjan' },
    { countryCode: 'CM', countryName: 'Cameroon',             currencyCode: 'XAF', currencyName: 'Central African CFA Franc', symbol: 'FCFA', locale: 'fr-CM', timezone: 'Africa/Douala' },
];

// ---------------------------------------------------------------------
// Lookup helpers (used by frontend and by the mirror generator)
// ---------------------------------------------------------------------

export const CURRENCY_CODES = [
    ...new Set(COUNTRY_CURRENCIES.map((c) => c.currencyCode)),
].sort();

export const COUNTRY_NAMES = COUNTRY_CURRENCIES
    .map((c) => c.countryName)
    .sort((a, b) => a.localeCompare(b));

export function getCountryConfig(countryName) {
    if (!countryName) return null;
    const target = String(countryName).trim().toLowerCase();
    return COUNTRY_CURRENCIES.find((c) => c.countryName.toLowerCase() === target) || null;
}

export function getCountryByCode(code) {
    if (!code) return null;
    const target = String(code).trim().toUpperCase();
    return COUNTRY_CURRENCIES.find((c) => c.countryCode === target) || null;
}

export function getCurrencyConfig(currencyCode) {
    if (!currencyCode) return null;
    const target = String(currencyCode).trim().toUpperCase();
    return COUNTRY_CURRENCIES.find((c) => c.currencyCode === target) || null;
}

export function getDefaultCurrencyForCountry(countryName) {
    const c = getCountryConfig(countryName);
    return c ? c.currencyCode : 'USD';
}

export const FALLBACK_CURRENCY = {
    countryCode: 'US',
    countryName: 'United States',
    currencyCode: 'USD',
    currencyName: 'US Dollar',
    symbol: '$',
    locale: 'en-US',
    timezone: 'America/New_York',
};

export default {
    COUNTRY_CURRENCIES,
    CURRENCY_CODES,
    COUNTRY_NAMES,
    getCountryConfig,
    getCountryByCode,
    getCurrencyConfig,
    getDefaultCurrencyForCountry,
    FALLBACK_CURRENCY,
};