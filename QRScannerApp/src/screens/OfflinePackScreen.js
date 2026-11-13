// QRScannerApp/src/screens/OfflinePackScreen.js
//
// Download the signed ticket manifest before an event, and sync the
// local outbox when connectivity returns.
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import { scannerApi } from '../services/api';
import {
    clearPack,
    getActivePack,
    getOutbox,
    hasSignificantClockSkew,
    pendingSyncCount,
    savePack,
    syncOutbox,
} from '../services/offlineCheckin';
import { discoverLanPeers, getLanStatus } from '../services/lanPeer';
import { theme } from '../theme';

const C = theme.colors;
const F = theme.fonts;

const formatTime = (value) => {
    if (!value) return '—';
    try {
        return new Date(value).toLocaleString();
    } catch {
        return value;
    }
};

export default function OfflinePackScreen({ navigation }) {
    const [pack, setPack] = useState(null);
    const [events, setEvents] = useState([]);
    const [pending, setPending] = useState(0);
    const [loading, setLoading] = useState(true);
    const [downloadingId, setDownloadingId] = useState(null);
    const [syncing, setSyncing] = useState(false);
    const [status, setStatus] = useState('');
    const [isOnline, setIsOnline] = useState(true);
    const [lan, setLan] = useState({ peers: 0, localIp: null, listening: false, port: 45999 });

    const refresh = useCallback(async () => {
        const [active, outbox, net] = await Promise.all([
            getActivePack(),
            getOutbox(),
            NetInfo.fetch(),
        ]);
        setPack(active);
        setPending(outbox.length);
        setIsOnline(Boolean(net?.isConnected));
        const lanStatus = await getLanStatus();
        setLan(lanStatus);
    }, []);

    const loadEvents = useCallback(async () => {
        try {
            const response = await scannerApi.getEvents();
            const data = response?.data;
            const list = Array.isArray(data) ? data : (data?.results || []);
            setEvents(list.filter((event) => event.status === 'published' || event.status === 'active'));
        } catch {
            setEvents([]);
        }
    }, []);

    useEffect(() => {
        (async () => {
            setLoading(true);
            await Promise.all([refresh(), loadEvents()]);
            setLoading(false);
        })();

        const timer = setInterval(async () => {
            setLan(await getLanStatus());
        }, 3000);
        return () => clearInterval(timer);
    }, [refresh, loadEvents]);

    const handleDownload = async (event) => {
        if (!isOnline) {
            Alert.alert('Offline', 'Connect to the internet to download an offline pack.');
            return;
        }
        setDownloadingId(event.id);
        setStatus('Downloading signed manifest…');
        try {
            const response = await scannerApi.getOfflinePack(event.id);
            const saved = await savePack(response.data);
            setPack(saved);
            setStatus(`Downloaded ${saved.ticket_count} tickets for ${saved.event?.title || 'event'}.`);
        } catch (error) {
            const message = error.response?.data?.detail || error.message || 'Download failed.';
            setStatus('');
            Alert.alert('Download failed', message);
        } finally {
            setDownloadingId(null);
        }
    };

    const handleSync = async () => {
        if (!isOnline) {
            Alert.alert('Offline', 'Connect to the internet to sync pending check-ins.');
            return;
        }
        setSyncing(true);
        setStatus('Syncing outbox…');
        try {
            const result = await syncOutbox();
            setPending(result.pending);
            setStatus(
                `Synced ${result.synced}, duplicates ${result.duplicates}, still pending ${result.pending}.`
            );
        } catch (error) {
            const message = error.response?.data?.detail || error.message || 'Sync failed.';
            setStatus('');
            Alert.alert('Sync failed', message);
        } finally {
            setSyncing(false);
        }
    };

    const handleClear = () => {
        Alert.alert(
            'Remove offline pack?',
            'Pending scans in the outbox are kept and can still be synced.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        await clearPack();
                        setPack(null);
                        setStatus('Offline pack removed.');
                    },
                },
            ]
        );
    };

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator color={C.secondary} size="large" />
            </View>
        );
    }

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            <View style={styles.statusRow}>
                <View style={[styles.dot, { backgroundColor: isOnline ? C.success : C.warning }]} />
                <View style={{ flex: 1 }}>
                    <Text style={styles.statusText}>
                        {isOnline ? 'Online — packs and sync available' : 'Offline — using local pack'}
                    </Text>
                    <Text style={styles.lanText}>
                        LAN peers: {lan.peers} · {lan.localIp || 'no Wi-Fi IP'} : {lan.port}
                        {lan.listening ? ' · listening' : ' · not listening'}
                        {lan.secured ? ' · paired' : ' · no LAN token'}
                    </Text>
                    <TouchableOpacity
                        style={styles.findPeersButton}
                        onPress={async () => {
                            setStatus('Scanning Wi-Fi for other scanners…');
                            const next = await discoverLanPeers();
                            setLan(next);
                            setStatus(`LAN scan complete — ${next.peers} peer(s) found.`);
                        }}
                    >
                        <Text style={styles.findPeersText}>SCAN FOR PEERS</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {pack ? (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Active Offline Pack</Text>
                    <Text style={styles.line}><Text style={styles.label}>Event: </Text>{pack.event?.title || '—'}</Text>
                    <Text style={styles.line}><Text style={styles.label}>Tickets: </Text>{pack.ticket_count ?? pack.tickets?.length ?? 0}</Text>
                    <Text style={styles.line}><Text style={styles.label}>Downloaded: </Text>{formatTime(pack.downloaded_at)}</Text>
                    <Text style={styles.line}><Text style={styles.label}>Manifest: </Text>{String(pack.manifest_id || '').slice(0, 12)}…</Text>
                    {hasSignificantClockSkew(pack) && (
                        <View style={styles.warning}>
                            <Text style={styles.warningText}>
                                ⚠️ Device clock differs from the server by more than 5 minutes.
                                Scan timestamps may be inaccurate.
                            </Text>
                        </View>
                    )}
                    <View style={styles.actions}>
                        <TouchableOpacity
                            style={[styles.button, styles.secondaryButton]}
                            onPress={handleSync}
                            disabled={syncing || pending === 0}
                        >
                            <Text style={styles.buttonText}>
                                {syncing ? 'SYNCING…' : `SYNC NOW (${pending})`}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.button, styles.ghostButton]} onPress={handleClear}>
                            <Text style={styles.ghostButtonText}>REMOVE PACK</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ) : (
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>No Offline Pack</Text>
                    <Text style={styles.helpText}>
                        Download a pack before the event. It contains the signed ticket
                        manifest, so scanning works without network access.
                    </Text>
                </View>
            )}

            <Text style={styles.sectionTitle}>Download for an event</Text>
            {events.length === 0 ? (
                <Text style={styles.helpText}>No active events available.</Text>
            ) : (
                events.map((event) => (
                    <View key={event.id} style={styles.eventRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.eventTitle}>{event.title}</Text>
                            <Text style={styles.eventMeta}>
                                {event.start_date ? new Date(event.start_date).toLocaleString() : 'Date TBD'}
                            </Text>
                        </View>
                        <TouchableOpacity
                            style={styles.downloadButton}
                            onPress={() => handleDownload(event)}
                            disabled={Boolean(downloadingId)}
                        >
                            {downloadingId === event.id ? (
                                <ActivityIndicator color={C.textInverse} size="small" />
                            ) : (
                                <Text style={styles.downloadText}>
                                    {pack?.event?.id === event.id ? 'REFRESH' : 'DOWNLOAD'}
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                ))
            )}

            {status ? <Text style={styles.statusMessage}>{status}</Text> : null}

            <TouchableOpacity
                style={[styles.button, styles.ghostButton, { marginTop: 24 }]}
                onPress={() => navigation.goBack()}
            >
                <Text style={styles.ghostButtonText}>BACK TO SCANNER</Text>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bgPrimary },
    content: { padding: 20, paddingBottom: 40 },
    center: { justifyContent: 'center', alignItems: 'center' },
    statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    statusText: { color: C.textMuted, fontFamily: F.family, fontSize: 13 },
    lanText: { color: C.textLight, fontFamily: F.familyMono, fontSize: 10, marginTop: 3 },
    findPeersButton: { alignSelf: 'flex-start', marginTop: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: C.bgDarkBorder },
    findPeersText: { color: C.textMuted, fontFamily: F.familySemiBold, fontSize: 9, letterSpacing: 0.5 },
    card: {
        backgroundColor: C.bgDarkCard,
        borderRadius: theme.radius.md,
        padding: 16,
        borderWidth: 1,
        borderColor: C.bgDarkBorder,
        marginBottom: 20,
    },
    cardTitle: { color: C.textInverse, fontFamily: F.familyBold, fontSize: 18, marginBottom: 10 },
    line: { color: C.textMuted, fontFamily: F.family, fontSize: 13, marginBottom: 4 },
    label: { color: C.textLight, fontFamily: F.familySemiBold },
    helpText: { color: C.textMuted, fontFamily: F.family, fontSize: 13, lineHeight: 19 },
    warning: {
        marginTop: 10,
        padding: 10,
        borderRadius: theme.radius.sm,
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(245, 158, 11, 0.4)',
    },
    warningText: { color: C.warning, fontFamily: F.family, fontSize: 12, lineHeight: 18 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
    button: { flex: 1, paddingVertical: 12, borderRadius: theme.radius.sm, alignItems: 'center' },
    secondaryButton: { backgroundColor: C.secondary },
    ghostButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.bgDarkBorder },
    buttonText: { color: C.textInverse, fontFamily: F.familySemiBold, fontSize: 12, letterSpacing: 0.5 },
    ghostButtonText: { color: C.textMuted, fontFamily: F.familySemiBold, fontSize: 12, letterSpacing: 0.5 },
    sectionTitle: { color: C.textInverse, fontFamily: F.familyBold, fontSize: 16, marginBottom: 10 },
    eventRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: C.bgDarkCard,
        borderRadius: theme.radius.md,
        padding: 14,
        borderWidth: 1,
        borderColor: C.bgDarkBorder,
        marginBottom: 10,
    },
    eventTitle: { color: C.textInverse, fontFamily: F.familySemiBold, fontSize: 14 },
    eventMeta: { color: C.textLight, fontFamily: F.family, fontSize: 11, marginTop: 3 },
    downloadButton: {
        backgroundColor: C.secondary,
        paddingHorizontal: 12,
        paddingVertical: 9,
        borderRadius: theme.radius.sm,
        minWidth: 88,
        alignItems: 'center',
    },
    downloadText: { color: C.textInverse, fontFamily: F.familyBold, fontSize: 10, letterSpacing: 0.6 },
    statusMessage: { color: C.textMuted, fontFamily: F.family, fontSize: 12, marginTop: 12, textAlign: 'center' },
});
