# backend/ticket_bookings/data/currencies.py
#
# AUTO-GENERATED from shared/constants/currencies.js
# Regenerate with: python scripts/gen_currencies.py
# Do not hand-edit.

COUNTRY_CURRENCIES = [
    # Asia
    {'country_code': 'HK', 'country_name': 'Hong Kong',            'currency_code': 'HKD', 'currency_name': 'Hong Kong Dollar',       'symbol': 'HK$',  'locale': 'en-HK', 'timezone': 'Asia/Hong_Kong'},
    {'country_code': 'IN', 'country_name': 'India',                'currency_code': 'INR', 'currency_name': 'Indian Rupee',           'symbol': '₹',    'locale': 'en-IN', 'timezone': 'Asia/Kolkata'},
    {'country_code': 'SG', 'country_name': 'Singapore',            'currency_code': 'SGD', 'currency_name': 'Singapore Dollar',       'symbol': 'S$',   'locale': 'en-SG', 'timezone': 'Asia/Singapore'},
    {'country_code': 'MY', 'country_name': 'Malaysia',             'currency_code': 'MYR', 'currency_name': 'Malaysian Ringgit',      'symbol': 'RM',   'locale': 'en-MY', 'timezone': 'Asia/Kuala_Lumpur'},
    {'country_code': 'ID', 'country_name': 'Indonesia',            'currency_code': 'IDR', 'currency_name': 'Indonesian Rupiah',      'symbol': 'Rp',   'locale': 'id-ID', 'timezone': 'Asia/Jakarta'},
    {'country_code': 'TH', 'country_name': 'Thailand',             'currency_code': 'THB', 'currency_name': 'Thai Baht',              'symbol': '฿',    'locale': 'th-TH', 'timezone': 'Asia/Bangkok'},
    {'country_code': 'VN', 'country_name': 'Vietnam',              'currency_code': 'VND', 'currency_name': 'Vietnamese Dong',        'symbol': '₫',    'locale': 'vi-VN', 'timezone': 'Asia/Ho_Chi_Minh'},
    {'country_code': 'PH', 'country_name': 'Philippines',          'currency_code': 'PHP', 'currency_name': 'Philippine Peso',        'symbol': '₱',    'locale': 'en-PH', 'timezone': 'Asia/Manila'},
    {'country_code': 'CN', 'country_name': 'China',                'currency_code': 'CNY', 'currency_name': 'Chinese Yuan',           'symbol': '¥',    'locale': 'zh-CN', 'timezone': 'Asia/Shanghai'},
    {'country_code': 'TW', 'country_name': 'Taiwan',               'currency_code': 'TWD', 'currency_name': 'New Taiwan Dollar',      'symbol': 'NT$',  'locale': 'zh-TW', 'timezone': 'Asia/Taipei'},
    {'country_code': 'JP', 'country_name': 'Japan',                'currency_code': 'JPY', 'currency_name': 'Japanese Yen',           'symbol': '¥',    'locale': 'ja-JP', 'timezone': 'Asia/Tokyo'},
    {'country_code': 'KR', 'country_name': 'South Korea',          'currency_code': 'KRW', 'currency_name': 'South Korean Won',       'symbol': '₩',    'locale': 'ko-KR', 'timezone': 'Asia/Seoul'},
    {'country_code': 'PK', 'country_name': 'Pakistan',             'currency_code': 'PKR', 'currency_name': 'Pakistani Rupee',        'symbol': '₨',    'locale': 'en-PK', 'timezone': 'Asia/Karachi'},
    {'country_code': 'BD', 'country_name': 'Bangladesh',           'currency_code': 'BDT', 'currency_name': 'Bangladeshi Taka',       'symbol': '৳',    'locale': 'bn-BD', 'timezone': 'Asia/Dhaka'},
    {'country_code': 'LK', 'country_name': 'Sri Lanka',            'currency_code': 'LKR', 'currency_name': 'Sri Lankan Rupee',       'symbol': 'Rs',   'locale': 'en-LK', 'timezone': 'Asia/Colombo'},
    {'country_code': 'NP', 'country_name': 'Nepal',                'currency_code': 'NPR', 'currency_name': 'Nepalese Rupee',         'symbol': 'Rs',   'locale': 'ne-NP', 'timezone': 'Asia/Kathmandu'},
    {'country_code': 'MM', 'country_name': 'Myanmar',              'currency_code': 'MMK', 'currency_name': 'Myanmar Kyat',           'symbol': 'K',    'locale': 'my-MM', 'timezone': 'Asia/Yangon'},
    {'country_code': 'KH', 'country_name': 'Cambodia',             'currency_code': 'KHR', 'currency_name': 'Cambodian Riel',         'symbol': '៛',    'locale': 'km-KH', 'timezone': 'Asia/Phnom_Penh'},
    {'country_code': 'LA', 'country_name': 'Laos',                 'currency_code': 'LAK', 'currency_name': 'Lao Kip',                'symbol': '₭',    'locale': 'lo-LA', 'timezone': 'Asia/Vientiane'},
    {'country_code': 'MN', 'country_name': 'Mongolia',             'currency_code': 'MNT', 'currency_name': 'Mongolian Tögrög',       'symbol': '₮',    'locale': 'mn-MN', 'timezone': 'Asia/Ulaanbaatar'},
    {'country_code': 'AE', 'country_name': 'United Arab Emirates', 'currency_code': 'AED', 'currency_name': 'UAE Dirham',             'symbol': 'د.إ',  'locale': 'en-AE', 'timezone': 'Asia/Dubai'},
    {'country_code': 'SA', 'country_name': 'Saudi Arabia',         'currency_code': 'SAR', 'currency_name': 'Saudi Riyal',            'symbol': '﷼',    'locale': 'ar-SA', 'timezone': 'Asia/Riyadh'},
    {'country_code': 'QA', 'country_name': 'Qatar',                'currency_code': 'QAR', 'currency_name': 'Qatari Riyal',           'symbol': 'ر.ق',  'locale': 'ar-QA', 'timezone': 'Asia/Qatar'},
    {'country_code': 'KW', 'country_name': 'Kuwait',               'currency_code': 'KWD', 'currency_name': 'Kuwaiti Dinar',          'symbol': 'د.ك',  'locale': 'ar-KW', 'timezone': 'Asia/Kuwait'},
    {'country_code': 'BH', 'country_name': 'Bahrain',              'currency_code': 'BHD', 'currency_name': 'Bahraini Dinar',         'symbol': 'ب.د',  'locale': 'ar-BH', 'timezone': 'Asia/Bahrain'},
    {'country_code': 'OM', 'country_name': 'Oman',                 'currency_code': 'OMR', 'currency_name': 'Omani Rial',             'symbol': 'ر.ع.', 'locale': 'ar-OM', 'timezone': 'Asia/Muscat'},
    {'country_code': 'JO', 'country_name': 'Jordan',               'currency_code': 'JOD', 'currency_name': 'Jordanian Dinar',        'symbol': 'د.ا',  'locale': 'ar-JO', 'timezone': 'Asia/Amman'},
    {'country_code': 'IL', 'country_name': 'Israel',               'currency_code': 'ILS', 'currency_name': 'Israeli New Shekel',     'symbol': '₪',    'locale': 'he-IL', 'timezone': 'Asia/Jerusalem'},
    {'country_code': 'TR', 'country_name': 'Turkey',               'currency_code': 'TRY', 'currency_name': 'Turkish Lira',           'symbol': '₺',    'locale': 'tr-TR', 'timezone': 'Europe/Istanbul'},
    {'country_code': 'IR', 'country_name': 'Iran',                 'currency_code': 'IRR', 'currency_name': 'Iranian Rial',           'symbol': '﷼',    'locale': 'fa-IR', 'timezone': 'Asia/Tehran'},
    {'country_code': 'IQ', 'country_name': 'Iraq',                 'currency_code': 'IQD', 'currency_name': 'Iraqi Dinar',            'symbol': 'ع.د',  'locale': 'ar-IQ', 'timezone': 'Asia/Baghdad'},
    {'country_code': 'LB', 'country_name': 'Lebanon',              'currency_code': 'LBP', 'currency_name': 'Lebanese Pound',         'symbol': 'ل.ل',  'locale': 'ar-LB', 'timezone': 'Asia/Beirut'},
    {'country_code': 'AF', 'country_name': 'Afghanistan',          'currency_code': 'AFN', 'currency_name': 'Afghan Afghani',         'symbol': '؋',    'locale': 'fa-AF', 'timezone': 'Asia/Kabul'},
    {'country_code': 'KZ', 'country_name': 'Kazakhstan',           'currency_code': 'KZT', 'currency_name': 'Kazakhstani Tenge',      'symbol': '₸',    'locale': 'kk-KZ', 'timezone': 'Asia/Almaty'},
    {'country_code': 'UZ', 'country_name': 'Uzbekistan',           'currency_code': 'UZS', 'currency_name': 'Uzbekistani Som',        'symbol': 'soʻm', 'locale': 'uz-UZ', 'timezone': 'Asia/Tashkent'},

    # Europe
    {'country_code': 'GB', 'country_name': 'United Kingdom',       'currency_code': 'GBP', 'currency_name': 'British Pound',          'symbol': '£',    'locale': 'en-GB', 'timezone': 'Europe/London'},
    {'country_code': 'IE', 'country_name': 'Ireland',              'currency_code': 'EUR', 'currency_name': 'Euro',                   'symbol': '€',    'locale': 'en-IE', 'timezone': 'Europe/Dublin'},
    {'country_code': 'FR', 'country_name': 'France',               'currency_code': 'EUR', 'currency_name': 'Euro',                   'symbol': '€',    'locale': 'fr-FR', 'timezone': 'Europe/Paris'},
    {'country_code': 'DE', 'country_name': 'Germany',              'currency_code': 'EUR', 'currency_name': 'Euro',                   'symbol': '€',    'locale': 'de-DE', 'timezone': 'Europe/Berlin'},
    {'country_code': 'ES', 'country_name': 'Spain',                'currency_code': 'EUR', 'currency_name': 'Euro',                   'symbol': '€',    'locale': 'es-ES', 'timezone': 'Europe/Madrid'},
    {'country_code': 'IT', 'country_name': 'Italy',                'currency_code': 'EUR', 'currency_name': 'Euro',                   'symbol': '€',    'locale': 'it-IT', 'timezone': 'Europe/Rome'},
    {'country_code': 'PT', 'country_name': 'Portugal',             'currency_code': 'EUR', 'currency_name': 'Euro',                   'symbol': '€',    'locale': 'pt-PT', 'timezone': 'Europe/Lisbon'},
    {'country_code': 'NL', 'country_name': 'Netherlands',          'currency_code': 'EUR', 'currency_name': 'Euro',                   'symbol': '€',    'locale': 'nl-NL', 'timezone': 'Europe/Amsterdam'},
    {'country_code': 'BE', 'country_name': 'Belgium',              'currency_code': 'EUR', 'currency_name': 'Euro',                   'symbol': '€',    'locale': 'nl-BE', 'timezone': 'Europe/Brussels'},
    {'country_code': 'AT', 'country_name': 'Austria',              'currency_code': 'EUR', 'currency_name': 'Euro',                   'symbol': '€',    'locale': 'de-AT', 'timezone': 'Europe/Vienna'},
    {'country_code': 'CH', 'country_name': 'Switzerland',          'currency_code': 'CHF', 'currency_name': 'Swiss Franc',            'symbol': 'CHF',  'locale': 'de-CH', 'timezone': 'Europe/Zurich'},
    {'country_code': 'SE', 'country_name': 'Sweden',               'currency_code': 'SEK', 'currency_name': 'Swedish Krona',          'symbol': 'kr',   'locale': 'sv-SE', 'timezone': 'Europe/Stockholm'},
    {'country_code': 'NO', 'country_name': 'Norway',               'currency_code': 'NOK', 'currency_name': 'Norwegian Krone',        'symbol': 'kr',   'locale': 'nb-NO', 'timezone': 'Europe/Oslo'},
    {'country_code': 'DK', 'country_name': 'Denmark',              'currency_code': 'DKK', 'currency_name': 'Danish Krone',           'symbol': 'kr',   'locale': 'da-DK', 'timezone': 'Europe/Copenhagen'},
    {'country_code': 'FI', 'country_name': 'Finland',              'currency_code': 'EUR', 'currency_name': 'Euro',                   'symbol': '€',    'locale': 'fi-FI', 'timezone': 'Europe/Helsinki'},
    {'country_code': 'IS', 'country_name': 'Iceland',              'currency_code': 'ISK', 'currency_name': 'Icelandic Króna',        'symbol': 'kr',   'locale': 'is-IS', 'timezone': 'Atlantic/Reykjavik'},
    {'country_code': 'PL', 'country_name': 'Poland',               'currency_code': 'PLN', 'currency_name': 'Polish Złoty',           'symbol': 'zł',   'locale': 'pl-PL', 'timezone': 'Europe/Warsaw'},
    {'country_code': 'CZ', 'country_name': 'Czech Republic',       'currency_code': 'CZK', 'currency_name': 'Czech Koruna',           'symbol': 'Kč',   'locale': 'cs-CZ', 'timezone': 'Europe/Prague'},
    {'country_code': 'SK', 'country_name': 'Slovakia',             'currency_code': 'EUR', 'currency_name': 'Euro',                   'symbol': '€',    'locale': 'sk-SK', 'timezone': 'Europe/Bratislava'},
    {'country_code': 'HU', 'country_name': 'Hungary',              'currency_code': 'HUF', 'currency_name': 'Hungarian Forint',       'symbol': 'Ft',   'locale': 'hu-HU', 'timezone': 'Europe/Budapest'},
    {'country_code': 'RO', 'country_name': 'Romania',              'currency_code': 'RON', 'currency_name': 'Romanian Leu',           'symbol': 'lei',  'locale': 'ro-RO', 'timezone': 'Europe/Bucharest'},
    {'country_code': 'BG', 'country_name': 'Bulgaria',             'currency_code': 'BGN', 'currency_name': 'Bulgarian Lev',          'symbol': 'лв',   'locale': 'bg-BG', 'timezone': 'Europe/Sofia'},
    {'country_code': 'GR', 'country_name': 'Greece',               'currency_code': 'EUR', 'currency_name': 'Euro',                   'symbol': '€',    'locale': 'el-GR', 'timezone': 'Europe/Athens'},
    {'country_code': 'HR', 'country_name': 'Croatia',              'currency_code': 'EUR', 'currency_name': 'Euro',                   'symbol': '€',    'locale': 'hr-HR', 'timezone': 'Europe/Zagreb'},
    {'country_code': 'SI', 'country_name': 'Slovenia',             'currency_code': 'EUR', 'currency_name': 'Euro',                   'symbol': '€',    'locale': 'sl-SI', 'timezone': 'Europe/Ljubljana'},
    {'country_code': 'RS', 'country_name': 'Serbia',               'currency_code': 'RSD', 'currency_name': 'Serbian Dinar',          'symbol': 'дин',  'locale': 'sr-RS', 'timezone': 'Europe/Belgrade'},
    {'country_code': 'UA', 'country_name': 'Ukraine',              'currency_code': 'UAH', 'currency_name': 'Ukrainian Hryvnia',      'symbol': '₴',    'locale': 'uk-UA', 'timezone': 'Europe/Kyiv'},
    {'country_code': 'RU', 'country_name': 'Russia',               'currency_code': 'RUB', 'currency_name': 'Russian Ruble',          'symbol': '₽',    'locale': 'ru-RU', 'timezone': 'Europe/Moscow'},
    {'country_code': 'LT', 'country_name': 'Lithuania',            'currency_code': 'EUR', 'currency_name': 'Euro',                   'symbol': '€',    'locale': 'lt-LT', 'timezone': 'Europe/Vilnius'},
    {'country_code': 'LV', 'country_name': 'Latvia',               'currency_code': 'EUR', 'currency_name': 'Euro',                   'symbol': '€',    'locale': 'lv-LV', 'timezone': 'Europe/Riga'},
    {'country_code': 'EE', 'country_name': 'Estonia',              'currency_code': 'EUR', 'currency_name': 'Euro',                   'symbol': '€',    'locale': 'et-EE', 'timezone': 'Europe/Tallinn'},
    {'country_code': 'LU', 'country_name': 'Luxembourg',           'currency_code': 'EUR', 'currency_name': 'Euro',                   'symbol': '€',    'locale': 'fr-LU', 'timezone': 'Europe/Luxembourg'},
    {'country_code': 'MT', 'country_name': 'Malta',                'currency_code': 'EUR', 'currency_name': 'Euro',                   'symbol': '€',    'locale': 'mt-MT', 'timezone': 'Europe/Malta'},
    {'country_code': 'CY', 'country_name': 'Cyprus',               'currency_code': 'EUR', 'currency_name': 'Euro',                   'symbol': '€',    'locale': 'el-CY', 'timezone': 'Asia/Nicosia'},

    # Americas
    {'country_code': 'US', 'country_name': 'United States',        'currency_code': 'USD', 'currency_name': 'US Dollar',              'symbol': '$',    'locale': 'en-US', 'timezone': 'America/New_York'},
    {'country_code': 'CA', 'country_name': 'Canada',               'currency_code': 'CAD', 'currency_name': 'Canadian Dollar',         'symbol': 'C$',   'locale': 'en-CA', 'timezone': 'America/Toronto'},
    {'country_code': 'MX', 'country_name': 'Mexico',               'currency_code': 'MXN', 'currency_name': 'Mexican Peso',            'symbol': 'Mex$', 'locale': 'es-MX', 'timezone': 'America/Mexico_City'},
    {'country_code': 'BR', 'country_name': 'Brazil',               'currency_code': 'BRL', 'currency_name': 'Brazilian Real',          'symbol': 'R$',   'locale': 'pt-BR', 'timezone': 'America/Sao_Paulo'},
    {'country_code': 'AR', 'country_name': 'Argentina',            'currency_code': 'ARS', 'currency_name': 'Argentine Peso',         'symbol': 'AR$',  'locale': 'es-AR', 'timezone': 'America/Argentina/Buenos_Aires'},
    {'country_code': 'CL', 'country_name': 'Chile',                'currency_code': 'CLP', 'currency_name': 'Chilean Peso',           'symbol': 'CLP$', 'locale': 'es-CL', 'timezone': 'America/Santiago'},
    {'country_code': 'CO', 'country_name': 'Colombia',             'currency_code': 'COP', 'currency_name': 'Colombian Peso',         'symbol': 'COL$', 'locale': 'es-CO', 'timezone': 'America/Bogota'},
    {'country_code': 'PE', 'country_name': 'Peru',                 'currency_code': 'PEN', 'currency_name': 'Peruvian Sol',           'symbol': 'S/',   'locale': 'es-PE', 'timezone': 'America/Lima'},
    {'country_code': 'VE', 'country_name': 'Venezuela',            'currency_code': 'VES', 'currency_name': 'Venezuelan Bolívar',     'symbol': 'Bs.',  'locale': 'es-VE', 'timezone': 'America/Caracas'},
    {'country_code': 'EC', 'country_name': 'Ecuador',              'currency_code': 'USD', 'currency_name': 'US Dollar',              'symbol': '$',    'locale': 'es-EC', 'timezone': 'America/Guayaquil'},
    {'country_code': 'UY', 'country_name': 'Uruguay',              'currency_code': 'UYU', 'currency_name': 'Uruguayan Peso',         'symbol': '$U',   'locale': 'es-UY', 'timezone': 'America/Montevideo'},
    {'country_code': 'PA', 'country_name': 'Panama',               'currency_code': 'PAB', 'currency_name': 'Panamanian Balboa',      'symbol': 'B/.',  'locale': 'es-PA', 'timezone': 'America/Panama'},
    {'country_code': 'CR', 'country_name': 'Costa Rica',           'currency_code': 'CRC', 'currency_name': 'Costa Rican Colón',      'symbol': '₡',    'locale': 'es-CR', 'timezone': 'America/Costa_Rica'},
    {'country_code': 'GT', 'country_name': 'Guatemala',            'currency_code': 'GTQ', 'currency_name': 'Guatemalan Quetzal',     'symbol': 'Q',    'locale': 'es-GT', 'timezone': 'America/Guatemala'},
    {'country_code': 'DO', 'country_name': 'Dominican Republic',   'currency_code': 'DOP', 'currency_name': 'Dominican Peso',         'symbol': 'RD$',  'locale': 'es-DO', 'timezone': 'America/Santo_Domingo'},
    {'country_code': 'JM', 'country_name': 'Jamaica',              'currency_code': 'JMD', 'currency_name': 'Jamaican Dollar',        'symbol': 'J$',   'locale': 'en-JM', 'timezone': 'America/Jamaica'},
    {'country_code': 'TT', 'country_name': 'Trinidad and Tobago',  'currency_code': 'TTD', 'currency_name': 'Trinidad and Tobago Dollar', 'symbol': 'TT$', 'locale': 'en-TT', 'timezone': 'America/Port_of_Spain'},
    {'country_code': 'BS', 'country_name': 'Bahamas',              'currency_code': 'BSD', 'currency_name': 'Bahamian Dollar',        'symbol': 'B$',   'locale': 'en-BS', 'timezone': 'America/Nassau'},

    # Oceania
    {'country_code': 'AU', 'country_name': 'Australia',            'currency_code': 'AUD', 'currency_name': 'Australian Dollar',       'symbol': 'A$',   'locale': 'en-AU', 'timezone': 'Australia/Sydney'},
    {'country_code': 'NZ', 'country_name': 'New Zealand',          'currency_code': 'NZD', 'currency_name': 'New Zealand Dollar',     'symbol': 'NZ$',  'locale': 'en-NZ', 'timezone': 'Pacific/Auckland'},
    {'country_code': 'FJ', 'country_name': 'Fiji',                 'currency_code': 'FJD', 'currency_name': 'Fijian Dollar',          'symbol': 'FJ$',  'locale': 'en-FJ', 'timezone': 'Pacific/Fiji'},
    {'country_code': 'PG', 'country_name': 'Papua New Guinea',     'currency_code': 'PGK', 'currency_name': 'Papua New Guinean Kina', 'symbol': 'K',    'locale': 'en-PG', 'timezone': 'Pacific/Port_Moresby'},

    # Africa
    {'country_code': 'ZA', 'country_name': 'South Africa',         'currency_code': 'ZAR', 'currency_name': 'South African Rand',      'symbol': 'R',    'locale': 'en-ZA', 'timezone': 'Africa/Johannesburg'},
    {'country_code': 'NG', 'country_name': 'Nigeria',              'currency_code': 'NGN', 'currency_name': 'Nigerian Naira',         'symbol': '₦',    'locale': 'en-NG', 'timezone': 'Africa/Lagos'},
    {'country_code': 'KE', 'country_name': 'Kenya',                'currency_code': 'KES', 'currency_name': 'Kenyan Shilling',        'symbol': 'KSh',  'locale': 'en-KE', 'timezone': 'Africa/Nairobi'},
    {'country_code': 'EG', 'country_name': 'Egypt',                'currency_code': 'EGP', 'currency_name': 'Egyptian Pound',         'symbol': 'E£',   'locale': 'ar-EG', 'timezone': 'Africa/Cairo'},
    {'country_code': 'MA', 'country_name': 'Morocco',              'currency_code': 'MAD', 'currency_name': 'Moroccan Dirham',        'symbol': 'DH',   'locale': 'ar-MA', 'timezone': 'Africa/Casablanca'},
    {'country_code': 'TN', 'country_name': 'Tunisia',              'currency_code': 'TND', 'currency_name': 'Tunisian Dinar',         'symbol': 'د.ت',  'locale': 'ar-TN', 'timezone': 'Africa/Tunis'},
    {'country_code': 'DZ', 'country_name': 'Algeria',              'currency_code': 'DZD', 'currency_name': 'Algerian Dinar',         'symbol': 'د.ج',  'locale': 'ar-DZ', 'timezone': 'Africa/Algiers'},
    {'country_code': 'GH', 'country_name': 'Ghana',                'currency_code': 'GHS', 'currency_name': 'Ghanaian Cedi',          'symbol': '₵',    'locale': 'en-GH', 'timezone': 'Africa/Accra'},
    {'country_code': 'TZ', 'country_name': 'Tanzania',             'currency_code': 'TZS', 'currency_name': 'Tanzanian Shilling',     'symbol': 'TSh',  'locale': 'en-TZ', 'timezone': 'Africa/Dar_es_Salaam'},
    {'country_code': 'UG', 'country_name': 'Uganda',               'currency_code': 'UGX', 'currency_name': 'Ugandan Shilling',       'symbol': 'USh',  'locale': 'en-UG', 'timezone': 'Africa/Kampala'},
    {'country_code': 'ET', 'country_name': 'Ethiopia',             'currency_code': 'ETB', 'currency_name': 'Ethiopian Birr',         'symbol': 'Br',   'locale': 'am-ET', 'timezone': 'Africa/Addis_Ababa'},
    {'country_code': 'ZW', 'country_name': 'Zimbabwe',             'currency_code': 'USD', 'currency_name': 'US Dollar',              'symbol': '$',    'locale': 'en-ZW', 'timezone': 'Africa/Harare'},
    {'country_code': 'MU', 'country_name': 'Mauritius',            'currency_code': 'MUR', 'currency_name': 'Mauritian Rupee',        'symbol': '₨',    'locale': 'en-MU', 'timezone': 'Indian/Mauritius'},
    {'country_code': 'SN', 'country_name': 'Senegal',              'currency_code': 'XOF', 'currency_name': 'West African CFA Franc', 'symbol': 'CFA',  'locale': 'fr-SN', 'timezone': 'Africa/Dakar'},
    {'country_code': 'CI', 'country_name': 'Ivory Coast',          'currency_code': 'XOF', 'currency_name': 'West African CFA Franc', 'symbol': 'CFA',  'locale': 'fr-CI', 'timezone': 'Africa/Abidjan'},
    {'country_code': 'CM', 'country_name': 'Cameroon',             'currency_code': 'XAF', 'currency_name': 'Central African CFA Franc', 'symbol': 'FCFA', 'locale': 'fr-CM', 'timezone': 'Africa/Douala'},
]

# Derived lookups — built once at import time.
_BY_COUNTRY = {c['country_name'].lower(): c for c in COUNTRY_CURRENCIES}
_BY_COUNTRY_CODE = {c['country_code'].upper(): c for c in COUNTRY_CURRENCIES}
_BY_CURRENCY = {}
for _c in COUNTRY_CURRENCIES:
    _BY_CURRENCY.setdefault(_c['currency_code'], _c)

CURRENCY_CODES = sorted({c['currency_code'] for c in COUNTRY_CURRENCIES})
COUNTRY_NAMES = sorted({c['country_name'] for c in COUNTRY_CURRENCIES})

FALLBACK_CURRENCY = {
    'country_code': 'US',
    'country_name': 'United States',
    'currency_code': 'USD',
    'currency_name': 'US Dollar',
    'symbol': '$',
    'locale': 'en-US',
    'timezone': 'America/New_York',
}


def get_country_config(country_name):
    if not country_name:
        return None
    return _BY_COUNTRY.get(str(country_name).strip().lower())


def get_country_by_code(code):
    if not code:
        return None
    return _BY_COUNTRY_CODE.get(str(code).strip().upper())


def get_currency_config(currency_code):
    if not currency_code:
        return None
    return _BY_CURRENCY.get(str(currency_code).strip().upper())


def get_default_currency_for_country(country_name):
    c = get_country_config(country_name)
    return c['currency_code'] if c else FALLBACK_CURRENCY['currency_code']