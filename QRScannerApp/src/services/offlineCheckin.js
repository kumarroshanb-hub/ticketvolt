// QRScannerApp/src/services/offlineCheckin.js
//
// Offline check-in primitives:
//   • one active Offline Pack (signed ticket manifest) in AsyncStorage
//   • local "already checked in" state per ticket
//   • an outbox of scans waiting for sync
//   • idempotent batch sync against the backend
//
// There is deliberately no signing secret on the device. A scanned QR is
// trusted only when its {v,type,code,sig} exactly matches the manifest
// downloaded from the authenticated server.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scannerApi } from './api';
import { announceCheckin, getLanSeen, restartLanPeer, stopLanPeer } from './lanPeer';

const PACK_KEY = 'tv.offline.pack';
const OUTBOX_KEY = 'tv.offline.outbox';
const DEVICE_KEY = 'tv.device.id';
const CLOCK_SKEW_LIMIT_MS = 5 * 60 * 1000;

const safeParse = (value, fallback) => {
    if (!value) return fallback;
    try {
        const parsed = JSON.parse(value);
        return parsed ?? fallback;
    } catch {
        return fallback;
    }
};

export const getDeviceId = async () => {
    let id = await AsyncStorage.getItem(DEVICE_KEY);
    if (!id) {
        id = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        await AsyncStorage.setItem(DEVICE_KEY, id);
    }
    return id;
};

export const getActivePack = async () => {
    return safeParse(await AsyncStorage.getItem(PACK_KEY), null);
};

export const savePack = async (pack) => {
    const downloadedAt = new Date();
    const serverTime = pack?.server_time ? new Date(pack.server_time) : null;
    const clockSkewMs = serverTime ? serverTime.getTime() - downloadedAt.getTime() : 0;

    // Preserve locally-checked-in tickets across a pack refresh. Without
    // this, refreshing the manifest before syncing could make an already
    // scanned ticket look unused again.
    const previous = await getActivePack();
    const localState = new Map(
        (previous?.tickets || [])
            .filter((t) => t.local_status === 'checked_in')
            .map((t) => [t.code, t])
    );
    const tickets = (pack.tickets || []).map((ticket) => {
        const local = localState.get(ticket.code);
        if (!local) return ticket;
        return {
            ...ticket,
            local_status: local.local_status,
            local_checked_in_at: local.local_checked_in_at,
            local_client_id: local.local_client_id,
        };
    });

    const stored = {
        ...pack,
        tickets,
        ticket_count: tickets.length,
        downloaded_at: downloadedAt.toISOString(),
        clock_skew_ms: clockSkewMs,
    };
    await AsyncStorage.setItem(PACK_KEY, JSON.stringify(stored));
    // The pack carries the LAN pairing token; restart the peer listener so
    // it can accept peers as soon as the pack is downloaded.
    restartLanPeer().catch(() => {});
    return stored;
};

export const clearPack = async () => {
    await AsyncStorage.removeItem(PACK_KEY);
    await stopLanPeer();
};

export const hasSignificantClockSkew = (pack) => {
    return Boolean(pack && Math.abs(Number(pack.clock_skew_ms) || 0) > CLOCK_SKEW_LIMIT_MS);
};

export const getOutbox = async () => {
    return safeParse(await AsyncStorage.getItem(OUTBOX_KEY), []);
};

const saveOutbox = async (items) => {
    await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
};

export const pendingSyncCount = async () => {
    return (await getOutbox()).length;
};

const findManifestTicket = (pack, code) => {
    if (!pack || !Array.isArray(pack.tickets)) return null;
    return pack.tickets.find((t) => t.code === code) || null;
};

const toScanTicket = (pack, ticket) => ({
    id: ticket.ticket_id,
    unique_code: ticket.code,
    code: ticket.code,
    payload_type: ticket.type,
    attendee_name: ticket.attendee_name || 'Guest',
    attendee_email: ticket.attendee_email || '',
    status: ticket.local_status === 'checked_in' ? 'used' : ticket.status,
    is_checked_in: ticket.is_checked_in || ticket.local_status === 'checked_in',
    checked_in_at: ticket.local_checked_in_at || ticket.checked_in_at,
    event: pack?.event?.title || null,
    event_id: pack?.event?.id || null,
    tier: ticket.tier || null,
});

/**
 * Verify a scanned envelope against the locally stored manifest.
 * Returns { valid, code, message, ticket, alreadyCheckedIn }.
 */
export const validateLocalScan = async (pack, payload) => {
    if (!pack) {
        return {
            valid: false,
            code: 'NO_OFFLINE_PACK',
            message: 'No offline pack downloaded. Connect to the internet or download a pack first.',
        };
    }
    const ticket = findManifestTicket(pack, payload?.code);
    if (!ticket) {
        return {
            valid: false,
            code: 'NOT_IN_OFFLINE_PACK',
            message: 'This ticket is not in the downloaded offline pack.',
        };
    }
    if (
        payload.v !== ticket.v
        || payload.type !== ticket.type
        || payload.sig !== ticket.sig
    ) {
        return {
            valid: false,
            code: 'SIGNATURE_MISMATCH',
            message: 'QR signature does not match the signed offline manifest.',
        };
    }
    if (ticket.is_checked_in || ticket.local_status === 'checked_in') {
        return {
            valid: false,
            code: 'ALREADY_CHECKED_IN',
            message: 'This ticket is already checked in.',
            ticket: toScanTicket(pack, ticket),
            alreadyCheckedIn: true,
        };
    }
    if (['refunded', 'cancelled', 'expired'].includes(ticket.status)) {
        return {
            valid: false,
            code: `TICKET_${String(ticket.status).toUpperCase()}`,
            message: `This ticket is ${ticket.status} and cannot be used.`,
            ticket: toScanTicket(pack, ticket),
        };
    }

    // LAN peer gossip: another scanner at a different gate may have
    // checked this ticket in while both devices were offline.
    const lanSeen = await getLanSeen(payload.code);
    if (lanSeen) {
        return {
            valid: false,
            code: 'ALREADY_CHECKED_IN',
            message: `This ticket was already checked in on another scanner at ${new Date(lanSeen.scanned_at).toLocaleTimeString()}.`,
            ticket: toScanTicket(pack, ticket),
            alreadyCheckedIn: true,
            peerDevice: lanSeen.device_id,
        };
    }

    return { valid: true, ticket: toScanTicket(pack, ticket), alreadyCheckedIn: false };
};

/**
 * Mark a ticket checked-in locally and append it to the outbox.
 * The local mark happens immediately so a second scan on this device is
 * rejected even if sync never runs.
 */
export const markLocalTicketUsed = async (pack, code) => {
    const existing = await getActivePack();
    if (!existing || !pack || existing.manifest_id !== pack.manifest_id) return;
    const updated = {
        ...existing,
        tickets: (existing.tickets || []).map((ticket) => (
            ticket.code === code
                ? {
                    ...ticket,
                    local_status: 'checked_in',
                    local_checked_in_at: ticket.local_checked_in_at || new Date().toISOString(),
                    locally_synced: true,
                }
                : ticket
        )),
    };
    await AsyncStorage.setItem(PACK_KEY, JSON.stringify(updated));
    const deviceId = await getDeviceId();
    await announceCheckin({
        client_id: updated.tickets.find((t) => t.code === code)?.local_client_id
            || `${deviceId}-online-${code}`,
        code,
        device_id: deviceId,
        scanned_at: new Date().toISOString(),
    });
};

export const recordOfflineCheckin = async ({ pack, payload, ticket }) => {
    const existing = await getActivePack();
    if (!existing || existing.manifest_id !== pack?.manifest_id) {
        throw new Error('Offline pack changed. Download it again before scanning.');
    }

    const deviceId = await getDeviceId();
    const scannedAt = new Date().toISOString();
    const clientId = `${deviceId}-${payload.code}-${Date.now().toString(36)}`;

    const updated = {
        ...existing,
        tickets: (existing.tickets || []).map((t) => (
            t.code === payload.code
                ? {
                    ...t,
                    local_status: 'checked_in',
                    local_checked_in_at: scannedAt,
                    local_client_id: clientId,
                }
                : t
        )),
    };
    await AsyncStorage.setItem(PACK_KEY, JSON.stringify(updated));

    const outbox = await getOutbox();
    outbox.push({
        client_id: clientId,
        payload: {
            v: payload.v,
            type: payload.type,
            code: payload.code,
            sig: payload.sig,
        },
        scanned_at: scannedAt,
        device_id: deviceId,
        event_id: pack?.event?.id || null,
        attendee_name: ticket?.attendee_name || '',
    });
    await saveOutbox(outbox);

    await announceCheckin({
        client_id: clientId,
        code: payload.code,
        ticket_id: ticket?.id || null,
        device_id: deviceId,
        scanned_at: scannedAt,
        attendee_name: ticket?.attendee_name || '',
    });

    return { clientId, scannedAt, pending: outbox.length };
};

const removeSyncedFromOutbox = async (resolvedIds) => {
    const ids = new Set(resolvedIds);
    const outbox = await getOutbox();
    const remaining = outbox.filter((item) => !ids.has(item.client_id));
    await saveOutbox(remaining);
    return remaining.length;
};

/**
 * Push the outbox. Returns { synced, duplicates, failed, pending }.
 * `success`, `idempotent`, and `duplicate` remove the item from the outbox:
 * the server has accepted or authoritatively rejected it.
 */
export const syncOutbox = async ({ onProgress } = {}) => {
    const outbox = await getOutbox();
    if (outbox.length === 0) {
        return { synced: 0, duplicates: 0, failed: 0, pending: 0 };
    }

    const deviceId = await getDeviceId();
    const batch = outbox.slice(0, 100);
    const response = await scannerApi.offlineSync({
        device_id: deviceId,
        items: batch.map((item) => ({
            client_id: item.client_id,
            payload: item.payload,
            scanned_at: item.scanned_at,
        })),
    });

    const results = response?.data?.results || [];
    const resolved = [];
    let synced = 0;
    let duplicates = 0;
    let failed = 0;

    results.forEach((result) => {
        if (result.status === 'success') {
            synced += 1;
            resolved.push(result.client_id);
        } else if (result.status === 'idempotent' || result.status === 'duplicate') {
            duplicates += 1;
            resolved.push(result.client_id);
        } else {
            failed += 1;
        }
    });

    if (onProgress) onProgress({ synced, duplicates, failed });
    const pending = await removeSyncedFromOutbox(resolved);
    return { synced, duplicates, failed, pending };
};
