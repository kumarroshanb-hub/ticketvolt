// baileys-gateway/src/services/whatsappService.js
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCode = require('qrcode-terminal');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const logger = require('../utils/logger');

// Optional richer QR output (falls back to terminal QR if missing)
let QRCodeLib;
try {
    QRCodeLib = require('qrcode');
} catch (e) {
    QRCodeLib = null;
}

// ============================================================
// Constants
// ============================================================
const E164_MIN_DIGITS = 8;
const E164_MAX_DIGITS = 15;

const FLOW = Object.freeze({
    IDLE: 'idle',
    SELECT_EVENT: 'select_event',
    SELECT_SLOTS: 'select_slots',
    SELECT_TIERS: 'select_tiers',
    ENTER_TIER_QUANTITIES: 'enter_tier_quantities',
    ENTER_ATTENDEE_NAMES: 'enter_attendee_names',
    ENTER_NAME: 'enter_name',
    ENTER_EMAIL: 'enter_email',
    CONFIRM: 'confirm',
});

// ============================================================
// Phone number helpers
// ============================================================
const COUNTRY_CODE_MAP = {
    '1': 'US', '7': 'RU',
    '20': 'EG', '27': 'ZA', '30': 'GR', '31': 'NL', '32': 'BE', '33': 'FR',
    '34': 'ES', '36': 'HU', '39': 'IT', '40': 'RO', '41': 'CH', '43': 'AT',
    '44': 'GB', '45': 'DK', '46': 'SE', '47': 'NO', '48': 'PL', '49': 'DE',
    '51': 'PE', '52': 'MX', '54': 'AR', '55': 'BR', '56': 'CL', '57': 'CO',
    '58': 'VE', '60': 'MY', '61': 'AU', '62': 'ID', '63': 'PH', '64': 'NZ',
    '65': 'SG', '66': 'TH', '81': 'JP', '82': 'KR', '84': 'VN', '86': 'CN',
    '90': 'TR', '91': 'IN', '92': 'PK', '93': 'AF', '94': 'LK', '95': 'MM',
    '98': 'IR',
    '212': 'MA', '213': 'DZ', '216': 'TN', '218': 'LY', '220': 'GM',
    '221': 'SN', '234': 'NG', '254': 'KE', '256': 'UG', '263': 'ZW',
    '351': 'PT', '352': 'LU', '353': 'IE', '354': 'IS', '358': 'FI',
    '370': 'LT', '371': 'LV', '372': 'EE', '380': 'UA', '381': 'RS',
    '385': 'HR', '386': 'SI', '420': 'CZ', '421': 'SK',
    '852': 'HK', '853': 'MO', '855': 'KH', '856': 'LA', '880': 'BD',
    '886': 'TW', '960': 'MV', '961': 'LB', '962': 'JO', '963': 'SY',
    '964': 'IQ', '965': 'KW', '966': 'SA', '967': 'YE', '968': 'OM',
    '971': 'AE', '972': 'IL', '973': 'BH', '974': 'QA', '975': 'BT',
    '976': 'MN', '977': 'NP',
};

function extractNormalizedPhoneNumber(jid) {
    if (!jid || typeof jid !== 'string') return null;
    if (jid.endsWith('@g.us')) return null;
    if (jid.includes('status@broadcast')) return null;

    const localPart = jid.split('@')[0];
    const withoutDevice = localPart.split(':')[0];
    const digits = withoutDevice.replace(/\D/g, '');

    if (!digits) return null;
    if (digits.length < E164_MIN_DIGITS || digits.length > E164_MAX_DIGITS) {
        console.warn(
            `⚠️ JID rejected — digits out of E.164 range ` +
            `(${digits.length} not in [${E164_MIN_DIGITS}, ${E164_MAX_DIGITS}]): ${jid}`
        );
        return null;
    }
    return digits;
}

function formatPhoneForDisplay(phone) {
    if (!phone) return 'Unknown';
    const digits = String(phone).replace(/\D/g, '');
    if (!digits) return 'Unknown';

    // Prefer longest country-code match (3 > 2 > 1).
    for (let len = 3; len >= 1; len--) {
        const candidate = digits.slice(0, len);
        if (COUNTRY_CODE_MAP[candidate]) {
            const national = digits.slice(len);
            // Light cosmetic grouping: 4-digit blocks from the right.
            const grouped = national.replace(/\B(?=(\d{4})+(?!\d))/g, ' ');
            return `+${candidate} ${grouped}`.trim();
        }
    }
    return `+${digits}`;
}

// ============================================================
// Timezone / duration helpers
// ============================================================
function safeTimezone(timezone) {
    if (!timezone) return 'UTC';
    try {
        new Intl.DateTimeFormat('en-IN', { timeZone: timezone });
        return timezone;
    } catch {
        console.warn(`⚠️ Invalid timezone "${timezone}", falling back to UTC`);
        return 'UTC';
    }
}

function formatEventDate(dateString, timezone) {
    if (!dateString) return 'TBD';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'TBD';
    const tz = safeTimezone(timezone);
    try {
        return new Intl.DateTimeFormat('en-IN', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true,
            timeZone: tz, timeZoneName: 'short',
        }).format(date);
    } catch (e) {
        console.error('Error formatting event date:', e.message);
        return date.toLocaleString('en-IN');
    }
}

function formatEventTime(dateString, timezone) {
    if (!dateString) return 'TBD';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'TBD';
    const tz = safeTimezone(timezone);
    try {
        return new Intl.DateTimeFormat('en-IN', {
            hour: '2-digit', minute: '2-digit', hour12: true,
            timeZone: tz, timeZoneName: 'short',
        }).format(date);
    } catch {
        return date.toLocaleTimeString('en-IN');
    }
}

function formatEventDateOnly(dateString, timezone) {
    if (!dateString) return 'TBD';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'TBD';
    const tz = safeTimezone(timezone);
    try {
        return new Intl.DateTimeFormat('en-IN', {
            year: 'numeric', month: 'short', day: 'numeric',
            timeZone: tz,
        }).format(date);
    } catch {
        return date.toLocaleDateString('en-IN');
    }
}

function formatEventDuration(startStr, endStr) {
    if (!startStr || !endStr) return 'Duration not specified';
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 'Duration not specified';

    const diffMs = end - start;
    if (diffMs < 0) return 'Invalid duration';

    if (start.toDateString() !== end.toDateString()) {
        const totalDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        return `Spans ${totalDays} day(s)`;
    }

    const totalMinutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours} hour(s)`);
    if (minutes > 0) parts.push(`${minutes} minute(s)`);
    return parts.length ? parts.join(' ') : '< 1 minute';
}

// ============================================================
// Generic helpers
// ============================================================
function createEmptySession(phoneNumber) {
    return {
        step: FLOW.IDLE,
        phone_number: phoneNumber,
        event_id: null,
        event_title: '',
        event_timezone: null,
        sessions: [],
        tiers: [],
        slot_preferences: [],
        selected_slot: null,
        slot_id: null,
        slot_start_time: null,
        slot_end_time: null,
        slot_allocation_message: '',
        selected_tiers: [],
        tier_attendees: {},
        ticket_list: [],
        attendees: [],
        attendee_index: 0,
        customer_name: '',
        customer_email: '',
        total_amount: 0,
        total_tickets: 0,
        booking_reference: '',
        waiting_for_confirm: false,
    };
}

function parseIntList(text) {
    return String(text)
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n));
}

function isValidEmail(email) {
    return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ============================================================
// WhatsAppService
// ============================================================
class WhatsAppService {
    constructor() {
        this.sock = null;
        this.isConnectedFlag = false;
        this.isInitializing = false;
        this.qrCode = null;
        this.authFolder = path.join(__dirname, '../../sessions');
        this.messageQueue = [];
        this.userSessions = {};
        this.botNumber = null;

        this.djangoApiUrl = process.env.DJANGO_API_URL || 'http://backend:8000/api';
        this.adminToken = process.env.ADMIN_TOKEN || '';
        this.whatsappEnabled = process.env.WHATSAPP_ENABLED === 'True';
        this.whatsappTicketDeliveryEnabled = process.env.WHATSAPP_TICKET_DELIVERY_ENABLED === 'True';

        this._logConfig();

        // Conversation handlers keyed by FLOW step.
        this._stepHandlers = {
            [FLOW.SELECT_EVENT]: this.handleEventSelection.bind(this),
            [FLOW.SELECT_SLOTS]: this.handleSlotPreferences.bind(this),
            [FLOW.SELECT_TIERS]: this.handleTierSelections.bind(this),
            [FLOW.ENTER_TIER_QUANTITIES]: this.handleTierQuantities.bind(this),
            [FLOW.ENTER_ATTENDEE_NAMES]: this.handleAttendeeNames.bind(this),
            [FLOW.ENTER_NAME]: this.handleCustomerName.bind(this),
            [FLOW.ENTER_EMAIL]: this.handleCustomerEmail.bind(this),
            [FLOW.CONFIRM]: this.handleConfirmation.bind(this),
        };
    }

    _logConfig() {
        console.log('📋 WhatsAppService initialized with:');
        console.log(`   DJANGO_API_URL: ${this.djangoApiUrl}`);
        console.log(`   ADMIN_TOKEN: ${this.adminToken ? '✅ Present' : '❌ MISSING'}`);
        console.log(`   WHATSAPP_ENABLED (Bot): ${this.whatsappEnabled ? '✅ YES' : '❌ NO'}`);
        console.log(`   WHATSAPP_TICKET_DELIVERY_ENABLED: ${this.whatsappTicketDeliveryEnabled ? '✅ YES' : '❌ NO'}`);
    }

    // ============ Public utility methods ============
    extractNormalizedPhoneNumber(jid) {
        return extractNormalizedPhoneNumber(jid);
    }

    formatPhoneForDisplay(phone) {
        return formatPhoneForDisplay(phone);
    }

    formatEventDate(dateString, timezone) {
        return formatEventDate(dateString, timezone);
    }

    formatEventTime(dateString, timezone) {
        return formatEventTime(dateString, timezone);
    }

    formatEventDateOnly(dateString, timezone) {
        return formatEventDateOnly(dateString, timezone);
    }

    formatEventDuration(startStr, endStr) {
        return formatEventDuration(startStr, endStr);
    }

    // ============ API client ============
    getApiClient(useAuth = true) {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
        if (useAuth && this.adminToken && this.adminToken.length > 10) {
            headers['Authorization'] = `Bearer ${this.adminToken}`;
            console.log('🔑 Using authenticated client');
        } else {
            console.log('🔓 Using public client (no auth)');
        }
        return axios.create({
            baseURL: this.djangoApiUrl,
            timeout: 15000,
            headers,
        });
    }

    // ============ Initialize ============
    async initialize() {
        if (!this.whatsappEnabled) {
            console.log('ℹ️ WhatsApp bot is disabled. Set WHATSAPP_ENABLED=True to enable.');
            return;
        }
        if (this.isInitializing) return;
        this.isInitializing = true;

        try {
            await fs.ensureDir(this.authFolder);

            console.log('📱 Initializing WhatsApp...');
            console.log(`📁 Auth folder: ${this.authFolder}`);
            console.log(`🔗 Django API: ${this.djangoApiUrl}`);

            const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);

            this.sock = makeWASocket({
                auth: state,
                logger,
                browser: ['TicketVolt', 'Chrome', '1.0.0'],
                syncFullHistory: false,
                markOnlineOnConnect: false,
            });

            this.sock.ev.on('creds.update', saveCreds);
            this.sock.ev.on('connection.update', update => this._onConnectionUpdate(update));
            this.sock.ev.on('messages.upsert', async m => {
                const msg = m.messages[0];
                if (msg && !msg.key.fromMe && msg.message) {
                    await this.handleIncomingMessage(msg);
                }
            });

            console.log('🔄 Connecting to WhatsApp...');
        } catch (error) {
            console.error('❌ Failed to initialize WhatsApp:', error);
            this.isInitializing = false;
        }
    }

    async _onConnectionUpdate(update) {
        const { connection, lastDisconnect, qr } = update;

        if (qr) await this._handleQr(qr);

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`🔌 Connection closed. Reconnecting: ${shouldReconnect}`);
            this.isConnectedFlag = false;
            this.isInitializing = false;

            if (shouldReconnect) {
                setTimeout(() => this.initialize(), 5000);
            } else {
                console.log('❌ Logged out. Please restart and scan QR again.');
            }
            return;
        }

        if (connection === 'open') {
            this.isConnectedFlag = true;
            this.isInitializing = false;
            console.log('\n✅ WhatsApp connected successfully!');
            console.log('📱 Ready to send and receive messages!\n');

            try {
                const me = this.sock.authState.creds?.me;
                if (me) {
                    this.botNumber = me.id.split(':')[0];
                    console.log(`📱 Bot Number: ${this.botNumber}`);
                }
            } catch {
                console.log('📱 Could not retrieve bot number');
            }

            await this.processMessageQueue();
        }
    }

    async _handleQr(qr) {
        this.qrCode = qr;
        console.log('\n' + '='.repeat(80));
        console.log('📱 SCAN THIS QR CODE WITH WHATSAPP:');
        console.log('='.repeat(80));

        try {
            QRCode.generate(qr, { small: true });
        } catch {
            console.log('⚠️ Could not generate terminal QR, trying alternative...');
        }

        if (QRCodeLib) {
            try {
                const qrTerminal = await QRCodeLib.toString(qr, {
                    type: 'terminal', small: true, margin: 1,
                });
                console.log('\n📱 QR Code (Alternative view):');
                console.log(qrTerminal);
            } catch { /* ignore */ }

            try {
                const qrImagePath = path.join(__dirname, '../../qr-code.png');
                await QRCodeLib.toFile(qrImagePath, qr, {
                    width: 400, margin: 2,
                    color: { dark: '#000000', light: '#ffffff' },
                });
                console.log(`\n📱 QR Code saved to: ${qrImagePath}`);
            } catch { /* ignore */ }
        }

        console.log('\n📱 QR Code Data URL (copy and paste in browser):');
        console.log(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`);
        console.log('\n' + '='.repeat(80));
        console.log('⚠️  Scan the QR code above with your WhatsApp mobile app\n');
    }

    // ============ Outbound: images / documents / files ============
    _toBuffer(data, mimePrefix) {
        if (Buffer.isBuffer(data)) return data;
        if (typeof data === 'string') {
            let payload = data;
            if (mimePrefix && payload.startsWith(mimePrefix)) {
                payload = payload.split(',')[1];
            } else if (payload.startsWith('data:')) {
                payload = payload.split(',')[1];
            }
            return Buffer.from(payload, 'base64');
        }
        throw new Error('Unsupported data type for outbound send');
    }

    async sendImage(jid, imageBuffer, caption = '') {
        if (!this.isConnectedFlag) {
            console.log('📥 Image queued (not connected)');
            return { status: 'queued' };
        }
        try {
            const buffer = this._toBuffer(imageBuffer, 'data:image');
            const result = await this.sock.sendMessage(jid, { image: buffer, caption });
            console.log('✅ Image sent successfully');
            return { status: 'sent', result };
        } catch (error) {
            console.error('❌ Failed to send image:', error.message);
            throw error;
        }
    }

    async sendDocument(jid, fileData, filename = 'ticket.pdf', caption = '') {
        if (!this.isConnectedFlag) {
            console.log('📥 Document queued (not connected)');
            return { status: 'queued' };
        }
        try {
            const buffer = this._toBuffer(fileData, 'data:application/pdf');
            const result = await this.sock.sendMessage(jid, {
                document: buffer,
                mimetype: 'application/pdf',
                filename: filename || 'ticket.pdf',
                caption,
            });
            console.log(`✅ Document sent successfully: ${filename}`);
            return { status: 'sent', result };
        } catch (error) {
            console.error('❌ Failed to send document:', error.message);
            throw error;
        }
    }

    async sendFile(jid, fileData, filename = 'file.pdf', caption = '') {
        if (!this.isConnectedFlag) {
            console.log('📥 File queued (not connected)');
            return { status: 'queued' };
        }
        try {
            const buffer = this._toBuffer(fileData);
            const ext = (filename.split('.').pop() || '').toLowerCase();
            const mimeByExt = {
                pdf: 'application/pdf',
                png: 'image/png',
                jpg: 'image/jpeg',
                jpeg: 'image/jpeg',
                txt: 'text/plain',
                json: 'application/json',
            };
            const mimetype = mimeByExt[ext] || 'application/octet-stream';

            const result = await this.sock.sendMessage(jid, {
                document: buffer,
                mimetype,
                filename: filename || 'file.pdf',
                caption,
            });
            console.log(`✅ File sent successfully: ${filename}`);
            return { status: 'sent', result };
        } catch (error) {
            console.error('❌ Failed to send file:', error.message);
            throw error;
        }
    }

    async sendMessage(jid, message) {
        if (!this.isConnectedFlag) {
            this.messageQueue.push({ jid, message, retryCount: 0 });
            return { status: 'queued' };
        }
        try {
            const result = await this.sock.sendMessage(jid, { text: message });
            console.log('✅ Message sent');
            return { status: 'sent', result };
        } catch (error) {
            console.error('❌ Failed to send message:', error.message);
            if (this.messageQueue.length < 100) {
                this.messageQueue.push({ jid, message, retryCount: 0 });
            }
            throw error;
        }
    }

    async processMessageQueue() {
        if (this.messageQueue.length === 0) return;
        console.log(`📤 Processing ${this.messageQueue.length} queued messages...`);

        while (this.messageQueue.length > 0) {
            const item = this.messageQueue.shift();
            try {
                await this.sendMessage(item.jid, item.message);
                await new Promise(r => setTimeout(r, 1000));
            } catch (error) {
                console.error('❌ Failed to send queued message:', error.message);
                if ((item.retryCount || 0) < 3) {
                    item.retryCount = (item.retryCount || 0) + 1;
                    this.messageQueue.push(item);
                }
            }
        }
    }

    // ============ Inbound ============
    async handleIncomingMessage(msg) {
        if (!this.whatsappEnabled) {
            console.log('ℹ️ WhatsApp bot is disabled. Ignoring message.');
            return;
        }

        const sender = msg.key.remoteJid;

        try {
            const phoneNumber = extractNormalizedPhoneNumber(sender);
            if (!phoneNumber) {
                console.warn(`⚠️ Could not extract phone number from JID: ${sender}`);
                await this.sendMessage(sender,
                    '❌ Could not identify your phone number. Please ensure you\'re using WhatsApp on your phone.'
                );
                return;
            }

            const displayId = formatPhoneForDisplay(phoneNumber);
            const text = msg.message?.conversation
                || msg.message?.extendedTextMessage?.text
                || msg.message?.imageMessage?.caption
                || '';

            console.log(`📩 From ${displayId} (${phoneNumber}): ${text}`);

            if (!this.userSessions[sender]) {
                this.userSessions[sender] = createEmptySession(phoneNumber);
            } else {
                this.userSessions[sender].phone_number = phoneNumber;
            }

            await this.processCommand(sender, text);
        } catch (error) {
            console.error('❌ Error:', error.message);
            await this.sendMessage(sender, '❌ Sorry, something went wrong. Please try again.');
        }
    }

    // ============ Command dispatcher ============
    async processCommand(sender, text) {
        const session = this.userSessions[sender];
        const lower = text.toLowerCase().trim();

        // Global commands — always available.
        if (lower === 'help' || lower === 'menu') return this.showMenu(sender);
        if (lower === 'cancel' || lower === 'exit') {
            session.step = FLOW.IDLE;
            session.waiting_for_confirm = false;
            return this.sendMessage(sender, '❌ Booking cancelled. Type *book* to start again.');
        }
        if (lower === 'book' || lower === 'booking') return this.startBooking(sender);
        if (lower === 'events') return this.showEvents(sender);

        // Slot-allocation confirmation is a cross-state gate.
        if (lower === 'confirm' && session.waiting_for_confirm) {
            session.waiting_for_confirm = false;
            await this._fetchTiersIfMissing(session);
            if (session.tiers && session.tiers.length > 0) {
                return this.showTierSelection(sender);
            }
            session.step = FLOW.IDLE;
            return this.sendMessage(sender,
                '❌ No ticket tiers available for this event.\n\nPlease start over by typing *book*.'
            );
        }

        // Delegate to per-step handler.
        const handler = this._stepHandlers[session.step];
        if (handler) {
            return handler(sender, text);
        }

        // Default / idle prompt.
        return this.sendMessage(sender,
            '👋 Welcome to TicketVolt!\n\n'
            + 'Type *book* to book tickets\n'
            + 'Type *events* to see events\n'
            + 'Type *help* for menu'
        );
    }

    async _fetchTiersIfMissing(session) {
        if (session.tiers && session.tiers.length > 0) return;
        console.log('⚠️ No tiers in session, fetching from API...');
        try {
            const api = this.getApiClient(false);
            const { data } = await api.get(`/events/public/${session.event_id}/`);
            session.tiers = data.tiers || [];
            if (data.timezone) session.event_timezone = data.timezone;
            console.log(`📋 Fetched ${session.tiers.length} tiers from API`);
        } catch (error) {
            console.error('❌ Failed to fetch tiers:', error.message);
        }
    }

    // ============ Menu ============
    async showMenu(sender) {
        const delivery = this.whatsappTicketDeliveryEnabled
            ? '📱 WhatsApp + Email (after payment)'
            : '📧 Email only (after payment)';

        const message = `
🤖 *TicketVolt - Booking Bot*

┌─────────────────────────────────────┐
│ 📋 *Commands*                       │
├─────────────────────────────────────┤
│ 📱 *book* - Book tickets            │
│ 📅 *events* - List events           │
│ ❌ *cancel* - Cancel booking        │
│ 🆘 *help* - Show this menu          │
└─────────────────────────────────────┘

📌 *How to book:*
1. Type *book*
2. Select an event
3. Choose your preferred slots (e.g., 1,3,2)
4. Select ticket types (e.g., 1,2,4)
5. Enter quantities for each tier
6. Enter attendee names
7. Confirm booking

💡 *Slot Selection:*
You can specify your slot preferences in order.
Example: *1,3,2* means:
  - Preference 1: Slot 1
  - Preference 2: Slot 3
  - Preference 3: Slot 2
We'll automatically allocate the best available slot.

💡 *Ticket Delivery:*
   ${delivery}

Thank you for choosing TicketVolt! 🎫`;

        await this.sendMessage(sender, message);
    }

    // ============ Events list ============
    async showEvents(sender) {
        try {
            console.log('🔍 Fetching events from public endpoint...');
            const api = this.getApiClient(false);
            const { data } = await api.get('/events/public/');
            const events = data.results || data;
            console.log(`✅ Events fetched via public endpoint: ${events.length}`);

            const activeEvents = events.filter(e =>
                e.status === 'active' || e.status === 'published'
            );

            if (activeEvents.length === 0) {
                await this.sendMessage(sender, '❌ No active events at the moment.');
                return;
            }

            const session = this.userSessions[sender];
            session.events = activeEvents;
            session.step = FLOW.SELECT_EVENT;

            let message = '📅 *Select an Event*\n\n';
            activeEvents.forEach((event, index) => {
                const date = formatEventDateOnly(event.start_date, event.timezone);
                const duration = formatEventDuration(event.start_date, event.end_date);
                const start = formatEventTime(event.start_date, event.timezone);
                message += `${index + 1}. *${event.title}*\n`;
                message += `   📅 ${date}\n`;
                message += `   🕐 Starts at ${start}\n`;
                message += `   ⏱️ Duration: ${duration}\n`;
                message += `   📍 ${event.venue?.name || 'TBD'}\n\n`;
            });
            message += 'Reply with the number of your choice.';

            await this.sendMessage(sender, message);
        } catch (error) {
            console.error('Error fetching events:', error.message);
            if (error.response) {
                console.error('Status:', error.response.status);
                console.error('Data:', error.response.data);
            }
            await this.sendMessage(sender,
                `❌ Unable to fetch events. Please try again later.\nError: ${error.message}`
            );
        }
    }

    async startBooking(sender) {
        await this.showEvents(sender);
    }

    // ============ Step: SELECT_EVENT ============
    async handleEventSelection(sender, text) {
        const session = this.userSessions[sender];
        const choice = parseInt(text, 10);

        if (isNaN(choice) || choice < 1 || choice > session.events.length) {
            await this.sendMessage(sender, '❌ Invalid choice. Please enter a valid number.');
            return;
        }

        const selectedEvent = session.events[choice - 1];

        // Reset per-event state.
        Object.assign(session, {
            event_id: selectedEvent.id,
            event_title: selectedEvent.title,
            selected_tiers: [],
            tier_attendees: {},
            total_amount: 0,
            total_tickets: 0,
            slot_preferences: [],
            selected_slot: null,
            slot_id: null,
            slot_start_time: null,
            slot_end_time: null,
            waiting_for_confirm: false,
            attendees: [],
            ticket_list: [],
        });

        try {
            const api = this.getApiClient(false);
            console.log(`📡 Fetching event ${selectedEvent.id} from public endpoint...`);
            const { data: eventData } = await api.get(`/events/public/${selectedEvent.id}/`);

            const sessions = eventData.sessions || [];
            const tiers = eventData.tiers || [];

            session.event_timezone = eventData.timezone || selectedEvent.timezone || 'UTC';
            console.log(`🕐 Event timezone: ${session.event_timezone}`);
            session.tiers = tiers;
            console.log(`📋 Stored ${tiers.length} tiers in session`);

            if (sessions.length > 0) {
                session.sessions = sessions;
                session.step = FLOW.SELECT_SLOTS;
                await this.sendMessage(sender, this._buildSlotSelectionMessage(session, eventData));
            } else if (tiers.length > 0) {
                session.sessions = [];
                session.step = FLOW.SELECT_TIERS;
                await this.showTierSelection(sender);
            } else {
                await this.sendMessage(sender, '❌ No ticket tiers available for this event.');
                session.step = FLOW.IDLE;
            }
        } catch (error) {
            console.error('Error fetching event details:', error.message);
            await this.sendMessage(sender, '❌ Unable to fetch event details. Please try again.');
            session.step = FLOW.IDLE;
        }
    }

    _buildSlotSelectionMessage(session, eventData) {
        const tz = session.event_timezone || 'UTC';
        const date = formatEventDateOnly(eventData.start_date, tz);
        const duration = formatEventDuration(eventData.start_date, eventData.end_date);

        let message = `🕐 *Select Your Preferred Slots*\n\n`;
        message += `Event: *${session.event_title}*\n`;
        message += `📅 ${date}\n`;
        message += `⏱️ Duration: ${duration}\n\n`;
        message += `📋 Available Slots:\n\n`;

        session.sessions.forEach((slot, index) => {
            const start = formatEventTime(slot.start_time, tz);
            const end = formatEventTime(slot.end_time, tz);
            const remaining = slot.capacity - slot.booked;
            const availability = remaining > 0 ? `✅ ${remaining} seats available` : '❌ Fully booked';
            message += `${index + 1}. ${start} - ${end}\n`;
            message += `   ${availability}\n\n`;
        });

        message += `✏️ *How to select your preferences:*\n`;
        message += `Enter the slot numbers in order of your preference, separated by commas.\n`;
        message += `Example: *1,3,2* means:\n`;
        message += `   🔹 Preference 1: Slot 1\n`;
        message += `   🔹 Preference 2: Slot 3\n`;
        message += `   🔹 Preference 3: Slot 2\n\n`;
        message += `💡 We'll automatically allocate the best available slot based on your preferences.\n\n`;
        message += `Reply with your slot preferences.`;
        return message;
    }

    // ============ Step: SELECT_SLOTS (preferences) ============
    async handleSlotPreferences(sender, text) {
        const session = this.userSessions[sender];
        const tz = session.event_timezone || 'UTC';

        const preferences = parseIntList(text);
        if (preferences.length === 0) {
            await this.sendMessage(sender,
                `❌ Invalid input. Please enter slot numbers separated by commas.\n`
                + `Example: *1,3,2*\n\nOr type *cancel* to start over.`
            );
            return;
        }

        const invalid = preferences.filter(n => n < 1 || n > session.sessions.length);
        if (invalid.length > 0) {
            await this.sendMessage(sender,
                `❌ Invalid choice(s): ${invalid.join(', ')}. `
                + `Please enter numbers between 1 and ${session.sessions.length}.`
            );
            return;
        }

        const uniquePreferences = [...new Set(preferences)];
        session.slot_preferences = uniquePreferences;

        const { allocatedSlot, allocatedSlotIndex, allocationMessage, checkedSlots } =
            this._allocateSlot(session, uniquePreferences);

        if (!allocatedSlot) {
            await this.sendMessage(sender, this._buildNoSlotMessage(checkedSlots, tz));
            return;
        }

        session.selected_slot = allocatedSlot;
        session.slot_id = allocatedSlot.id;
        session.slot_start_time = allocatedSlot.start_time;
        session.slot_end_time = allocatedSlot.end_time;
        session.slot_allocation_message = allocationMessage;

        await this.sendMessage(
            sender,
            this._buildSlotAllocatedMessage(session, allocatedSlotIndex, checkedSlots, tz)
        );

        session.waiting_for_confirm = true;
        session.step = FLOW.SELECT_SLOTS;
    }

    _allocateSlot(session, uniquePreferences) {
        const checkedSlots = [];
        let allocatedSlot = null;
        let allocatedSlotIndex = null;
        let allocationMessage = '';

        // First pass: honor preferences in order.
        for (const pref of uniquePreferences) {
            const slotIndex = pref - 1;
            const slot = session.sessions[slotIndex];
            const remaining = slot.capacity - slot.booked;
            const isAllocated = remaining > 0 && !allocatedSlot;

            checkedSlots.push({
                preference: uniquePreferences.indexOf(pref) + 1,
                slot_number: pref,
                start_time: new Date(slot.start_time),
                end_time: new Date(slot.end_time),
                available: remaining > 0,
                remaining,
                is_allocated: isAllocated,
            });

            if (isAllocated) {
                allocatedSlot = slot;
                allocatedSlotIndex = slotIndex;
                allocationMessage = `Allocated based on your Preference #${uniquePreferences.indexOf(pref) + 1}`;
                break;
            }
        }

        // Second pass: fall back to any other available slot.
        if (!allocatedSlot) {
            for (let i = 0; i < session.sessions.length; i++) {
                if (checkedSlots.some(s => s.slot_number === i + 1)) continue;
                const slot = session.sessions[i];
                const remaining = slot.capacity - slot.booked;
                if (remaining > 0) {
                    allocatedSlot = slot;
                    allocatedSlotIndex = i;
                    allocationMessage = 'Allocated to the next available slot (your preferred slots were full)';
                    checkedSlots.push({
                        preference: null,
                        slot_number: i + 1,
                        start_time: new Date(slot.start_time),
                        end_time: new Date(slot.end_time),
                        available: true,
                        remaining,
                        is_allocated: true,
                    });
                    break;
                }
            }
        }

        return { allocatedSlot, allocatedSlotIndex, allocationMessage, checkedSlots };
    }

    _buildNoSlotMessage(checkedSlots, tz) {
        let message = `❌ *No Slots Available*\n\n`;
        message += `Unfortunately, all slots are currently fully booked.\n\n`;
        message += `📋 *Your Preferences & Availability:*\n\n`;

        checkedSlots.forEach(status => {
            const availability = status.available ? `✅ ${status.remaining} seats` : '❌ Fully booked';
            const start = formatEventTime(status.start_time.toISOString(), tz);
            const end = formatEventTime(status.end_time.toISOString(), tz);
            message += `Preference ${status.preference}: Slot ${status.slot_number}\n`;
            message += `   ${start} - ${end}\n`;
            message += `   ${availability}\n\n`;
        });

        message += `💡 Please try again later or contact support.\n`;
        message += `Type *cancel* to start over.`;
        return message;
    }

    _buildSlotAllocatedMessage(session, allocatedSlotIndex, checkedSlots, tz) {
        const allocatedSlot = session.selected_slot;
        let message = `✅ *Slot Allocated Successfully!*\n\n`;
        message += `🎯 *Allocated Slot:* Slot ${allocatedSlotIndex + 1}\n`;
        message += `   🕐 ${formatEventTime(allocatedSlot.start_time, tz)} - ${formatEventTime(allocatedSlot.end_time, tz)}\n`;
        message += `   ✅ ${allocatedSlot.capacity - allocatedSlot.booked} seats remaining\n\n`;
        message += `📋 *Your Preferences:*\n\n`;

        checkedSlots.forEach(status => {
            const availability = status.available ? `✅ ${status.remaining} seats` : '❌ Fully booked';
            const allocatedMark = status.is_allocated ? ' 🎯 *ALLOCATED*' : '';
            const prefLabel = status.preference ? `Preference ${status.preference}` : 'Fallback';
            const start = formatEventTime(status.start_time.toISOString(), tz);
            const end = formatEventTime(status.end_time.toISOString(), tz);
            message += `${prefLabel}: Slot ${status.slot_number}${allocatedMark}\n`;
            message += `   ${start} - ${end}\n`;
            message += `   ${availability}\n\n`;
        });

        message += `✅ Your slot has been automatically allocated based on your preferences.\n\n`;
        message += `Type *confirm* to proceed with ticket selection, or *cancel* to start over.`;
        return message;
    }

    // ============ Step: SELECT_TIERS ============
    async showTierSelection(sender) {
        const session = this.userSessions[sender];
        const tiers = session.tiers;
        const tz = session.event_timezone || 'UTC';

        console.log(`📋 showTierSelection: ${tiers ? tiers.length : 0} tiers available`);

        if (!tiers || tiers.length === 0) {
            await this.sendMessage(sender, '❌ No ticket tiers available for this event.');
            session.step = FLOW.IDLE;
            return;
        }

        let message = `🎟️ *Select Ticket Types*\n\n`;
        message += `Event: *${session.event_title}*\n`;
        if (session.slot_start_time) {
            message += `🕐 Slot: ${formatEventTime(session.slot_start_time, tz)} (allocated based on your preferences)\n`;
        }
        message += `\n📋 Available Tickets:\n\n`;

        tiers.forEach((tier, index) => {
            const available = Math.max(0, (tier.quantity_total || 0) - (tier.quantity_sold || 0));
            message += `${index + 1}. *${tier.name}* - ₹${tier.price || 0}\n`;
            message += `   Available: ${available}\n\n`;
        });

        message += `✏️ *How to select:*\n`;
        message += `Enter the numbers of the tiers you want, separated by commas.\n`;
        message += `Example: *1,2,4* (selects tiers 1, 2, and 4)\n\n`;
        message += `Reply with your choices, or type *cancel* to start over.`;

        session.step = FLOW.SELECT_TIERS;
        session.waiting_for_confirm = false;
        await this.sendMessage(sender, message);
    }

    async handleTierSelections(sender, text) {
        const session = this.userSessions[sender];

        const choices = parseIntList(text);
        if (choices.length === 0) {
            await this.sendMessage(sender,
                `❌ Invalid input. Please enter numbers separated by commas.\n`
                + `Example: *1,2,4*\n\nOr type *cancel* to start over.`
            );
            return;
        }

        const invalid = choices.filter(n => n < 1 || n > session.tiers.length);
        if (invalid.length > 0) {
            await this.sendMessage(sender,
                `❌ Invalid choice(s): ${invalid.join(', ')}. `
                + `Please enter numbers between 1 and ${session.tiers.length}.`
            );
            return;
        }

        const uniqueChoices = [...new Set(choices)];
        const selectedTiers = [];
        const soldOutTiers = [];

        for (const choice of uniqueChoices) {
            const tier = session.tiers[choice - 1];
            const available = (tier.quantity_total || 0) - (tier.quantity_sold || 0);
            if (available <= 0) {
                soldOutTiers.push(tier.name);
            } else {
                selectedTiers.push({
                    tier_id: tier.id,
                    tier_name: tier.name,
                    price: parseFloat(tier.price),
                    quantity: 0,
                    max_available: available,
                    max_per_order: tier.max_per_order || 10,
                });
            }
        }

        if (soldOutTiers.length > 0) {
            await this.sendMessage(sender,
                `⚠️ The following tiers are sold out: *${soldOutTiers.join(', ')}*\n\n`
                + `Please try again with available tiers.`
            );
            return;
        }

        if (selectedTiers.length === 0) {
            await this.sendMessage(sender, '❌ No valid tiers selected. Please try again.');
            return;
        }

        session.selected_tiers = selectedTiers;
        session.current_tier_index = 0;
        session.step = FLOW.ENTER_TIER_QUANTITIES;

        let message = `✅ Selected *${selectedTiers.length}* tier type(s):\n\n`;
        selectedTiers.forEach((tier, index) => {
            message += `${index + 1}. *${tier.tier_name}* - ₹${tier.price}\n`;
            message += `   Available: ${tier.max_available}\n`;
            message += `   Max per order: ${tier.max_per_order}\n\n`;
        });
        message += `✏️ Now, enter the quantity for each tier in the same order.\n`;
        message += `Example: *2,4,1* (2 tickets for tier 1, 4 for tier 2, 1 for tier 3)\n\n`;
        message += `Reply with the quantities (separated by commas).`;

        await this.sendMessage(sender, message);
    }

    // ============ Step: ENTER_TIER_QUANTITIES ============
    async handleTierQuantities(sender, text) {
        const session = this.userSessions[sender];
        const tz = session.event_timezone || 'UTC';

        const quantities = parseIntList(text);
        if (quantities.length !== session.selected_tiers.length) {
            await this.sendMessage(sender,
                `❌ Please enter exactly ${session.selected_tiers.length} quantities.\nExample: *2,4,1*`
            );
            return;
        }

        let totalTickets = 0;
        let totalAmount = 0;
        const errors = [];

        session.selected_tiers.forEach((tier, index) => {
            const qty = quantities[index];
            const maxAllowed = Math.min(tier.max_available, tier.max_per_order);
            if (isNaN(qty) || qty < 1 || qty > maxAllowed) {
                errors.push(`*${tier.tier_name}*: ${qty} (must be 1-${maxAllowed})`);
            } else {
                tier.quantity = qty;
                totalTickets += qty;
                totalAmount += tier.price * qty;
            }
        });

        if (errors.length > 0) {
            await this.sendMessage(sender,
                `❌ Invalid quantities:\n${errors.join('\n')}\n\nPlease try again with valid quantities.`
            );
            return;
        }

        session.total_tickets = totalTickets;
        session.total_amount = totalAmount;

        let message = `📋 *Ticket Selection Summary*\n\n`;
        message += `Event: *${session.event_title}*\n`;
        if (session.slot_start_time) {
            message += `🕐 Slot: ${formatEventTime(session.slot_start_time, tz)} (allocated based on your preferences)\n`;
        }
        message += `\n*Selected Tickets:*\n`;
        session.selected_tiers.forEach(tier => {
            message += `   • ${tier.quantity} × ${tier.tier_name} - ₹${tier.quantity * tier.price}\n`;
        });
        message += `\n💰 Total Amount: *₹${totalAmount}*\n`;
        message += `🎫 Total Tickets: *${totalTickets}*\n\n`;
        message += `✅ Type *confirm* to proceed with these selections.\n`;
        message += `Type *cancel* to start over.`;

        session.step = FLOW.ENTER_ATTENDEE_NAMES;
        await this.sendMessage(sender, message);
    }

    // ============ Step: ENTER_ATTENDEE_NAMES ============
    async handleAttendeeNames(sender, text) {
        const session = this.userSessions[sender];
        const lower = text.toLowerCase().trim();

        if (lower === 'cancel') {
            session.step = FLOW.IDLE;
            session.waiting_for_confirm = false;
            await this.sendMessage(sender, '❌ Booking cancelled. Type *book* to start again.');
            return;
        }

        // Lazily build the ticket list on first entry.
        if (!session.ticket_list || session.ticket_list.length === 0) {
            session.attendees = session.attendees || [];
            session.attendee_index = 0;
            session.ticket_list = [];
            session.selected_tiers.forEach(tier => {
                for (let i = 0; i < tier.quantity; i++) {
                    session.ticket_list.push({
                        tier_id: tier.tier_id,
                        tier_name: tier.tier_name,
                        ticket_number: i + 1,
                        total_in_tier: tier.quantity,
                    });
                }
            });
        }

        // "confirm" means user is done entering names early.
        if (lower === 'confirm' || session.attendees.length >= session.ticket_list.length) {
            session.step = FLOW.ENTER_NAME;
            await this.sendMessage(sender,
                `👤 Enter your *full name* (for booking confirmation).`
            );
            return;
        }

        const currentTicket = session.ticket_list[session.attendees.length];
        const isFirstPrompt = session.attendees.length === 0;

        // If this is the very first message in the step and it's a valid name,
        // accept it as the first attendee's name. Otherwise, if it's the first
        // prompt, we assume the user typed something unexpected — re-prompt.
        let attendeeName = text.trim();
        if (attendeeName.toLowerCase() === 'skip') {
            attendeeName = session.customer_name || 'Guest';
        }

        if (!attendeeName || attendeeName.length < 2) {
            await this.sendMessage(sender,
                `❌ Please enter a valid name (at least 2 characters).\nType *skip* to use default name.`
            );
            return;
        }

        session.attendees.push({
            tier_id: currentTicket.tier_id,
            tier_name: currentTicket.tier_name,
            name: attendeeName,
        });

        if (!session.tier_attendees[currentTicket.tier_id]) {
            session.tier_attendees[currentTicket.tier_id] = [];
        }
        session.tier_attendees[currentTicket.tier_id].push(attendeeName);

        if (session.attendees.length >= session.ticket_list.length) {
            session.step = FLOW.ENTER_NAME;
            await this.sendMessage(sender,
                `✅ All attendee names entered!\n\n👤 Enter your *full name* (for booking confirmation).`
            );
            return;
        }

        const nextTicket = session.ticket_list[session.attendees.length];
        const nextDisplay = nextTicket.total_in_tier > 1
            ? ` (Ticket ${nextTicket.ticket_number} of ${nextTicket.total_in_tier})`
            : '';

        await this.sendMessage(sender,
            `👤 *Attendee ${session.attendees.length + 1} of ${session.ticket_list.length}*\n\n`
            + `Ticket Type: *${nextTicket.tier_name}*${nextDisplay}\n\n`
            + `Please enter the attendee's full name.\n`
            + `Type *skip* to use "${session.customer_name || 'Guest'}" as the name.`
        );
    }

    // ============ Step: ENTER_NAME ============
    async handleCustomerName(sender, text) {
        const session = this.userSessions[sender];
        const name = text.trim();
        if (!name || name.length < 2) {
            await this.sendMessage(sender, '❌ Please enter a valid name (at least 2 characters).');
            return;
        }
        session.customer_name = name;
        session.step = FLOW.ENTER_EMAIL;
        await this.sendMessage(sender, '📧 Enter your *email address* (for booking confirmation).');
    }

    // ============ Step: ENTER_EMAIL ============
    async handleCustomerEmail(sender, text) {
        const session = this.userSessions[sender];
        const tz = session.event_timezone || 'UTC';
        const email = text.trim();

        if (!isValidEmail(email)) {
            await this.sendMessage(sender, '❌ Please enter a valid email address.');
            return;
        }

        session.customer_email = email;
        session.step = FLOW.CONFIRM;

        let message = `📋 *Booking Summary*\n\n`;
        message += `Event: *${session.event_title}*\n`;
        if (session.slot_start_time) {
            message += `🕐 Slot: ${formatEventTime(session.slot_start_time, tz)}\n`;
        }
        message += `\n*Tickets:*\n`;
        session.selected_tiers.forEach(tier => {
            message += `   • ${tier.quantity} × ${tier.tier_name} - ₹${tier.quantity * tier.price}\n`;
            const names = session.tier_attendees[tier.tier_id] || [];
            names.forEach((name, idx) => {
                message += `      ${idx + 1}. ${name}\n`;
            });
        });
        message += `\n💰 Total Amount: *₹${session.total_amount}*\n`;
        message += `👤 Customer: ${session.customer_name}\n`;
        message += `📧 Email: ${session.customer_email}\n\n`;
        message += `Type *confirm* to book or *cancel* to cancel.`;

        await this.sendMessage(sender, message);
    }

    // ============ Step: CONFIRM ============
    async handleConfirmation(sender, text) {
        const session = this.userSessions[sender];
        const lower = text.toLowerCase();

        if (lower === 'confirm') {
            await this.createBooking(sender);
        } else if (lower === 'cancel') {
            session.step = FLOW.IDLE;
            session.waiting_for_confirm = false;
            await this.sendMessage(sender, '❌ Booking cancelled. Type *book* to start again.');
        } else {
            await this.sendMessage(sender, '❌ Please type *confirm* to book or *cancel* to cancel.');
        }
    }

    // ============ Booking creation ============
    _buildTicketPayload(session) {
        const tickets = [];
        session.selected_tiers.forEach(tier => {
            const names = session.tier_attendees[tier.tier_id] || [];
            if (names.length > 0) {
                names.forEach(name => {
                    tickets.push({
                        tier_id: tier.tier_id,
                        attendee_name: name,
                        tier_name: tier.tier_name,
                        price: tier.price,
                    });
                });
            } else {
                for (let i = 0; i < tier.quantity; i++) {
                    tickets.push({
                        tier_id: tier.tier_id,
                        attendee_name: session.customer_name || 'Guest',
                        tier_name: tier.tier_name,
                        price: tier.price,
                    });
                }
            }
        });
        return tickets;
    }

    async createBooking(sender) {
        const session = this.userSessions[sender];
        const tz = session.event_timezone || 'UTC';

        try {
            const phoneNumber = session.phone_number
                || extractNormalizedPhoneNumber(sender);

            if (!phoneNumber) {
                await this.sendMessage(sender,
                    '❌ Could not identify your phone number. Please restart the booking process.'
                );
                return;
            }

            const displayNumber = formatPhoneForDisplay(phoneNumber);
            console.log(`📱 Creating booking for: ${displayNumber}`);
            console.log(`📱 Phone number (international): ${phoneNumber}`);

            const tickets = this._buildTicketPayload(session);
            console.log(`📊 Number of tickets: ${tickets.length}`);

            const api = this.getApiClient(true);

            const bookingData = {
                event: session.event_id,
                customer_name: session.customer_name,
                customer_email: session.customer_email,
                customer_phone: phoneNumber,
                whatsapp_number: phoneNumber,
                total_amount: session.total_amount,
                tickets,
                metadata: {
                    slot_preferences: session.slot_preferences || [],
                    slot_allocation_message: session.slot_allocation_message || '',
                    booking_source: 'whatsapp',
                    slot_id: session.slot_id || null,
                    slot_start_time: session.slot_start_time || null,
                    slot_end_time: session.slot_end_time || null,
                    ticket_types: tickets.map(t => ({
                        tier_id: t.tier_id,
                        attendee_name: t.attendee_name,
                        tier_name: t.tier_name,
                    })),
                    tier_ids: [...new Set(tickets.map(t => t.tier_id))],
                    tier_quantities: tickets.reduce((acc, t) => {
                        const key = String(t.tier_id);
                        acc[key] = (acc[key] || 0) + 1;
                        return acc;
                    }, {}),
                    total_tickets: tickets.length,
                },
            };

            console.log('📝 Creating booking with data:', JSON.stringify(bookingData, null, 2));

            const { data: booking } = await api.post('/bookings/', bookingData);

            session.booking_reference = booking.booking_reference;
            session.step = FLOW.IDLE;
            session.waiting_for_confirm = false;

            await this.sendMessage(sender, this._buildBookingConfirmationMessage(session, booking, tz));
            delete this.userSessions[sender];
        } catch (error) {
            console.error('❌ Error creating booking:', error.message);
            if (error.response) {
                console.error('Status:', error.response.status);
                console.error('Data:', JSON.stringify(error.response.data, null, 2));
            }
            await this.sendMessage(sender,
                `❌ Sorry, there was an error creating your booking.\n`
                + `Please try again or contact support.`
            );
        }
    }

    _buildBookingConfirmationMessage(session, booking, tz) {
        let message = `✅ *Booking Confirmed!*\n\n`;
        message += `🎫 *Booking Reference:* ${booking.booking_reference}\n`;
        message += `📅 Event: ${session.event_title}\n`;

        if (session.slot_start_time) {
            message += `🕐 Allocated Slot: ${formatEventTime(session.slot_start_time, tz)}\n`;
            if (session.slot_preferences?.length > 0) {
                const allocatedSlotNumber = session.sessions.findIndex(s => s.id === session.slot_id) + 1;
                const preferenceRank = session.slot_preferences.indexOf(allocatedSlotNumber) + 1;
                if (preferenceRank > 0) {
                    message += `🎯 Allocated based on Preference #${preferenceRank}\n`;
                }
            }
        }

        message += `🎟️ Total Tickets: ${session.total_tickets}\n`;
        message += `💳 Total: ₹${session.total_amount}\n\n`;
        message += `📌 *Next Steps:*\n`;
        message += `1. Please complete the payment at the venue/counter\n`;
        message += `2. Share your booking reference: *${booking.booking_reference}*\n`;
        message += `3. You will receive your tickets after payment confirmation\n\n`;

        message += this.whatsappTicketDeliveryEnabled
            ? `📱 You will receive your tickets via WhatsApp and Email.\n\n`
            : `📧 You will receive your tickets via Email only.\n\n`;

        message += `Thank you for choosing TicketVolt! 🎉`;
        return message;
    }

    // ============ Ticket delivery ============
    async sendTickets(sender, bookingId) {
        try {
            if (!this.whatsappTicketDeliveryEnabled) {
                console.log(`ℹ️ WhatsApp ticket delivery is disabled. Not sending tickets via WhatsApp for booking: ${bookingId}`);
                return { success: false, error: 'WhatsApp ticket delivery is disabled', disabled: true };
            }

            const api = this.getApiClient(true);
            const { data: booking } = await api.get(`/bookings/${bookingId}/`);
            const tickets = booking.tickets || [];

            if (tickets.length === 0) {
                await this.sendMessage(sender, '❌ No tickets found for this booking.');
                return { success: false, error: 'No tickets found' };
            }

            const senderPhone = extractNormalizedPhoneNumber(sender);
            console.log(`📤 Admin sending ${tickets.length} tickets to ${senderPhone}`);

            // Attempt a single combined PDF first.
            try {
                const pdfResponse = await api.get(`/bookings/${bookingId}/pdf/`, {
                    responseType: 'arraybuffer',
                });
                if (pdfResponse.data) {
                    await this.sendDocument(
                        sender,
                        Buffer.from(pdfResponse.data),
                        `tickets_${booking.booking_reference}.pdf`,
                        `🎫 Your Tickets for: ${booking.event_title || 'Event'}\nBooking: ${booking.booking_reference}`
                    );
                    console.log(`✅ PDF sent for booking: ${booking.booking_reference}`);
                }
            } catch {
                console.log('⚠️ PDF generation not available, sending individual tickets...');
            }

            for (let i = 0; i < tickets.length; i++) {
                await this._sendSingleTicket(sender, booking, tickets[i], i, tickets.length);
                await new Promise(r => setTimeout(r, 800));
            }

            await this.sendMessage(sender,
                `✅ *All tickets delivered!*\n\n`
                + `📱 Keep this chat for check-in updates.\n`
                + `🎉 Enjoy the event!`
            );

            return { success: true, message: 'Tickets sent successfully' };
        } catch (error) {
            console.error('❌ Error sending tickets:', error.message);
            await this.sendMessage(sender,
                `⚠️ Booking confirmed but tickets could not be delivered.\n`
                + `Contact support with: ${bookingId}`
            );
            return { success: false, error: error.message };
        }
    }

    async _sendSingleTicket(sender, booking, ticket, index, total) {
        const ticketCode = ticket.unique_code;
        const attendeeName = ticket.attendee_name || 'Guest';

        let message = `🎫 *Ticket ${index + 1} of ${total}*\n\n`;
        message += `┌─────────────────────────────\n`;
        message += `│ 📍 Code: ${ticketCode}\n`;
        message += `│ 👤 Attendee: ${attendeeName}\n`;
        message += `│ 📅 Event: ${booking.event_title}\n`;
        message += `└─────────────────────────────\n\n`;
        message += `📌 Scan the QR code at the entrance.`;

        await this.sendMessage(sender, message);

        if (!ticket.qr_code) return;

        try {
            let qrData = ticket.qr_code;
            if (qrData.startsWith('data:image')) qrData = qrData.split(',')[1];
            await this.sendImage(sender, qrData,
                `🎫 Ticket: ${ticketCode}\nAttendee: ${attendeeName}`);
            console.log(`✅ QR code sent for ticket ${ticketCode}`);
        } catch (error) {
            console.error(`❌ Failed to send QR image for ${ticketCode}:`, error.message);
        }
    }

    // ============ Status ============
    getQrCode() { return this.qrCode; }
    getBotNumber() { return this.botNumber; }
    isConnected() { return this.isConnectedFlag; }

    getStatus() {
        return {
            connected: this.isConnectedFlag,
            queuedMessages: this.messageQueue.length,
            qrCode: this.qrCode,
            initializing: this.isInitializing,
            botNumber: this.botNumber,
            whatsappEnabled: this.whatsappEnabled,
            whatsappTicketDeliveryEnabled: this.whatsappTicketDeliveryEnabled,
        };
    }
}

module.exports = new WhatsAppService();