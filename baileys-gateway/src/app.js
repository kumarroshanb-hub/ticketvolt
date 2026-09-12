const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const whatsappService = require('./services/whatsappService');

dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
    const status = whatsappService.getStatus();
    res.json({
        status: status.connected ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
        service: 'Baileys Gateway',
        whatsapp: status
    });
});

// Status endpoint
app.get('/api/status', (req, res) => {
    const status = whatsappService.getStatus();
    res.json({
        connected: status.connected,
        status: status.connected ? 'connected' : 'disconnected',
        message: status.connected ? 'WhatsApp is connected and ready' : 'Waiting for QR scan',
        qrCode: status.qrCode,
        queuedMessages: status.queuedMessages,
        initializing: status.initializing,
        uptime: process.uptime(),
        whatsappEnabled: status.whatsappEnabled,
        whatsappTicketDeliveryEnabled: status.whatsappTicketDeliveryEnabled
    });
});

// ============ QR CODE ENDPOINT ============
app.get('/api/qr', (req, res) => {
    const qrCode = whatsappService.getQrCode();
    const isConnected = whatsappService.isConnected;
    const status = whatsappService.getStatus();
    
    if (isConnected) {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>WhatsApp Connected</title>
                <style>
                    body {
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    }
                    .container {
                        text-align: center;
                        background: white;
                        padding: 50px;
                        border-radius: 20px;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                        max-width: 500px;
                    }
                    .success-icon { font-size: 80px; margin-bottom: 20px; }
                    h1 { color: #22c55e; margin: 0; font-size: 28px; }
                    p { color: #666; font-size: 16px; margin: 10px 0; }
                    .bot-number {
                        background: #f0f0f0;
                        padding: 10px;
                        border-radius: 8px;
                        font-family: monospace;
                        font-size: 18px;
                        margin-top: 15px;
                    }
                    .status-badge {
                        display: inline-block;
                        background: #22c55e;
                        color: white;
                        padding: 4px 16px;
                        border-radius: 20px;
                        font-size: 14px;
                        font-weight: bold;
                        margin-top: 10px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="success-icon">✅</div>
                    <h1>WhatsApp Connected!</h1>
                    <p>Your WhatsApp bot is online and ready to use.</p>
                    <div class="status-badge">🟢 ONLINE</div>
                    <div class="bot-number">📱 Bot: ${whatsappService.getBotNumber() || 'Unknown'}</div>
                    <p style="font-size: 14px; color: #999; margin-top: 20px;">
                        Close this page and check the logs for messages.
                    </p>
                </div>
            </body>
            </html>
        `);
        return;
    }
    
    if (!qrCode) {
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Waiting for QR Code</title>
                <style>
                    body {
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    }
                    .container {
                        text-align: center;
                        background: white;
                        padding: 50px;
                        border-radius: 20px;
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                        max-width: 500px;
                    }
                    .loading { font-size: 60px; margin-bottom: 20px; }
                    h1 { color: #333; margin: 0; font-size: 24px; }
                    .spinner {
                        border: 4px solid #f3f3f3;
                        border-top: 4px solid #667eea;
                        border-radius: 50%;
                        width: 40px;
                        height: 40px;
                        animation: spin 1s linear infinite;
                        margin: 20px auto;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    .retry-btn {
                        background: #667eea;
                        color: white;
                        border: none;
                        padding: 12px 30px;
                        border-radius: 8px;
                        font-size: 16px;
                        cursor: pointer;
                        margin-top: 15px;
                        transition: background 0.3s;
                    }
                    .retry-btn:hover { background: #5a67d8; }
                    .status-badge {
                        display: inline-block;
                        background: #f59e0b;
                        color: white;
                        padding: 4px 16px;
                        border-radius: 20px;
                        font-size: 14px;
                        font-weight: bold;
                        margin-top: 10px;
                    }
                </style>
                <script>
                    function refreshQR() { location.reload(); }
                    setTimeout(refreshQR, 5000);
                </script>
            </head>
            <body>
                <div class="container">
                    <div class="loading">⏳</div>
                    <h1>Generating QR Code...</h1>
                    <div class="status-badge">⏳ WAITING</div>
                    <div class="spinner"></div>
                    <p style="color: #666;">Please wait while the QR code is generated.</p>
                    <button class="retry-btn" onclick="refreshQR()">🔄 Refresh</button>
                </div>
            </body>
            </html>
        `);
        return;
    }
    
    // Display QR Code
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Scan QR Code</title>
            <style>
                body {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                }
                .container {
                    text-align: center;
                    background: white;
                    padding: 40px;
                    border-radius: 20px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                    max-width: 500px;
                }
                .qr-container {
                    background: white;
                    padding: 20px;
                    border-radius: 12px;
                    margin: 20px 0;
                    border: 2px solid #e5e7eb;
                }
                .qr-container img { max-width: 100%; height: auto; }
                h1 { color: #333; margin: 0 0 10px 0; font-size: 28px; }
                .subtitle { color: #666; font-size: 16px; margin-bottom: 20px; }
                .steps {
                    text-align: left;
                    background: #f8fafc;
                    padding: 15px 20px;
                    border-radius: 8px;
                    margin: 15px 0;
                }
                .steps li { margin: 8px 0; color: #333; font-size: 14px; }
                .status-badge {
                    display: inline-block;
                    background: #f59e0b;
                    color: white;
                    padding: 4px 16px;
                    border-radius: 20px;
                    font-size: 14px;
                    font-weight: bold;
                }
                .refresh-btn {
                    background: #667eea;
                    color: white;
                    border: none;
                    padding: 10px 25px;
                    border-radius: 8px;
                    font-size: 14px;
                    cursor: pointer;
                    margin-top: 10px;
                    transition: background 0.3s;
                }
                .refresh-btn:hover { background: #5a67d8; }
                .expiry { color: #999; font-size: 12px; margin-top: 10px; }
            </style>
            <script>
                function refreshQR() { location.reload(); }
                setTimeout(refreshQR, 30000);
            </script>
        </head>
        <body>
            <div class="container">
                <h1>📱 Scan QR Code</h1>
                <p class="subtitle">Link this device to WhatsApp</p>
                <div class="status-badge">⏳ WAITING FOR SCAN</div>
                
                <div class="qr-container">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qrCode)}" alt="QR Code">
                </div>
                
                <div class="steps">
                    <strong>📌 How to scan:</strong>
                    <ol>
                        <li>Open WhatsApp on your phone</li>
                        <li>Tap <strong>⋮</strong> (Android) or <strong>Settings</strong> (iOS)</li>
                        <li>Select <strong>Linked Devices</strong></li>
                        <li>Tap <strong>Link a Device</strong></li>
                        <li>Scan this QR code with your phone</li>
                    </ol>
                </div>
                
                <button class="refresh-btn" onclick="refreshQR()">🔄 Refresh QR Code</button>
                
                <p class="expiry">⚠️ QR code expires when connected</p>
                <p style="font-size: 11px; color: #999;">Bot: ${whatsappService.getBotNumber() || 'Unknown'}</p>
            </div>
        </body>
        </html>
    `);
});

// Send text message
app.post('/api/send_message', async (req, res) => {
    const { phone_number, message } = req.body;
    
    if (!phone_number || !message) {
        return res.status(400).json({ 
            success: false, 
            error: 'Phone number and message are required' 
        });
    }

    try {
        const result = await whatsappService.sendMessage(phone_number, message);
        res.json({
            success: true,
            message: 'Message sent successfully',
            phone_number: phone_number,
            ...result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            phone_number: phone_number
        });
    }
});

// Send QR code as image
app.post('/api/send_qr', async (req, res) => {
    const { phone_number, qr_code, caption } = req.body;
    
    if (!phone_number || !qr_code) {
        return res.status(400).json({
            success: false,
            error: 'Phone number and QR code are required'
        });
    }

    try {
        console.log(`📤 Sending QR code to ${phone_number}`);
        console.log(`📤 QR code length: ${qr_code.length}`);
        console.log(`📤 Caption: ${caption || 'No caption'}`);
        
        const buffer = Buffer.from(qr_code, 'base64');
        console.log(`📤 Buffer size: ${buffer.length} bytes`);
        
        const result = await whatsappService.sendImage(phone_number, buffer, caption || '🎫 Your ticket QR code');
        
        res.json({
            success: true,
            message: 'QR code sent successfully',
            phone_number: phone_number,
            ...result
        });
    } catch (error) {
        console.error('❌ Failed to send QR:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            phone_number: phone_number
        });
    }
});

// Send ticket with QR
app.post('/api/send_ticket', async (req, res) => {
    const { phone_number, ticket_data, event_title, venue, date } = req.body;
    
    if (!phone_number || !ticket_data) {
        return res.status(400).json({
            success: false,
            error: 'Phone number and ticket data are required'
        });
    }

    try {
        console.log(`📤 Sending ticket to ${phone_number}`);
        
        let message = `🎫 *Ticket Confirmation*\n\n`;
        message += `Event: ${event_title || 'Event'}\n`;
        message += `Venue: ${venue || 'TBD'}\n`;
        message += `Date: ${date || 'TBD'}\n\n`;
        
        for (let i = 0; i < ticket_data.length; i++) {
            const ticket = ticket_data[i];
            message += `Ticket ${i + 1}:\n`;
            message += `  Code: ${ticket.code || 'N/A'}\n`;
            message += `  Attendee: ${ticket.attendee_name || 'Guest'}\n\n`;
        }
        
        message += `📌 Scan the QR code below at the entrance.`;
        
        await whatsappService.sendMessage(phone_number, message);
        
        for (const ticket of ticket_data) {
            if (ticket.qr_code) {
                const buffer = Buffer.from(ticket.qr_code, 'base64');
                await whatsappService.sendImage(
                    phone_number,
                    buffer,
                    `🎫 Ticket: ${ticket.code}\nAttendee: ${ticket.attendee_name || 'Guest'}`
                );
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        res.json({
            success: true,
            message: 'Ticket sent successfully',
            phone_number: phone_number,
            tickets_sent: ticket_data.length
        });
    } catch (error) {
        console.error('❌ Failed to send ticket:', error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            phone_number: phone_number
        });
    }
});

// Send image
app.post('/api/send_image', async (req, res) => {
    const { phone_number, image, caption } = req.body;
    
    if (!phone_number || !image) {
        return res.status(400).json({
            success: false,
            error: 'Phone number and image are required'
        });
    }

    try {
        const buffer = Buffer.from(image, 'base64');
        const result = await whatsappService.sendImage(phone_number, buffer, caption || '');
        res.json({
            success: true,
            message: 'Image sent successfully',
            phone_number: phone_number,
            ...result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            phone_number: phone_number
        });
    }
});

// Webhook
app.post('/api/webhook', (req, res) => {
    console.log('[Webhook] Received:', req.body);
    res.json({
        status: 'received',
        timestamp: new Date().toISOString()
    });
});

// Send Document (PDF)
app.post('/api/send_document', async (req, res) => {
    const { phone_number, file, filename, caption } = req.body;
    
    if (!phone_number || !file) {
        return res.status(400).json({
            success: false,
            error: 'Phone number and file are required'
        });
    }

    try {
        const jid = phone_number.includes('@s.whatsapp.net') 
            ? phone_number 
            : `${phone_number}@s.whatsapp.net`;
        
        const result = await whatsappService.sendDocument(
            jid, 
            file, 
            filename || 'ticket.pdf', 
            caption || ''
        );
        
        res.json({
            success: true,
            message: 'Document sent successfully',
            phone_number: phone_number,
            ...result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            phone_number: phone_number
        });
    }
});

// Send File (Generic)
app.post('/api/send_file', async (req, res) => {
    const { phone_number, file, filename, caption } = req.body;
    
    if (!phone_number || !file) {
        return res.status(400).json({
            success: false,
            error: 'Phone number and file are required'
        });
    }

    try {
        const jid = phone_number.includes('@s.whatsapp.net') 
            ? phone_number 
            : `${phone_number}@s.whatsapp.net`;
        
        const result = await whatsappService.sendFile(
            jid, 
            file, 
            filename || 'file.pdf', 
            caption || ''
        );
        
        res.json({
            success: true,
            message: 'File sent successfully',
            phone_number: phone_number,
            ...result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            phone_number: phone_number
        });
    }
});

// Initialize WhatsApp
whatsappService.initialize();

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
    console.log(`\n🚀 Baileys Gateway running on port ${PORT}`);
    console.log(`📍 Health: http://localhost:${PORT}/health`);
    console.log(`📍 Status: http://localhost:${PORT}/api/status`);
    console.log(`📍 QR Code: http://localhost:${PORT}/api/qr`);
    console.log(`📍 Send QR: POST http://localhost:${PORT}/api/send_qr`);
    console.log(`📍 Send Ticket: POST http://localhost:${PORT}/api/send_ticket\n`);
});

module.exports = app;