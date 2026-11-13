// QRScannerApp/src/services/lanPeer.js
//
// Best-effort peer-to-peer check-in sharing over the local Wi-Fi.
//
// Each scanner runs a tiny TCP server on LAN_PEER_PORT and discovers other
// scanners by scanning its /24 subnet. Every check-in is gossiped to
// connected peers, so a ticket checked in at Gate A is immediately marked
// used in Gate B's local state even when the internet is down.
//
// This is intentionally a LAN-only, best-effort layer. The server remains
// the final authority; the LAN layer narrows the window in which two
// offline scanners can accept the same ticket.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
// Native TCP server support. In Expo Go this module is unavailable;
// loading it defensively keeps the rest of the scanner usable and
// surfaces a clear message instead of crashing at startup.
let TcpSocket = null;
try {
    // eslint-disable-next-line global-require
    const tcpModule = require('react-native-tcp-socket');
    TcpSocket = tcpModule?.default || tcpModule;
} catch (error) {
    console.warn(
        'LAN peer sharing unavailable (native TCP module missing). '
        + 'Use an Expo development/production build, not Expo Go.'
    );
}

const LAN_PEER_PORT = 45999;
const SEEN_KEY = 'tv.lan.seen';
const DEVICE_KEY = 'tv.device.id';
const DISCOVERY_INTERVAL_MS = 20000;
const CONNECT_TIMEOUT_MS = 450;
const HELLO_TIMEOUT_MS = 4000;

let server = null;
let started = false;
let starting = false;
let localIp = null;
let localToken = null;
let discoveryTimer = null;
let onPeerCheckinCallback = null;

const getDeviceId = async () => {
    let id = await AsyncStorage.getItem(DEVICE_KEY);
    if (!id) {
        id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        await AsyncStorage.setItem(DEVICE_KEY, id);
    }
    return id;
};

const peers = new Map();          // device_id -> { socket, ip, lastSeen }
const seen = new Map();           // ticket code -> check-in record
const outgoing = new Set();       // sockets waiting for hello

const safeParse = (value, fallback) => {
    if (!value) return fallback;
    try {
        return JSON.parse(value) || fallback;
    } catch {
        return fallback;
    }
};

const persistSeen = async () => {
    // Keep this bounded; a single event rarely has >5k tickets.
    const entries = Array.from(seen.values()).slice(-5000);
    await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(entries));
};

const readPackToken = async () => {
    const pack = safeParse(await AsyncStorage.getItem('tv.offline.pack'), null);
    return pack?.lan_token || null;
};

const loadSeen = async () => {
    const entries = safeParse(await AsyncStorage.getItem(SEEN_KEY), []);
    entries.forEach((entry) => {
        if (entry?.code) seen.set(entry.code, entry);
    });
};

const send = (socket, message) => {
    try {
        socket.write(`${JSON.stringify(message)}\n`);
    } catch {
        // Peer went away; discovery will reconnect.
    }
};

const rememberCheckin = async (checkin) => {
    if (!checkin?.code || !checkin?.client_id) return false;
    const existing = seen.get(checkin.code);
    if (existing) {
        // First scan wins. Keep the earliest observed scan timestamp.
        const existingTime = Date.parse(existing.scanned_at) || Number.MAX_SAFE_INTEGER;
        const incomingTime = Date.parse(checkin.scanned_at) || Number.MAX_SAFE_INTEGER;
        if (existingTime <= incomingTime) return false;
    }
    seen.set(checkin.code, checkin);
    await persistSeen();
    return true;
};

const handleMessage = async (socket, message) => {
    if (!message || typeof message !== 'object') return;

    if (message.type === 'hello') {
        const deviceId = String(message.device_id || '').slice(0, 80);
        if (!deviceId) {
            socket.destroy();
            return;
        }
        if (localToken && message.lan_token !== localToken) {
            console.warn('LAN peer rejected: invalid pack token');
            socket.destroy();
            return;
        }
        outgoing.delete(socket);
        peers.set(deviceId, {
            socket,
            ip: message.ip || null,
            lastSeen: Date.now(),
        });
        const ownId = await getDeviceId();
        send(socket, { type: 'hello', device_id: ownId, ip: localIp, lan_token: localToken });
        send(socket, {
            type: 'sync',
            device_id: ownId,
            ip: localIp,
            checkins: Array.from(seen.values()),
        });
        return;
    }

    if (message.type === 'sync') {
        const syncDeviceId = String(message.device_id || '').slice(0, 80);
        if (syncDeviceId && !peers.has(syncDeviceId)) {
            peers.set(syncDeviceId, {
                socket,
                ip: message.ip || null,
                lastSeen: Date.now(),
            });
        }
        const incoming = Array.isArray(message.checkins) ? message.checkins : [];
        let changed = false;
        for (const checkin of incoming) {
            changed = (await rememberCheckin(checkin)) || changed;
        }
        if (changed && onPeerCheckinCallback) {
            onPeerCheckinCallback({ source: 'sync' });
        }
        return;
    }

    if (message.type === 'checkin' && message.checkin) {
        const changed = await rememberCheckin(message.checkin);
        if (changed && onPeerCheckinCallback) {
            onPeerCheckinCallback({ source: 'peer', checkin: message.checkin });
        }
        return;
    }

    if (message.type === 'ping') {
        send(socket, { type: 'pong' });
    }
};

const attachSocket = (socket, { outgoing: isOutgoing = false } = {}) => {
    let buffer = '';

    socket.setTimeout?.(0);
    socket.on('data', (chunk) => {
        buffer += chunk.toString();
        let newline = buffer.indexOf('\n');
        while (newline >= 0) {
            const line = buffer.slice(0, newline);
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf('\n');
            if (!line.trim()) continue;
            try {
                handleMessage(socket, JSON.parse(line)).catch(() => {});
            } catch {
                // Ignore malformed peer frames.
            }
        }
    });
    socket.on('error', () => {
        outgoing.delete(socket);
    });
    socket.on('close', () => {
        outgoing.delete(socket);
        for (const [id, peer] of peers.entries()) {
            if (peer.socket === socket) peers.delete(id);
        }
    });

    if (isOutgoing) {
        outgoing.add(socket);
        setTimeout(() => {
            if (outgoing.has(socket)) {
                outgoing.delete(socket);
                socket.destroy();
            }
        }, HELLO_TIMEOUT_MS);
    }
};

const startServer = async () => {
    const deviceId = await getDeviceId();
    server = TcpSocket.createServer((socket) => {
        // Wait for the peer's hello, then identify ourselves. Sending
        // immediately can race the peer's data listener on some devices.
        attachSocket(socket);
    });

    server.on('error', (error) => {
        console.warn('LAN peer server error:', error?.message || error);
    });

    server.listen({ port: LAN_PEER_PORT, host: '0.0.0.0' }, () => {
        console.log(`📡 LAN peer server listening on ${LAN_PEER_PORT}`);
    });
};

const connectTo = (ip) => new Promise((resolve) => {
    let settled = false;
    let socket;
    const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
    };

    try {
        socket = TcpSocket.createConnection(
            { port: LAN_PEER_PORT, host: ip },
            async () => {
                if (settled) {
                    socket.destroy();
                    return;
                }
                attachSocket(socket, { outgoing: true });
                const deviceId = await getDeviceId();
                send(socket, { type: 'hello', device_id: deviceId, ip: localIp, lan_token: localToken });
                // Keep the socket if the peer completes a hello quickly;
                // otherwise the HELLO_TIMEOUT above destroys it.
                setTimeout(() => {
                    if (!socket.destroyed) finish(socket);
                }, 250);
            }
        );
        socket.setTimeout?.(CONNECT_TIMEOUT_MS);
        socket.on('timeout', () => {
            socket.destroy();
            finish(null);
        });
        socket.on('error', () => finish(null));
        setTimeout(() => {
            if (!settled) {
                socket.destroy();
                finish(null);
            }
        }, CONNECT_TIMEOUT_MS);
    } catch {
        finish(null);
    }
});

const discoverPeers = async () => {
    try {
        localIp = await Network.getIpAddressAsync();
        if (!localIp || !localIp.includes('.')) return;

        const parts = localIp.split('.');
        if (parts.length !== 4) return;
        const prefix = parts.slice(0, 3).join('.');
        const own = Number(parts[3]);

        const knownIps = new Set(
            Array.from(peers.values()).map((peer) => peer.ip).filter(Boolean)
        );
        const candidates = [];
        for (let i = 1; i <= 254; i += 1) {
            const ip = `${prefix}.${i}`;
            if (i !== own && !knownIps.has(ip)) candidates.push(ip);
        }

        // Batches of 20 keep the probe burst reasonable on home Wi-Fi.
        for (let i = 0; i < candidates.length; i += 20) {
            await Promise.all(candidates.slice(i, i + 20).map(connectTo));
        }
    } catch (error) {
        console.warn('LAN discovery failed:', error?.message || error);
    }
};

export const startLanPeer = async ({ onPeerCheckin } = {}) => {
    if (!TcpSocket) {
        console.warn('LAN peer sharing skipped: native TCP module not available.');
        return;
    }
    if (started || starting) return;
    starting = true;
    onPeerCheckinCallback = onPeerCheckin || null;

    try {
        await loadSeen();
        localToken = await readPackToken();
        if (!localToken) {
            console.warn('LAN peer sharing needs an offline pack; download one first.');
            return;
        }
        localIp = await Network.getIpAddressAsync();
        await startServer();
        started = true;
        await discoverPeers();
        discoveryTimer = setInterval(discoverPeers, DISCOVERY_INTERVAL_MS);
        console.log('📡 LAN peer sharing started');
    } catch (error) {
        console.warn('Could not start LAN peer sharing:', error?.message || error);
    } finally {
        starting = false;
    }
};

export const stopLanPeer = async () => {
    if (discoveryTimer) clearInterval(discoveryTimer);
    discoveryTimer = null;
    for (const peer of peers.values()) {
        try { peer.socket.destroy(); } catch { /* noop */ }
    }
    peers.clear();
    if (server) {
        try { server.close(); } catch { /* noop */ }
    }
    server = null;
    localToken = null;
    started = false;
};

export const announceCheckin = async (checkin) => {
    if (!checkin?.code || !checkin?.client_id) return;
    await rememberCheckin(checkin);
    for (const peer of peers.values()) {
        send(peer.socket, { type: 'checkin', checkin });
    }
};

export const getLanSeen = async (code) => {
    if (!code) return null;
    if (!seen.size) await loadSeen();
    return seen.get(code) || null;
};

export const discoverLanPeers = async () => {
    await discoverPeers();
    return getLanStatus();
};

export const restartLanPeer = async () => {
    await stopLanPeer();
    await startLanPeer();
};

export const getLanStatus = async () => {
    if (!localIp) {
        try { localIp = await Network.getIpAddressAsync(); } catch { /* noop */ }
    }
    return {
        listening: Boolean(server),
        localIp: localIp || null,
        port: LAN_PEER_PORT,
        peers: peers.size,
        seen: seen.size,
        secured: Boolean(localToken),
    };
};
