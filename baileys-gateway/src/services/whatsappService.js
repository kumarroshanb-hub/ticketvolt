// baileys-gateway/src/services/whatsappService.js
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRCode = require('qrcode-terminal');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const logger = require('../utils/logger');

// Try to import qrcode for better QR generation
let QRCodeLib;
try {
    QRCodeLib = require('qrcode');
} catch (e) {
    QRCodeLib = null;
}

class WhatsAppService {
    constructor() {
        this.sock = null;
        this.isConnected = false;
        this.qrCode = null;
        this.authFolder = path.join(__dirname, '../../sessions');
        this.messageQueue = [];
        this.isInitializing = false;

        this.djangoApiUrl = process.env.DJANGO_API_URL || 'http://backend:8000/api';
        this.adminToken = process.env.ADMIN_TOKEN || '';

        // Separate flags for different functionality
        this.whatsappEnabled = process.env.WHATSAPP_ENABLED === 'True';
        this.whatsappTicketDeliveryEnabled = process.env.WHATSAPP_TICKET_DELIVERY_ENABLED === 'True';

        console.log('📋 WhatsAppService initialized with:');
        console.log(`   DJANGO_API_URL: ${this.djangoApiUrl}`);
        console.log(`   ADMIN_TOKEN: ${this.adminToken ? '✅ Present' : '❌ MISSING'}`);
        console.log(`   WHATSAPP_ENABLED (Bot): ${this.whatsappEnabled ? '✅ YES' : '❌ NO'}`);
        console.log(`   WHATSAPP_TICKET_DELIVERY_ENABLED: ${this.whatsappTicketDeliveryEnabled ? '✅ YES' : '❌ NO'}`);

        this.userSessions = {};
        this.botNumber = null;
        this.FLOW = {
            IDLE: 'idle',
            SELECT_EVENT: 'select_event',
            SELECT_SLOTS: 'select_slots',
            SELECT_TIERS: 'select_tiers',
            ENTER_TIER_QUANTITIES: 'enter_tier_quantities',
            ENTER_ATTENDEE_NAMES: 'enter_attendee_names',
            ENTER_NAME: 'enter_name',
            ENTER_EMAIL: 'enter_email',
            CONFIRM: 'confirm'
        };
    }

    // ============ getApiClient with optional auth ============
    getApiClient(useAuth = true) {
        const token = this.adminToken || '';
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
        if (useAuth && token && token.length > 10) {
            headers['Authorization'] = `Bearer ${token}`;
            console.log('🔑 Using authenticated client');
        } else {
            console.log('🔓 Using public client (no auth)');
        }
        return axios.create({
            baseURL: this.djangoApiUrl,
            timeout: 15000,
            headers: headers
        });
    }

    // ============================================================
    // ✅ TIMEZONE & DURATION HELPERS (NEW)
    // ============================================================

    /**
     * Format a date string in the event's specific timezone.
     * Returns something like "10 Jun 2026, 07:00 am IST"
     */
    formatEventDate(dateString, timezone) {
        if (!dateString) return 'TBD';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'TBD';

            // Guard against invalid timezone strings; fall back to UTC.
            let tz = timezone;
            try {
                new Intl.DateTimeFormat('en-IN', { timeZone: tz });
            } catch (e) {
                console.warn(`⚠️ Invalid timezone "${timezone}", falling back to UTC`);
                tz = 'UTC';
            }

            const formatter = new Intl.DateTimeFormat('en-IN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
                timeZone: tz,
                timeZoneName: 'short',
            });
            return formatter.format(date);
        } catch (e) {
            console.error('Error formatting event date:', e.message);
            // Last-resort fallback
            return new Date(dateString).toLocaleString('en-IN');
        }
    }

    /**
     * Format just the time part in the event's timezone.
     * Returns something like "07:00 am IST"
     */
    formatEventTime(dateString, timezone) {
        if (!dateString) return 'TBD';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'TBD';

            let tz = timezone;
            try {
                new Intl.DateTimeFormat('en-IN', { timeZone: tz });
            } catch (e) {
                tz = 'UTC';
            }

            const formatter = new Intl.DateTimeFormat('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
                timeZone: tz,
                timeZoneName: 'short',
            });
            return formatter.format(date);
        } catch (e) {
            return new Date(dateString).toLocaleTimeString('en-IN');
        }
    }

    /**
     * Format just the date part in the event's timezone.
     * Returns something like "10 Jun 2026"
     */
    formatEventDateOnly(dateString, timezone) {
        if (!dateString) return 'TBD';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'TBD';

            let tz = timezone;
            try {
                new Intl.DateTimeFormat('en-IN', { timeZone: tz });
            } catch (e) {
                tz = 'UTC';
            }

            const formatter = new Intl.DateTimeFormat('en-IN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                timeZone: tz,
            });
            return formatter.format(date);
        } catch (e) {
            return new Date(dateString).toLocaleDateString('en-IN');
        }
    }

    /**
     * Calculate and format the duration between two dates.
     * Handles same-day and multi-day events.
     * Returns something like "4 hour(s) 30 minute(s)" or "Spans 2 days"
     */
    formatEventDuration(startStr, endStr) {
        if (!startStr || !endStr) return 'Duration not specified';
        try {
            const start = new Date(startStr);
            const end = new Date(endStr);
            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                return 'Duration not specified';
            }

            const diffMs = end - start;
            if (diffMs < 0) return 'Invalid duration';

            const startDay = start.toDateString();
            const endDay = end.toDateString();

            // Multi-day event
            if (startDay !== endDay) {
                const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
                // Round up if it crosses into a new day partially
                const totalDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
                return `Spans ${totalDays} day(s)`;
            }

            const totalMinutes = Math.floor(diffMs / 60000);
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;

            const parts = [];
            if (hours > 0) parts.push(`${hours} hour(s)`);
            if (minutes > 0) parts.push(`${minutes} minute(s)`);

            if (parts.length === 0) return '< 1 minute';

            return parts.join(' ');
        } catch (e) {
            console.error('Error formatting event duration:', e.message);
            return 'Duration not specified';
        }
    }

    // ============ INITIALIZE ============
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
                logger: logger,
                browser: ['TicketVolt', 'Chrome', '1.0.0'],
                syncFullHistory: false,
                markOnlineOnConnect: false,
            });

            this.sock.ev.on('creds.update', saveCreds);

            this.sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    this.qrCode = qr;
                    console.log('\n' + '='.repeat(80));
                    console.log('📱 SCAN THIS QR CODE WITH WHATSAPP:');
                    console.log('='.repeat(80));

                    try {
                        QRCode.generate(qr, { small: true });
                    } catch (err) {
                        console.log('⚠️ Could not generate terminal QR, trying alternative...');
                    }

                    if (QRCodeLib) {
                        try {
                            console.log('\n📱 QR Code (Alternative view):');
                            const qrTerminal = await QRCodeLib.toString(qr, {
                                type: 'terminal',
                                small: true,
                                margin: 1
                            });
                            console.log(qrTerminal);
                        } catch (err) { /* ignore */ }
                    }

                    console.log('\n📱 QR Code Data URL (copy and paste in browser):');
                    console.log(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`);

                    try {
                        const qrImagePath = path.join(__dirname, '../../qr-code.png');
                        if (QRCodeLib) {
                            await QRCodeLib.toFile(qrImagePath, qr, {
                                width: 400,
                                margin: 2,
                                color: { dark: '#000000', light: '#ffffff' }
                            });
                            console.log(`\n📱 QR Code saved to: ${qrImagePath}`);
                        }
                    } catch (err) { /* ignore */ }

                    console.log('\n' + '='.repeat(80));
                    console.log('⚠️  Scan the QR code above with your WhatsApp mobile app\n');
                }

                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                    console.log(`🔌 Connection closed. Reconnecting: ${shouldReconnect}`);

                    if (shouldReconnect) {
                        this.isConnected = false;
                        this.isInitializing = false;
                        setTimeout(() => this.initialize(), 5000);
                    } else {
                        console.log('❌ Logged out. Please restart and scan QR again.');
                        this.isConnected = false;
                        this.isInitializing = false;
                    }
                }

                if (connection === 'open') {
                    this.isConnected = true;
                    this.isInitializing = false;
                    console.log('\n✅ WhatsApp connected successfully!');
                    console.log('📱 Ready to send and receive messages!\n');

                    try {
                        const authInfo = this.sock.authState.creds;
                        if (authInfo && authInfo.me) {
                            this.botNumber = authInfo.me.id.split(':')[0];
                            console.log(`📱 Bot Number: ${this.botNumber}`);
                        }
                    } catch (e) {
                        console.log('📱 Could not retrieve bot number');
                    }

                    this.processMessageQueue();
                }
            });

            this.sock.ev.on('messages.upsert', async (m) => {
                const msg = m.messages[0];
                if (!msg.key.fromMe && msg.message) {
                    await this.handleIncomingMessage(msg);
                }
            });

            console.log('🔄 Connecting to WhatsApp...');
        } catch (error) {
            console.error('❌ Failed to initialize WhatsApp:', error);
            this.isInitializing = false;
        }
    }

    // ============ SEND IMAGE ============
    async sendImage(jid, imageBuffer, caption = '') {
        if (!this.isConnected) {
            console.log('📥 Image queued (not connected)');
            return { status: 'queued' };
        }

        try {
            let buffer = imageBuffer;
            if (typeof imageBuffer === 'string') {
                if (imageBuffer.startsWith('data:image')) {
                    imageBuffer = imageBuffer.split(',')[1];
                }
                buffer = Buffer.from(imageBuffer, 'base64');
            }

            const result = await this.sock.sendMessage(jid, {
                image: buffer,
                caption: caption || ''
            });
            console.log(`✅ Image sent successfully`);
            return { status: 'sent', result };
        } catch (error) {
            console.error(`❌ Failed to send image:`, error.message);
            throw error;
        }
    }

    // ============ SEND DOCUMENT (PDF) ============
    async sendDocument(jid, fileData, filename = 'ticket.pdf', caption = '') {
        if (!this.isConnected) {
            console.log('📥 Document queued (not connected)');
            return { status: 'queued' };
        }

        try {
            let buffer = fileData;
            if (typeof fileData === 'string') {
                if (fileData.startsWith('data:application/pdf')) {
                    fileData = fileData.split(',')[1];
                }
                buffer = Buffer.from(fileData, 'base64');
            }

            const result = await this.sock.sendMessage(jid, {
                document: buffer,
                mimetype: 'application/pdf',
                filename: filename || 'ticket.pdf',
                caption: caption || ''
            });

            console.log(`✅ Document sent successfully: ${filename}`);
            return { status: 'sent', result };
        } catch (error) {
            console.error(`❌ Failed to send document:`, error.message);
            throw error;
        }
    }

    // ============ SEND FILE ============
    async sendFile(jid, fileData, filename = 'file.pdf', caption = '') {
        if (!this.isConnected) {
            console.log('📥 File queued (not connected)');
            return { status: 'queued' };
        }

        try {
            let buffer = fileData;
            if (typeof fileData === 'string') {
                if (fileData.startsWith('data:')) {
                    fileData = fileData.split(',')[1];
                }
                buffer = Buffer.from(fileData, 'base64');
            }

            const ext = filename.split('.').pop().toLowerCase();
            let mimetype = 'application/octet-stream';
            switch (ext) {
                case 'pdf': mimetype = 'application/pdf'; break;
                case 'png': mimetype = 'image/png'; break;
                case 'jpg':
                case 'jpeg': mimetype = 'image/jpeg'; break;
                case 'txt': mimetype = 'text/plain'; break;
                case 'json': mimetype = 'application/json'; break;
            }

            const result = await this.sock.sendMessage(jid, {
                document: buffer,
                mimetype: mimetype,
                filename: filename || 'file.pdf',
                caption: caption || ''
            });

            console.log(`✅ File sent successfully: ${filename}`);
            return { status: 'sent', result };
        } catch (error) {
            console.error(`❌ Failed to send file:`, error.message);
            throw error;
        }
    }

    // ============ EXTRACT PHONE NUMBER FROM JID ============
    extractPhoneNumber(jid) {
        try {
            if (!jid) return null;

            let number = jid.split('@')[0];
            number = number.split(':')[0];
            number = number.replace(/\D/g, '');

            if (!number || number.length < 10 || number.length > 15) {
                console.warn(`⚠️ Invalid phone number format: ${number} from JID: ${jid}`);
                return null;
            }

            if (number.length === 10) {
                return number;
            }
            if (number.length === 12 && number.startsWith('91')) {
                return number.substring(2);
            }

            return number;

        } catch (error) {
            console.error('Error extracting phone number:', error);
            return null;
        }
    }

    // ============ EXTRACT SENDER ID ============
    extractSenderId(jid) {
        try {
            let id = jid.split('@')[0];
            id = id.split(':')[0];
            id = id.replace(/\D/g, '');

            if (!id || id.length < 10 || id.length > 15) {
                console.warn(`⚠️ Invalid sender ID: ${id} from JID: ${jid}`);
                return null;
            }

            if (id.length === 10) {
                return id;
            }

            if (id.length === 12 && id.startsWith('91')) {
                return id.substring(2);
            }

            return id;

        } catch (error) {
            console.error('Error extracting sender ID:', error);
            return null;
        }
    }

    // ============ FORMAT PHONE NUMBER FOR DISPLAY ============
    formatPhoneForDisplay(phone) {
        if (!phone) return 'Unknown';

        let cleaned = phone.replace(/\D/g, '');

        if (cleaned.length === 10) {
            return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
        }
        if (cleaned.length === 12 && cleaned.startsWith('91')) {
            const number = cleaned.slice(2);
            return `+91 ${number.slice(0, 5)} ${number.slice(5)}`;
        }
        return cleaned;
    }

    // ============ HANDLE INCOMING MESSAGES ============
    async handleIncomingMessage(msg) {
        if (!this.whatsappEnabled) {
            console.log('ℹ️ WhatsApp bot is disabled. Ignoring message.');
            return;
        }

        try {
            const sender = msg.key.remoteJid;
            const phoneNumber = this.extractSenderId(sender);

            if (!phoneNumber) {
                console.warn(`⚠️ Could not extract phone number from JID: ${sender}`);
                await this.sendMessage(sender,
                    `❌ Could not identify your phone number. Please ensure you're using WhatsApp on your phone.`
                );
                return;
            }

            const displayId = this.formatPhoneForDisplay(phoneNumber);
            const text = msg.message?.conversation ||
                        msg.message?.extendedTextMessage?.text ||
                        msg.message?.imageMessage?.caption || '';

            console.log(`📩 From ${displayId} (${phoneNumber}): ${text}`);

            if (!this.userSessions[sender]) {
                this.userSessions[sender] = {
                    step: this.FLOW.IDLE,
                    phone_number: phoneNumber,
                    event_id: null,
                    event_timezone: null, // ✅ store timezone for later messages
                    slot_preferences: [],
                    selected_slot: null,
                    slot_id: null,
                    slot_start_time: null,
                    slot_end_time: null,
                    slot_allocation_message: '',
                    tiers: [],
                    selected_tiers: [],
                    tier_attendees: {},
                    customer_name: '',
                    customer_email: '',
                    event_title: '',
                    total_amount: 0,
                    total_tickets: 0,
                    events: [],
                    sessions: [],
                    booking_reference: '',
                    attendees: [],
                    ticket_list: [],
                    attendee_index: 0,
                    waiting_for_confirm: false
                };
            } else {
                this.userSessions[sender].phone_number = phoneNumber;
            }

            await this.processCommand(sender, text);
        } catch (error) {
            console.error('❌ Error:', error.message);
            await this.sendMessage(sender, '❌ Sorry, something went wrong. Please try again.');
        }
    }

    // ============ PROCESS COMMAND ============
    async processCommand(sender, text) {
        const session = this.userSessions[sender];
        const lowerText = text.toLowerCase().trim();

        if (lowerText === 'help' || lowerText === 'menu') {
            await this.showMenu(sender);
            return;
        }

        if (lowerText === 'cancel' || lowerText === 'exit') {
            session.step = this.FLOW.IDLE;
            session.waiting_for_confirm = false;
            await this.sendMessage(sender, '❌ Booking cancelled. Type *book* to start again.');
            return;
        }

        if (lowerText === 'book' || lowerText === 'booking') {
            await this.startBooking(sender);
            return;
        }

        if (lowerText === 'events') {
            await this.showEvents(sender);
            return;
        }

        // ✅ Handle "confirm" command when waiting for it
        if (lowerText === 'confirm' && session.waiting_for_confirm) {
            session.waiting_for_confirm = false;

            // ✅ Check if tiers exist, if not try to fetch them
            if (!session.tiers || session.tiers.length === 0) {
                console.log('⚠️ No tiers in session, fetching from API...');
                try {
                    const api = this.getApiClient(false);
                    const response = await api.get(`/events/public/${session.event_id}/`);
                    const eventData = response.data;
                    session.tiers = eventData.tiers || [];
                    if (eventData.timezone) session.event_timezone = eventData.timezone;
                    console.log(`📋 Fetched ${session.tiers.length} tiers from API`);
                } catch (error) {
                    console.error('❌ Failed to fetch tiers:', error.message);
                }
            }

            if (session.tiers && session.tiers.length > 0) {
                session.step = this.FLOW.SELECT_TIERS;
                await this.showTierSelection(sender);
            } else {
                await this.sendMessage(sender,
                    `❌ No ticket tiers available for this event.\n\n` +
                    `Please start over by typing *book*.`
                );
                session.step = this.FLOW.IDLE;
            }
            return;
        }

        switch (session.step) {
            case this.FLOW.SELECT_EVENT:
                await this.handleEventSelection(sender, text);
                break;
            case this.FLOW.SELECT_SLOTS:
                await this.handleSlotPreferences(sender, text);
                break;
            case this.FLOW.SELECT_TIERS:
                await this.handleTierSelections(sender, text);
                break;
            case this.FLOW.ENTER_TIER_QUANTITIES:
                await this.handleTierQuantities(sender, text);
                break;
            case this.FLOW.ENTER_ATTENDEE_NAMES:
                await this.handleAttendeeNames(sender, text);
                break;
            case this.FLOW.ENTER_NAME:
                await this.handleCustomerName(sender, text);
                break;
            case this.FLOW.ENTER_EMAIL:
                await this.handleCustomerEmail(sender, text);
                break;
            case this.FLOW.CONFIRM:
                await this.handleConfirmation(sender, text);
                break;
            default:
                await this.sendMessage(sender,
                    `👋 Welcome to TicketVolt!\n\n` +
                    `Type *book* to book tickets\n` +
                    `Type *events* to see events\n` +
                    `Type *help* for menu`
                );
        }
    }

    // ============ SHOW MENU ============
    async showMenu(sender) {
        let message = `
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

💡 *Ticket Delivery:*\n`;

        if (this.whatsappTicketDeliveryEnabled) {
            message += `   📱 WhatsApp + Email (after payment)\n`;
        } else {
            message += `   📧 Email only (after payment)\n`;
        }

        message += `\nThank you for choosing TicketVolt! 🎫`;

        await this.sendMessage(sender, message);
    }

    // ============ SHOW EVENTS (FIXED: TIMEZONE + DURATION) ============
    async showEvents(sender) {
        try {
            console.log('🔍 Fetching events from public endpoint...');
            const api = this.getApiClient(false);

            const response = await api.get('/events/public/');
            const events = response.data.results || response.data;

            console.log(`✅ Events fetched via public endpoint: ${events.length}`);

            const activeEvents = events.filter(e =>
                e.status === 'active' || e.status === 'published'
            );

            if (!activeEvents || activeEvents.length === 0) {
                await this.sendMessage(sender, '❌ No active events at the moment.');
                return;
            }

            const session = this.userSessions[sender];
            session.events = activeEvents;
            session.step = this.FLOW.SELECT_EVENT;

            let message = '📅 *Select an Event*\n\n';

            activeEvents.forEach((event, index) => {
                // ✅ FIX: Use the event's own timezone for date formatting
                const formattedDate = this.formatEventDateOnly(event.start_date, event.timezone);
                // ✅ FIX: Show duration instead of just the start time
                const duration = this.formatEventDuration(event.start_date, event.end_date);
                // ✅ Also show the start time in the event's local timezone
                const startTime = this.formatEventTime(event.start_date, event.timezone);

                message += `${index + 1}. *${event.title}*\n`;
                message += `   📅 ${formattedDate}\n`;
                message += `   🕐 Starts at ${startTime}\n`;
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
                `❌ Unable to fetch events. Please try again later.\n` +
                `Error: ${error.message}`
            );
        }
    }

    // ============ START BOOKING ============
    async startBooking(sender) {
        await this.showEvents(sender);
    }

    // ============ HANDLE EVENT SELECTION (FIXED: TIMEZONE IN SLOTS) ============
    async handleEventSelection(sender, text) {
        const session = this.userSessions[sender];
        const choice = parseInt(text);

        if (isNaN(choice) || choice < 1 || choice > session.events.length) {
            await this.sendMessage(sender, '❌ Invalid choice. Please enter a valid number.');
            return;
        }

        const selectedEvent = session.events[choice - 1];
        session.event_id = selectedEvent.id;
        session.event_title = selectedEvent.title;
        session.selected_tiers = [];
        session.tier_attendees = {};
        session.total_amount = 0;
        session.total_tickets = 0;
        session.slot_preferences = [];
        session.selected_slot = null;
        session.waiting_for_confirm = false;

        try {
            const api = this.getApiClient(false);

            console.log(`📡 Fetching event ${selectedEvent.id} from public endpoint...`);
            const response = await api.get(`/events/public/${selectedEvent.id}/`);
            const eventData = response.data;

            const sessions = eventData.sessions || [];
            const tiers = eventData.tiers || [];

            // ✅ Store the event's timezone on the session so subsequent
            //    messages (slots, summary, confirmation) can use it too.
            session.event_timezone = eventData.timezone || selectedEvent.timezone || 'UTC';
            console.log(`🕐 Event timezone: ${session.event_timezone}`);

            // ✅ ALWAYS store tiers in session, even if there are sessions
            session.tiers = tiers;
            console.log(`📋 Stored ${tiers.length} tiers in session`);

            if (sessions.length > 0) {
                session.sessions = sessions;
                session.step = this.FLOW.SELECT_SLOTS;

                // ✅ FIX: Show the event's date, time and duration at the top
                const eventDate = this.formatEventDateOnly(eventData.start_date, session.event_timezone);
                const eventDuration = this.formatEventDuration(eventData.start_date, eventData.end_date);

                let message = `🕐 *Select Your Preferred Slots*\n\n`;
                message += `Event: *${selectedEvent.title}*\n`;
                message += `📅 ${eventDate}\n`;
                message += `⏱️ Duration: ${eventDuration}\n\n`;
                message += `📋 Available Slots:\n\n`;

                sessions.forEach((slot, index) => {
                    // ✅ FIX: Format slot times in the event's timezone
                    const start = this.formatEventTime(slot.start_time, session.event_timezone);
                    const end = this.formatEventTime(slot.end_time, session.event_timezone);
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

                await this.sendMessage(sender, message);
            } else if (tiers.length > 0) {
                session.sessions = [];
                session.step = this.FLOW.SELECT_TIERS;
                await this.showTierSelection(sender);
            } else {
                await this.sendMessage(sender, '❌ No ticket tiers available for this event.');
                session.step = this.FLOW.IDLE;
            }
        } catch (error) {
            console.error('Error fetching event details:', error.message);
            await this.sendMessage(sender, '❌ Unable to fetch event details. Please try again.');
            session.step = this.FLOW.IDLE;
        }
    }

    // ============ HANDLE SLOT PREFERENCES (FIXED: TIMEZONE) ============
    async handleSlotPreferences(sender, text) {
        const session = this.userSessions[sender];
        const tz = session.event_timezone || 'UTC';

        // Parse comma-separated slot preferences
        const preferences = text.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));

        if (preferences.length === 0) {
            await this.sendMessage(sender,
                `❌ Invalid input. Please enter slot numbers separated by commas.\n` +
                `Example: *1,3,2*\n\n` +
                `Or type *cancel* to start over.`
            );
            return;
        }

        // Validate all choices
        const invalidChoices = preferences.filter(n => n < 1 || n > session.sessions.length);
        if (invalidChoices.length > 0) {
            await this.sendMessage(sender,
                `❌ Invalid choice(s): ${invalidChoices.join(', ')}. Please enter numbers between 1 and ${session.sessions.length}.`
            );
            return;
        }

        // Remove duplicates while preserving order
        const uniquePreferences = [];
        const seen = new Set();
        for (const pref of preferences) {
            if (!seen.has(pref)) {
                seen.add(pref);
                uniquePreferences.push(pref);
            }
        }

        session.slot_preferences = uniquePreferences;

        let allocatedSlot = null;
        let allocatedSlotIndex = null;
        let allocationMessage = "";
        let checkedSlots = [];

        for (const pref of uniquePreferences) {
            const slotIndex = pref - 1;
            const slot = session.sessions[slotIndex];
            const remaining = slot.capacity - slot.booked;

            checkedSlots.push({
                preference: uniquePreferences.indexOf(pref) + 1,
                slot_number: pref,
                start_time: new Date(slot.start_time),
                end_time: new Date(slot.end_time),
                available: remaining > 0,
                remaining: remaining,
                is_allocated: false
            });

            if (remaining > 0 && !allocatedSlot) {
                allocatedSlot = slot;
                allocatedSlotIndex = slotIndex;
                allocationMessage = `Allocated based on your Preference #${uniquePreferences.indexOf(pref) + 1}`;
                checkedSlots[checkedSlots.length - 1].is_allocated = true;
                break;
            }
        }

        if (!allocatedSlot) {
            for (let i = 0; i < session.sessions.length; i++) {
                const slot = session.sessions[i];
                const remaining = slot.capacity - slot.booked;

                const alreadyChecked = checkedSlots.some(s => s.slot_number === (i + 1));

                if (!alreadyChecked && remaining > 0) {
                    allocatedSlot = slot;
                    allocatedSlotIndex = i;
                    allocationMessage = "Allocated to the next available slot (your preferred slots were full)";
                    checkedSlots.push({
                        preference: null,
                        slot_number: i + 1,
                        start_time: new Date(slot.start_time),
                        end_time: new Date(slot.end_time),
                        available: true,
                        remaining: remaining,
                        is_allocated: true
                    });
                    break;
                }
            }
        }

        if (!allocatedSlot) {
            let message = `❌ *No Slots Available*\n\n`;
            message += `Unfortunately, all slots are currently fully booked.\n\n`;
            message += `📋 *Your Preferences & Availability:*\n\n`;

            checkedSlots.forEach(status => {
                const availability = status.available ? `✅ ${status.remaining} seats` : '❌ Fully booked';
                // ✅ FIX: format with event's timezone
                const startStr = this.formatEventTime(status.start_time.toISOString(), tz);
                const endStr = this.formatEventTime(status.end_time.toISOString(), tz);
                message += `Preference ${status.preference}: Slot ${status.slot_number}\n`;
                message += `   ${startStr} - ${endStr}\n`;
                message += `   ${availability}\n\n`;
            });

            message += `💡 Please try again later or contact support.\n`;
            message += `Type *cancel* to start over.`;

            await this.sendMessage(sender, message);
            return;
        }

        session.selected_slot = allocatedSlot;
        session.slot_id = allocatedSlot.id;
        session.slot_start_time = allocatedSlot.start_time;
        session.slot_end_time = allocatedSlot.end_time;
        session.slot_allocation_message = allocationMessage;

        let message = `✅ *Slot Allocated Successfully!*\n\n`;
        message += `🎯 *Allocated Slot:* Slot ${allocatedSlotIndex + 1}\n`;

        // ✅ FIX: format with event's timezone
        const startStr = this.formatEventTime(allocatedSlot.start_time, tz);
        const endStr = this.formatEventTime(allocatedSlot.end_time, tz);

        message += `   🕐 ${startStr} - ${endStr}\n`;
        message += `   ✅ ${allocatedSlot.capacity - allocatedSlot.booked} seats remaining\n\n`;
        message += `📋 *Your Preferences:*\n\n`;

        checkedSlots.forEach((status) => {
            const availability = status.available ? `✅ ${status.remaining} seats` : '❌ Fully booked';
            const allocatedMark = status.is_allocated ? ' 🎯 *ALLOCATED*' : '';
            const prefLabel = status.preference ? `Preference ${status.preference}` : 'Fallback';
            // ✅ FIX: format with event's timezone
            const s = this.formatEventTime(status.start_time.toISOString(), tz);
            const e = this.formatEventTime(status.end_time.toISOString(), tz);
            message += `${prefLabel}: Slot ${status.slot_number}${allocatedMark}\n`;
            message += `   ${s} - ${e}\n`;
            message += `   ${availability}\n\n`;
        });

        message += `✅ Your slot has been automatically allocated based on your preferences.\n\n`;
        message += `Type *confirm* to proceed with ticket selection, or *cancel* to start over.`;

        // ✅ Set waiting_for_confirm flag
        session.waiting_for_confirm = true;
        session.step = this.FLOW.SELECT_SLOTS;
        await this.sendMessage(sender, message);
    }

    // ============ SHOW TIER SELECTION (FIXED: TIMEZONE) ============
    async showTierSelection(sender) {
        const session = this.userSessions[sender];
        const tiers = session.tiers;
        const tz = session.event_timezone || 'UTC';

        console.log(`📋 showTierSelection: ${tiers ? tiers.length : 0} tiers available`);

        // ✅ Check if there are any tiers available
        if (!tiers || tiers.length === 0) {
            await this.sendMessage(sender, '❌ No ticket tiers available for this event.');
            session.step = this.FLOW.IDLE;
            return;
        }

        let message = `🎟️ *Select Ticket Types*\n\n`;
        message += `Event: *${session.event_title}*\n`;
        if (session.slot_start_time) {
            // ✅ FIX: format slot time in event's timezone
            const start = this.formatEventTime(session.slot_start_time, tz);
            message += `🕐 Slot: ${start} (allocated based on your preferences)\n`;
        }
        message += `\n📋 Available Tickets:\n\n`;

        tiers.forEach((tier, index) => {
            const available = (tier.quantity_total || 0) - (tier.quantity_sold || 0);
            const price = tier.price || 0;
            message += `${index + 1}. *${tier.name}* - ₹${price}\n`;
            message += `   Available: ${Math.max(0, available)}\n\n`;
        });

        message += `✏️ *How to select:*\n`;
        message += `Enter the numbers of the tiers you want, separated by commas.\n`;
        message += `Example: *1,2,4* (selects tiers 1, 2, and 4)\n\n`;
        message += `Reply with your choices, or type *cancel* to start over.`;

        session.step = this.FLOW.SELECT_TIERS;
        session.waiting_for_confirm = false;
        await this.sendMessage(sender, message);
    }

    // ============ HANDLE TIER SELECTIONS (Multiple) ============
    async handleTierSelections(sender, text) {
        const session = this.userSessions[sender];

        const choices = text.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));

        if (choices.length === 0) {
            await this.sendMessage(sender,
                `❌ Invalid input. Please enter numbers separated by commas.\n` +
                `Example: *1,2,4*\n\n` +
                `Or type *cancel* to start over.`
            );
            return;
        }

        const invalidChoices = choices.filter(n => n < 1 || n > session.tiers.length);
        if (invalidChoices.length > 0) {
            await this.sendMessage(sender,
                `❌ Invalid choice(s): ${invalidChoices.join(', ')}. Please enter numbers between 1 and ${session.tiers.length}.`
            );
            return;
        }

        const uniqueChoices = [...new Set(choices)];
        const selectedTiers = [];
        let soldOutTiers = [];

        uniqueChoices.forEach(choice => {
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
                    max_per_order: tier.max_per_order || 10
                });
            }
        });

        if (soldOutTiers.length > 0) {
            await this.sendMessage(sender,
                `⚠️ The following tiers are sold out: *${soldOutTiers.join(', ')}*\n\n` +
                `Please try again with available tiers.`
            );
            return;
        }

        if (selectedTiers.length === 0) {
            await this.sendMessage(sender,
                `❌ No valid tiers selected. Please try again.`
            );
            return;
        }

        session.selected_tiers = selectedTiers;
        session.current_tier_index = 0;
        session.step = this.FLOW.ENTER_TIER_QUANTITIES;

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

    // ============ HANDLE TIER QUANTITIES (FIXED: TIMEZONE) ============
    async handleTierQuantities(sender, text) {
        const session = this.userSessions[sender];
        const tz = session.event_timezone || 'UTC';

        const quantities = text.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));

        if (quantities.length !== session.selected_tiers.length) {
            await this.sendMessage(sender,
                `❌ Please enter exactly ${session.selected_tiers.length} quantities.\n` +
                `Example: *2,4,1*`
            );
            return;
        }

        let totalTickets = 0;
        let totalAmount = 0;
        let isValid = true;
        let errorMessages = [];

        session.selected_tiers.forEach((tier, index) => {
            const qty = quantities[index];
            const maxAllowed = Math.min(tier.max_available, tier.max_per_order);

            if (isNaN(qty) || qty < 1 || qty > maxAllowed) {
                isValid = false;
                errorMessages.push(`*${tier.tier_name}*: ${qty} (must be 1-${maxAllowed})`);
            } else {
                tier.quantity = qty;
                totalTickets += qty;
                totalAmount += tier.price * qty;
            }
        });

        if (!isValid) {
            await this.sendMessage(sender,
                `❌ Invalid quantities:\n${errorMessages.join('\n')}\n\n` +
                `Please try again with valid quantities.`
            );
            return;
        }

        session.total_tickets = totalTickets;
        session.total_amount = totalAmount;

        let message = `📋 *Ticket Selection Summary*\n\n`;
        message += `Event: *${session.event_title}*\n`;
        if (session.slot_start_time) {
            // ✅ FIX: format slot time in event's timezone
            const start = this.formatEventTime(session.slot_start_time, tz);
            message += `🕐 Slot: ${start} (allocated based on your preferences)\n`;
        }
        message += `\n*Selected Tickets:*\n`;
        session.selected_tiers.forEach(tier => {
            message += `   • ${tier.quantity} × ${tier.tier_name} - ₹${tier.quantity * tier.price}\n`;
        });
        message += `\n💰 Total Amount: *₹${totalAmount}*\n`;
        message += `🎫 Total Tickets: *${totalTickets}*\n\n`;
        message += `✅ Type *confirm* to proceed with these selections.\n`;
        message += `Type *cancel* to start over.`;

        session.step = this.FLOW.ENTER_ATTENDEE_NAMES;
        await this.sendMessage(sender, message);
    }

    // ============ HANDLE ATTENDEE NAMES ============
    async handleAttendeeNames(sender, text) {
        const session = this.userSessions[sender];
        const lowerText = text.toLowerCase().trim();

        if (lowerText === 'cancel') {
            session.step = this.FLOW.IDLE;
            session.waiting_for_confirm = false;
            await this.sendMessage(sender, '❌ Booking cancelled. Type *book* to start again.');
            return;
        }

        if (lowerText === 'confirm') {
            session.step = this.FLOW.ENTER_NAME;
            await this.sendMessage(sender,
                `👤 Enter your *full name* (for booking confirmation).`
            );
            return;
        }

        if (!session.attendees) {
            session.attendees = [];
            session.attendee_index = 0;

            session.ticket_list = [];
            session.selected_tiers.forEach(tier => {
                for (let i = 0; i < tier.quantity; i++) {
                    session.ticket_list.push({
                        tier_id: tier.tier_id,
                        tier_name: tier.tier_name,
                        ticket_number: i + 1,
                        total_in_tier: tier.quantity
                    });
                }
            });
        }

        if (session.attendees.length >= session.ticket_list.length) {
            session.step = this.FLOW.ENTER_NAME;
            await this.sendMessage(sender,
                `✅ All attendee names entered!\n\n` +
                `👤 Enter your *full name* (for booking confirmation).`
            );
            return;
        }

        const currentTicket = session.ticket_list[session.attendees.length];
        const tierName = currentTicket.tier_name;
        const ticketDisplay = currentTicket.total_in_tier > 1
            ? ` (Ticket ${currentTicket.ticket_number} of ${currentTicket.total_in_tier})`
            : '';

        let attendeeName = text.trim();
        if (attendeeName.toLowerCase() === 'skip') {
            attendeeName = session.customer_name || 'Guest';
        }

        if (!attendeeName || attendeeName.length < 2) {
            await this.sendMessage(sender,
                `❌ Please enter a valid name (at least 2 characters).\n` +
                `Type *skip* to use default name.`
            );
            return;
        }

        session.attendees.push({
            tier_id: currentTicket.tier_id,
            tier_name: tierName,
            name: attendeeName
        });

        if (!session.tier_attendees[currentTicket.tier_id]) {
            session.tier_attendees[currentTicket.tier_id] = [];
        }
        session.tier_attendees[currentTicket.tier_id].push(attendeeName);

        if (session.attendees.length >= session.ticket_list.length) {
            session.step = this.FLOW.ENTER_NAME;
            await this.sendMessage(sender,
                `✅ All attendee names entered!\n\n` +
                `👤 Enter your *full name* (for booking confirmation).`
            );
            return;
        }

        const nextTicket = session.ticket_list[session.attendees.length];
        const nextTierName = nextTicket.tier_name;
        const nextTicketDisplay = nextTicket.total_in_tier > 1
            ? ` (Ticket ${nextTicket.ticket_number} of ${nextTicket.total_in_tier})`
            : '';

        await this.sendMessage(sender,
            `👤 *Attendee ${session.attendees.length + 1} of ${session.ticket_list.length}*\n\n` +
            `Ticket Type: *${nextTierName}*${nextTicketDisplay}\n\n` +
            `Please enter the attendee's full name.\n` +
            `Type *skip* to use "${session.customer_name || 'Guest'}" as the name.`
        );
    }

    // ============ HANDLE CUSTOMER NAME ============
    async handleCustomerName(sender, text) {
        const session = this.userSessions[sender];
        session.customer_name = text.trim();
        session.step = this.FLOW.ENTER_EMAIL;

        await this.sendMessage(sender,
            `📧 Enter your *email address* (for booking confirmation).`
        );
    }

    // ============ HANDLE CUSTOMER EMAIL (FIXED: TIMEZONE) ============
    async handleCustomerEmail(sender, text) {
        const session = this.userSessions[sender];
        const tz = session.event_timezone || 'UTC';
        const email = text.trim();

        if (!email.includes('@') || !email.includes('.')) {
            await this.sendMessage(sender, '❌ Please enter a valid email address.');
            return;
        }

        session.customer_email = email;
        session.step = this.FLOW.CONFIRM;

        let message = `📋 *Booking Summary*\n\n`;
        message += `Event: *${session.event_title}*\n`;
        if (session.slot_start_time) {
            // ✅ FIX: format slot time in event's timezone
            const start = this.formatEventTime(session.slot_start_time, tz);
            message += `🕐 Slot: ${start}\n`;
        }
        message += `\n*Tickets:*\n`;
        session.selected_tiers.forEach(tier => {
            message += `   • ${tier.quantity} × ${tier.tier_name} - ₹${tier.quantity * tier.price}\n`;
            if (session.tier_attendees[tier.tier_id]) {
                session.tier_attendees[tier.tier_id].forEach((name, idx) => {
                    message += `      ${idx + 1}. ${name}\n`;
                });
            }
        });
        message += `\n💰 Total Amount: *₹${session.total_amount}*\n`;
        message += `👤 Customer: ${session.customer_name}\n`;
        message += `📧 Email: ${session.customer_email}\n\n`;
        message += `Type *confirm* to book or *cancel* to cancel.`;

        await this.sendMessage(sender, message);
    }

    // ============ HANDLE CONFIRMATION ============
    async handleConfirmation(sender, text) {
        const session = this.userSessions[sender];
        const lowerText = text.toLowerCase();

        if (lowerText === 'confirm') {
            await this.createBooking(sender);
        } else if (lowerText === 'cancel') {
            session.step = this.FLOW.IDLE;
            session.waiting_for_confirm = false;
            await this.sendMessage(sender, '❌ Booking cancelled. Type *book* to start again.');
        } else {
            await this.sendMessage(sender,
                `❌ Please type *confirm* to book or *cancel* to cancel.`
            );
        }
    }

    // ============ CREATE BOOKING (FIXED: TIMEZONE) ============
    async createBooking(sender) {
        const session = this.userSessions[sender];
        const tz = session.event_timezone || 'UTC';

        try {
            const phoneNumber = session.phone_number || this.extractSenderId(sender);

            if (!phoneNumber) {
                await this.sendMessage(sender,
                    `❌ Could not identify your phone number. Please restart the booking process.`
                );
                return;
            }

            const displayNumber = this.formatPhoneForDisplay(phoneNumber);
            console.log(`📱 Creating booking for: ${displayNumber}`);
            console.log(`📱 Phone number: ${phoneNumber}`);

            // ✅ BUILD TICKETS ARRAY WITH ALL INFORMATION
            const tickets = [];
            session.selected_tiers.forEach(tier => {
                const attendeeNames = session.tier_attendees[tier.tier_id] || [];
                if (attendeeNames.length > 0) {
                    attendeeNames.forEach(name => {
                        tickets.push({
                            tier_id: tier.tier_id,
                            attendee_name: name,
                            tier_name: tier.tier_name,
                            price: tier.price
                        });
                    });
                } else {
                    // If no attendee names, create one ticket per quantity
                    for (let i = 0; i < tier.quantity; i++) {
                        tickets.push({
                            tier_id: tier.tier_id,
                            attendee_name: session.customer_name || 'Guest',
                            tier_name: tier.tier_name,
                            price: tier.price
                        });
                    }
                }
            });

            console.log(`📊 Tickets being sent: ${JSON.stringify(tickets, null, 2)}`);
            console.log(`📊 Number of tickets: ${tickets.length}`);

            const api = this.getApiClient(true);

            const bookingData = {
                event: session.event_id,
                customer_name: session.customer_name,
                customer_email: session.customer_email,
                customer_phone: phoneNumber,
                whatsapp_number: phoneNumber,
                total_amount: session.total_amount,
                tickets: tickets,
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
                        tier_name: t.tier_name
                    })),
                    tier_ids: [...new Set(tickets.map(t => t.tier_id))],
                    tier_quantities: tickets.reduce((acc, t) => {
                        const key = String(t.tier_id);
                        acc[key] = (acc[key] || 0) + 1;
                        return acc;
                    }, {}),
                    total_tickets: tickets.length
                }
            };

            console.log('📝 Creating booking with data:', JSON.stringify(bookingData, null, 2));

            const response = await api.post('/bookings/', bookingData);
            const booking = response.data;

            session.booking_reference = booking.booking_reference;
            session.step = this.FLOW.IDLE;
            session.waiting_for_confirm = false;

            let message = `✅ *Booking Confirmed!*\n\n`;
            message += `🎫 *Booking Reference:* ${booking.booking_reference}\n`;
            message += `📅 Event: ${session.event_title}\n`;
            if (session.slot_start_time) {
                // ✅ FIX: format slot time in event's timezone
                const start = this.formatEventTime(session.slot_start_time, tz);
                message += `🕐 Allocated Slot: ${start}\n`;
                if (session.slot_preferences && session.slot_preferences.length > 0) {
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

            if (this.whatsappTicketDeliveryEnabled) {
                message += `📱 You will receive your tickets via WhatsApp and Email.\n\n`;
            } else {
                message += `📧 You will receive your tickets via Email only.\n\n`;
            }

            message += `Thank you for choosing TicketVolt! 🎉`;

            await this.sendMessage(sender, message);

            delete this.userSessions[sender];

        } catch (error) {
            console.error('❌ Error creating booking:', error.message);
            if (error.response) {
                console.error('Status:', error.response.status);
                console.error('Data:', JSON.stringify(error.response.data, null, 2));
            }
            await this.sendMessage(sender,
                `❌ Sorry, there was an error creating your booking.\n` +
                `Please try again or contact support.`
            );
        }
    }

    // ============ SEND TICKETS ============
    async sendTickets(sender, bookingId) {
        try {
            if (!this.whatsappTicketDeliveryEnabled) {
                console.log(`ℹ️ WhatsApp ticket delivery is disabled. Not sending tickets via WhatsApp for booking: ${bookingId}`);
                return {
                    success: false,
                    error: 'WhatsApp ticket delivery is disabled',
                    disabled: true
                };
            }

            const api = this.getApiClient(true);
            const response = await api.get(`/bookings/${bookingId}/`);
            const booking = response.data;
            const tickets = booking.tickets || [];

            if (tickets.length === 0) {
                await this.sendMessage(sender, '❌ No tickets found for this booking.');
                return {
                    success: false,
                    error: 'No tickets found'
                };
            }

            const senderPhone = this.extractSenderId(sender);
            console.log(`📤 Admin sending ${tickets.length} tickets to ${senderPhone}`);

            try {
                const pdfResponse = await api.get(`/bookings/${bookingId}/pdf/`, {
                    responseType: 'arraybuffer'
                });

                if (pdfResponse.data) {
                    const pdfBuffer = Buffer.from(pdfResponse.data);
                    await this.sendDocument(
                        sender,
                        pdfBuffer,
                        `tickets_${booking.booking_reference}.pdf`,
                        `🎫 Your Tickets for: ${booking.event_title || 'Event'}\nBooking: ${booking.booking_reference}`
                    );
                    console.log(`✅ PDF sent for booking: ${booking.booking_reference}`);
                }
            } catch (pdfError) {
                console.log('⚠️ PDF generation not available, sending individual tickets...');
            }

            for (let i = 0; i < tickets.length; i++) {
                const ticket = tickets[i];
                const ticketCode = ticket.unique_code;
                const attendeeName = ticket.attendee_name || 'Guest';

                let message = `🎫 *Ticket ${i + 1} of ${tickets.length}*\n\n`;
                message += `┌─────────────────────────────\n`;
                message += `│ 📍 Code: ${ticketCode}\n`;
                message += `│ 👤 Attendee: ${attendeeName}\n`;
                message += `│ 📅 Event: ${booking.event_title}\n`;
                message += `└─────────────────────────────\n\n`;
                message += `📌 Scan the QR code at the entrance.`;

                await this.sendMessage(sender, message);

                if (ticket.qr_code) {
                    try {
                        let qrData = ticket.qr_code;
                        if (qrData.startsWith('data:image')) {
                            qrData = qrData.split(',')[1];
                        }
                        await this.sendImage(sender, qrData, `🎫 Ticket: ${ticketCode}\nAttendee: ${attendeeName}`);
                        console.log(`✅ QR code sent for ticket ${ticketCode}`);
                    } catch (error) {
                        console.error(`❌ Failed to send QR image for ${ticketCode}:`, error.message);
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 800));
            }

            await this.sendMessage(sender,
                `✅ *All tickets delivered!*\n\n` +
                `📱 Keep this chat for check-in updates.\n` +
                `🎉 Enjoy the event!`
            );

            return {
                success: true,
                message: 'Tickets sent successfully'
            };

        } catch (error) {
            console.error('❌ Error sending tickets:', error.message);
            await this.sendMessage(sender,
                `⚠️ Booking confirmed but tickets could not be delivered.\n` +
                `Contact support with: ${bookingId}`
            );
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ============ SEND MESSAGE ============
    async sendMessage(jid, message) {
        if (!this.isConnected) {
            this.messageQueue.push({ jid: jid, message, retryCount: 0 });
            return { status: 'queued' };
        }

        try {
            const result = await this.sock.sendMessage(jid, { text: message });
            console.log(`✅ Message sent`);
            return { status: 'sent', result };
        } catch (error) {
            console.error(`❌ Failed to send message:`, error.message);
            if (this.messageQueue.length < 100) {
                this.messageQueue.push({ jid: jid, message, retryCount: 0 });
            }
            throw error;
        }
    }

    // ============ PROCESS MESSAGE QUEUE ============
    async processMessageQueue() {
        console.log(`📤 Processing ${this.messageQueue.length} queued messages...`);

        while (this.messageQueue.length > 0) {
            const item = this.messageQueue.shift();
            try {
                await this.sendMessage(item.jid, item.message);
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`❌ Failed to send queued message:`, error.message);
                if (item.retryCount < 3) {
                    item.retryCount = (item.retryCount || 0) + 1;
                    this.messageQueue.push(item);
                }
            }
        }
    }

    // ============ GET QR CODE ============
    getQrCode() {
        return this.qrCode;
    }

    // ============ GET BOT NUMBER ============
    getBotNumber() {
        return this.botNumber;
    }

    // ============ GET CONNECTION STATUS ============
    isConnected() {
        return this.isConnected;
    }

    // ============ GET FULL STATUS ============
    getStatus() {
        return {
            connected: this.isConnected,
            queuedMessages: this.messageQueue.length,
            qrCode: this.qrCode,
            initializing: this.isInitializing,
            botNumber: this.botNumber,
            whatsappEnabled: this.whatsappEnabled,
            whatsappTicketDeliveryEnabled: this.whatsappTicketDeliveryEnabled
        };
    }
}

module.exports = new WhatsAppService();