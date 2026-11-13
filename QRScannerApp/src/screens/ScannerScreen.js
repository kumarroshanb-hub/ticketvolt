// QRScannerApp/src/screens/ScannerScreen.js
// QR payload parsing + check-in logic UNCHANGED.
// Only the visual chrome is re-tokenized to brand.
import React, { useState, useEffect, useContext, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Alert,
    ActivityIndicator,
    Dimensions,
    Modal,
    TextInput,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import NetInfo from '@react-native-community/netinfo';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthContext } from '../context/AuthContext';
import { scannerApi } from '../services/api';
import {
    getActivePack,
    getDeviceId,
    markLocalTicketUsed,
    pendingSyncCount,
    recordOfflineCheckin,
    syncOutbox,
    validateLocalScan,
} from '../services/offlineCheckin';
import { announceCheckin, getLanSeen, getLanStatus } from '../services/lanPeer';
import { theme } from '../theme';

const C = theme.colors;
const F = theme.fonts;
const { width, height } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Canonical ticket payload contract  (UNCHANGED)
// ---------------------------------------------------------------------------
const TICKET_SCHEMA_VERSION_V1 = 1;
const TICKET_SCHEMA_VERSION_V2 = 2;
const SUPPORTED_SCHEMA_VERSIONS = [TICKET_SCHEMA_VERSION_V1, TICKET_SCHEMA_VERSION_V2];

const TICKET_TYPE = 'ticket';
const REGISTRATION_TYPE = 'registration';
const VALID_PAYLOAD_TYPES = [TICKET_TYPE, REGISTRATION_TYPE];

const TICKET_CODE_REGEX = /^(TIX|REG)[A-Z0-9]{8,32}$/;
const MAX_QR_PAYLOAD_LENGTH = 2048;

export function extractTicketPayloadWithReason(raw) {
    if (typeof raw !== 'string') {
        return { payload: null, reason: 'not-a-string' };
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) return { payload: null, reason: 'empty' };
    if (trimmed.length > MAX_QR_PAYLOAD_LENGTH) return { payload: null, reason: 'too-long' };

    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        return { payload: null, reason: 'not-json' };
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { payload: null, reason: 'not-object' };
    }
    if (!SUPPORTED_SCHEMA_VERSIONS.includes(parsed.v)) {
        return { payload: null, reason: `bad-v:${parsed.v}` };
    }
    if (!VALID_PAYLOAD_TYPES.includes(parsed.type)) {
        return { payload: null, reason: `bad-type:${parsed.type}` };
    }
    if (parsed.v === TICKET_SCHEMA_VERSION_V1 && parsed.type !== TICKET_TYPE) {
        return { payload: null, reason: 'v1-must-be-ticket' };
    }
    if (typeof parsed.code !== 'string') {
        return { payload: null, reason: 'code-not-string' };
    }
    if (!TICKET_CODE_REGEX.test(parsed.code)) {
        return { payload: null, reason: `bad-code:${parsed.code}` };
    }
    if (typeof parsed.sig !== 'string' || parsed.sig.length === 0) {
        return { payload: null, reason: 'missing-sig' };
    }
    const allowedKeys = new Set(['v', 'type', 'code', 'sig']);
    for (const key of Object.keys(parsed)) {
        if (!allowedKeys.has(key)) return { payload: null, reason: `extra-key:${key}` };
    }
    return {
        payload: { v: parsed.v, type: parsed.type, code: parsed.code, sig: parsed.sig },
        reason: null,
    };
}

export function extractTicketPayload(raw) {
    return extractTicketPayloadWithReason(raw).payload;
}

export function extractTicketCode(raw) {
    const payload = extractTicketPayload(raw);
    return payload ? payload.code : null;
}

export default function ScannerScreen({ navigation }) {
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const [loading, setLoading] = useState(false);
    const [statusText, setStatusText] = useState('Initialize Scan Sequence');
    const [scanCount, setScanCount] = useState(0);
    const [scanLinePosition, setScanLinePosition] = useState(0);
    const animationInterval = useRef(null);
    const { logout } = useContext(AuthContext);

    const [activePack, setActivePack] = useState(null);
    const [pending, setPending] = useState(0);
    const [isOnline, setIsOnline] = useState(true);
    const [manualVisible, setManualVisible] = useState(false);
    const [manualCode, setManualCode] = useState('');
    const [lanPeers, setLanPeers] = useState(0);

    useEffect(() => {
        loadStats();
        loadOfflineState();
        startScanAnimation();

        const lanTimer = setInterval(async () => {
            const status = await getLanStatus();
            setLanPeers(status.peers);
        }, 3000);

        const unsubscribe = NetInfo.addEventListener((state) => {
            const online = Boolean(state.isConnected);
            setIsOnline(online);
            if (online) {
                // Flush anything captured while offline.
                syncOutbox()
                    .then((result) => setPending(result.pending))
                    .catch(() => {});
            }
        });

        return () => {
            if (unsubscribe) unsubscribe();
            clearInterval(lanTimer);
            if (animationInterval.current) {
                clearInterval(animationInterval.current);
                animationInterval.current = null;
            }
        };
    }, []);

    const loadOfflineState = async () => {
        const [pack, count, net] = await Promise.all([
            getActivePack(),
            pendingSyncCount(),
            NetInfo.fetch(),
        ]);
        setActivePack(pack);
        setPending(count);
        const online = Boolean(net?.isConnected);
        setIsOnline(online);

        // Opportunistic sync when the scanner is opened online.
        if (online && count > 0) {
            try {
                const result = await syncOutbox();
                setPending(result.pending);
            } catch {
                // Keep the outbox; the network listener will retry.
            }
        }
    };

    const isNetworkError = (error) => {
        if (!error) return false;
        if (error.code === 'ECONNABORTED' || error.code === 'ERR_NETWORK') return true;
        if (error.message && /network|timeout|failed to fetch/i.test(error.message)) return true;
        return !error.response;
    };

    const startScanAnimation = () => {
        let direction = 1;
        let position = 0;
        animationInterval.current = setInterval(() => {
            position += direction * 2;
            if (position >= 140) direction = -1;
            else if (position <= -140) direction = 1;
            setScanLinePosition(position);
        }, 16);
    };

    const loadStats = async () => {
        try {
            const response = await scannerApi.getStats();
            if (response.data) {
                setScanCount(
                    response.data.today_checkins ??
                        response.data.total_scans ??
                        0
                );
            }
        } catch (error) {
            console.log('Stats not available');
        }
    };

    const handleBarcodeScanned = async ({ type, data }) => {
        if (scanned || loading) return;
        setScanned(true);
        setLoading(true);
        setStatusText('🔍 Decrypting payload...');

        try {
            const { payload: ticketPayload, reason } = extractTicketPayloadWithReason(data);

            if (!ticketPayload) {
                const rawPreview =
                    typeof data === 'string'
                        ? data.length > 240
                            ? data.slice(0, 240) + '…'
                            : data
                        : `[non-string: ${typeof data}]`;

                setStatusText('❌ Invalid Credential');
                Alert.alert(
                    '⛔ Invalid Credential',
                    `The scanned QR code does not match the ticket format.\n\nReason: ${reason}\n\nRaw payload:\n${rawPreview}`,
                    [{ text: 'Acknowledge', onPress: () => setScanned(false) }]
                );
                setLoading(false);
                setTimeout(() => {
                    setScanned(false);
                    setStatusText('Initialize Scan Sequence');
                }, 2000);
                return;
            }

            setStatusText('🛡️ Validating credentials...');

            // LAN gossip may already know this ticket was used at another
            // gate, even while this device still has internet.
            const lanSeen = await getLanSeen(ticketPayload.code);
            if (lanSeen) {
                setStatusText('⚠️ Already Authenticated');
                Alert.alert(
                    '⚠️ Already Authenticated',
                    `This ticket was checked in on another scanner at ${new Date(lanSeen.scanned_at).toLocaleTimeString()}.`,
                    [{ text: 'OK', onPress: () => setScanned(false) }],
                );
                setLoading(false);
                setTimeout(() => {
                    setScanned(false);
                    setStatusText('Initialize Scan Sequence');
                }, 2000);
                return;
            }

            let verifyResponse;
            try {
                verifyResponse = await scannerApi.verify(ticketPayload);
            } catch (verifyError) {
                if (!isNetworkError(verifyError) || !activePack) {
                    throw verifyError;
                }

                // Offline / unreachable server: verify against the signed
                // manifest and the local checked-in state.
                const local = await validateLocalScan(activePack, ticketPayload);
                if (!local.valid) {
                    const title = local.alreadyCheckedIn
                        ? '⚠️ Already Authenticated'
                        : '⛔ Offline Validation Failed';
                    setStatusText(`❌ ${title.replace(/^[^ ]+ /, '')}`);
                    Alert.alert(title, local.message, [
                        { text: 'OK', onPress: () => setScanned(false) },
                    ]);
                    setLoading(false);
                    setTimeout(() => {
                        setScanned(false);
                        setStatusText('Initialize Scan Sequence');
                    }, 2000);
                    return;
                }

                setStatusText('📴 Offline — signed manifest verified');
                verifyResponse = {
                    data: {
                        valid: true,
                        offline: true,
                        ticket: local.ticket,
                    },
                };
            }

            if (verifyResponse.data) {
                const ticketData = verifyResponse.data;

                if (ticketData.valid === true) {
                    const isRegistration =
                        ticketData.ticket?.payload_type === 'registration' ||
                        (ticketData.ticket?.unique_code || '').startsWith('REG');
                    const passLabel = isRegistration ? 'Registration Pass' : 'Ticket';
                    const whoLabel = isRegistration ? 'Registrant' : 'Identity';

                    if (ticketData.ticket?.is_checked_in === true) {
                        setStatusText('⚠️ Already Authenticated');
                        Alert.alert(
                            '⚠️ Already Authenticated',
                            `This ${passLabel.toLowerCase()} was already verified.\n\n${whoLabel}: ${ticketData.ticket?.attendee_name || 'N/A'}\nEvent: ${ticketData.ticket?.event || 'N/A'}\nVerified at: ${ticketData.ticket?.checked_in_at ? new Date(ticketData.ticket.checked_in_at).toLocaleString() : 'N/A'}`,
                            [{ text: 'OK', onPress: () => setScanned(false) }]
                        );
                        setLoading(false);
                        setTimeout(() => {
                            setScanned(false);
                            setStatusText('Initialize Scan Sequence');
                        }, 2000);
                        return;
                    }

                    setStatusText(`✅ ${passLabel} Verified`);
                    Alert.alert(
                        `✅ ${passLabel} Verified`,
                        `${whoLabel}: ${ticketData.ticket?.attendee_name || 'N/A'}\nEvent: ${ticketData.ticket?.event || 'N/A'}`,
                        [
                            {
                                text: '✅ Authenticate',
                                onPress: () => performCheckin(ticketPayload, ticketData),
                            },
                            { text: 'Cancel', style: 'cancel', onPress: () => setScanned(false) },
                        ]
                    );
                    return;
                } else {
                    setStatusText('❌ Authentication Denied');
                    Alert.alert(
                        '⛔ Authentication Denied',
                        ticketData.detail || ticketData.message || 'This credential is not valid',
                        [{ text: 'OK', onPress: () => setScanned(false) }]
                    );
                    setLoading(false);
                    setTimeout(() => {
                        setScanned(false);
                        setStatusText('Initialize Scan Sequence');
                    }, 2000);
                    return;
                }
            }
        } catch (error) {
            console.error('❌ Error:', error);
            let errorMessage = 'Authentication failed.';
            if (error.response?.data?.detail) errorMessage = error.response.data.detail;
            else if (error.response?.data?.error) errorMessage = error.response.data.error;
            else if (error.message) errorMessage = error.message;

            setStatusText('❌ System Error');
            Alert.alert('⚠️ System Error', errorMessage, [
                { text: 'OK', onPress: () => setScanned(false) },
            ]);
        } finally {
            setLoading(false);
            setTimeout(() => {
                setScanned(false);
                setStatusText('Initialize Scan Sequence');
            }, 2000);
        }
    };

    const performCheckin = async (ticketPayload, ticketData) => {
        setLoading(true);
        setStatusText('⚡ Authenticating...');

        // Already known to be offline: do not wait for a server timeout.
        if (ticketData?.offline && activePack) {
            try {
                await recordOfflineCheckin({
                    pack: activePack,
                    payload: ticketPayload,
                    ticket: ticketData?.ticket,
                });
                await loadOfflineState();
                setScanCount((prev) => prev + 1);
                setStatusText('✅ Checked In (Pending Sync)');
                Alert.alert(
                    '✅ Checked In — Pending Sync',
                    `${ticketData?.ticket?.attendee_name || 'Guest'}\n\nSaved locally. It will sync when the network returns.`,
                    [{ text: 'OK', onPress: () => setScanned(false) }],
                );
            } catch (error) {
                Alert.alert('Offline check-in failed', error.message);
            } finally {
                setLoading(false);
                setTimeout(() => {
                    setScanned(false);
                    setStatusText('Initialize Scan Sequence');
                }, 2000);
            }
            return;
        }

        try {
            const response = await scannerApi.checkin(ticketPayload);
            if (response.data) {
                await markLocalTicketUsed(activePack, ticketPayload.code);
                await loadOfflineState();
                setScanCount((prev) => prev + 1);
                setStatusText('✅ Authentication Complete!');
                const isRegistration =
                    ticketData?.ticket?.payload_type === 'registration' ||
                    (ticketData?.ticket?.unique_code || '').startsWith('REG');
                const passLabel = isRegistration ? 'Registration Pass' : 'Ticket';
                const whoLabel = isRegistration ? 'Registrant' : 'Identity';
                Alert.alert(
                    '✅ Authentication Complete',
                    `${passLabel} verified!\n\n${whoLabel}: ${ticketData?.ticket?.attendee_name || 'N/A'}\nEvent: ${ticketData?.ticket?.event || 'N/A'}`,
                    [{ text: 'OK', onPress: () => setScanned(false) }]
                );
            }
        } catch (error) {
            console.error('❌ Check-in failed:', error);

            if (isNetworkError(error) && activePack) {
                try {
                    await recordOfflineCheckin({
                        pack: activePack,
                        payload: ticketPayload,
                        ticket: ticketData?.ticket,
                    });
                    await loadOfflineState();
                    setScanCount((prev) => prev + 1);
                    setStatusText('✅ Checked In (Pending Sync)');
                    Alert.alert(
                        '✅ Checked In — Pending Sync',
                        `${ticketData?.ticket?.attendee_name || 'Guest'}\n\nSaved locally. It will sync when the network returns.`,
                        [{ text: 'OK', onPress: () => setScanned(false) }],
                    );
                    setLoading(false);
                    setTimeout(() => {
                        setScanned(false);
                        setStatusText('Initialize Scan Sequence');
                    }, 2000);
                    return;
                } catch (queueError) {
                    console.error('Offline queue failed:', queueError);
                }
            }

            let errorMessage = 'Authentication failed.';
            if (error.response?.data?.detail) errorMessage = error.response.data.detail;
            else if (error.response?.data?.error) errorMessage = error.response.data.error;
            else if (error.message) errorMessage = error.message;

            setStatusText('❌ Authentication Failed');
            Alert.alert('⚠️ Authentication Failed', errorMessage, [
                { text: 'OK', onPress: () => setScanned(false) },
            ]);
        } finally {
            setLoading(false);
            setTimeout(() => {
                setScanned(false);
                setStatusText('Initialize Scan Sequence');
            }, 2000);
        }
    };

    const handleManualSubmit = async () => {
        const code = manualCode.trim().toUpperCase();
        if (!code) return;

        const manifestTicket = activePack?.tickets?.find((t) => t.code === code);
        if (manifestTicket) {
            const payload = {
                v: manifestTicket.v,
                type: manifestTicket.type,
                code: manifestTicket.code,
                sig: manifestTicket.sig,
            };
            setManualVisible(false);
            setManualCode('');
            setScanned(false);
            setLoading(false);
            await handleBarcodeScanned({ type: 'qr', data: JSON.stringify(payload) });
            return;
        }

        if (!isOnline) {
            Alert.alert(
                'Not in offline pack',
                'This code is not in the downloaded pack. Connect to the internet or download the correct pack.',
            );
            return;
        }

        const lanSeen = await getLanSeen(code);
        if (lanSeen) {
            Alert.alert(
                'Already checked in',
                `This ticket was checked in on another scanner at ${new Date(lanSeen.scanned_at).toLocaleTimeString()}.`,
            );
            return;
        }

        setLoading(true);
        try {
            const verify = await scannerApi.manualVerify(code);
            if (verify.data?.valid) {
                const ticketData = verify.data;
                Alert.alert(
                    '✅ Credential Verified',
                    `Identity: ${ticketData.ticket?.attendee_name || 'N/A'}\nEvent: ${ticketData.ticket?.event || 'N/A'}`,
                    [
                        {
                            text: '✅ Authenticate',
                            onPress: async () => {
                                try {
                                    const deviceId = await getDeviceId();
                                    await scannerApi.manualCheckin(code, deviceId);
                                    await markLocalTicketUsed(activePack, code);
                                    await announceCheckin({
                                        client_id: `${deviceId}-manual-${code}`,
                                        code,
                                        device_id: deviceId,
                                        scanned_at: new Date().toISOString(),
                                    });
                                    await loadOfflineState();
                                    setScanCount((prev) => prev + 1);
                                    setManualVisible(false);
                                    setManualCode('');
                                    Alert.alert('✅ Check-in Complete', 'Credential authenticated.');
                                } catch (error) {
                                    Alert.alert(
                                        'Check-in failed',
                                        error.response?.data?.detail || error.message,
                                    );
                                }
                            },
                        },
                        { text: 'Cancel', style: 'cancel' },
                    ]
                );
            } else {
                Alert.alert('Invalid credential', verify.data?.detail || 'Not found.');
            }
        } catch (error) {
            Alert.alert(
                'Manual check failed',
                error.response?.data?.detail || error.message || 'Could not verify code.',
            );
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        Alert.alert(
            'Terminate Session',
            'Are you sure you want to disconnect?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Logout',
                    style: 'destructive',
                    onPress: async () => {
                        await logout();
                    },
                },
            ]
        );
    };

    if (!permission) {
        return (
            <View style={[styles.container, styles.centerContent]}>
                <Text style={styles.infoText}>Initializing system...</Text>
                <ActivityIndicator color={C.secondary} size="large" style={styles.spinner} />
            </View>
        );
    }

    if (!permission.granted) {
        return (
            <View style={[styles.container, styles.centerContent]}>
                <Text style={styles.warningText}>⚠️ CAMERA ACCESS REQUIRED</Text>
                <Text style={styles.subText}>Permission needed for optical scanning</Text>
                <TouchableOpacity style={styles.grantButton} onPress={requestPermission}>
                    <Text style={styles.grantButtonText}>GRANT PERMISSION</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header — flat dark card, brand red accents */}
            <View style={styles.header}>
                <View style={styles.headerContent}>
                    <Text style={styles.headerTitle}>⚡ SCAN</Text>
                    <View style={styles.headerRight}>
                        <TouchableOpacity
                            style={styles.iconButton}
                            onPress={() => navigation.navigate('OfflinePack')}
                            accessibilityLabel="Offline pack"
                        >
                            <Text style={styles.iconText}>⬇️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.iconButton}
                            onPress={() => navigation.navigate('History')}
                            accessibilityLabel="History"
                        >
                            <Text style={styles.iconText}>📋</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.iconButton}
                            onPress={() => navigation.navigate('Settings')}
                            accessibilityLabel="Settings"
                        >
                            <Text style={styles.iconText}>⚙️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.iconButton}
                            onPress={handleLogout}
                            accessibilityLabel="Logout"
                        >
                            <Text style={styles.iconText}>⏻</Text>
                        </TouchableOpacity>
                    </View>
                </View>
                <View style={styles.statsBar}>
                    <Text style={styles.statsText}>
                        📊 AUTH: {scanCount} · LAN: {lanPeers}
                    </Text>
                    <View style={styles.statusDotWrap}>
                        <View style={styles.statusPulse} />
                    </View>
                </View>
            </View>

            <CameraView
                style={StyleSheet.absoluteFillObject}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
            />

            <View style={styles.overlay}>
                <View style={styles.scanFrame}>
                    <View
                        style={[
                            styles.scanLine,
                            { transform: [{ translateY: scanLinePosition }] },
                        ]}
                    >
                        <LinearGradient
                            colors={['transparent', C.secondary, C.secondaryDark, C.secondary, 'transparent']}
                            style={styles.scanLineGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                        />
                    </View>

                    <View style={[styles.corner, styles.cornerTL]} />
                    <View style={[styles.corner, styles.cornerTR]} />
                    <View style={[styles.corner, styles.cornerBL]} />
                    <View style={[styles.corner, styles.cornerBR]} />
                </View>

                <View style={styles.statusContainer}>
                    <Text style={styles.scanText}>
                        {loading ? (
                            <Text style={styles.loadingText}>⚡ {statusText}</Text>
                        ) : (
                            statusText
                        )}
                    </Text>
                    {loading && (
                        <View style={styles.loadingIndicator}>
                            <ActivityIndicator color={C.secondary} size="small" />
                            <Text style={styles.loadingSubText}>Processing</Text>
                        </View>
                    )}
                </View>
            </View>

            <TouchableOpacity
                style={styles.manualButton}
                onPress={() => setManualVisible(true)}
                accessibilityLabel="Enter ticket code manually"
            >
                <Text style={styles.resetButtonText}>⌨️ ENTER CODE MANUALLY</Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={styles.resetButton}
                onPress={() => {
                    setScanned(false);
                    setLoading(false);
                    setStatusText('Initialize Scan Sequence');
                }}
                accessibilityLabel="Reset scanner"
            >
                <Text style={styles.resetButtonText}>⟳ RESET SCANNER</Text>
            </TouchableOpacity>

            <Modal
                visible={manualVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setManualVisible(false)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Manual Check-in</Text>
                        <Text style={styles.modalHelp}>
                            Enter the ticket or registration code printed below the QR.
                        </Text>
                        <TextInput
                            style={styles.modalInput}
                            value={manualCode}
                            onChangeText={setManualCode}
                            autoCapitalize="characters"
                            autoCorrect={false}
                            placeholder="TIX… / REG…"
                            placeholderTextColor={C.textLight}
                        />
                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalGhost]}
                                onPress={() => { setManualVisible(false); setManualCode(''); }}
                            >
                                <Text style={styles.ghostButtonText}>CANCEL</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalPrimary]}
                                onPress={handleManualSubmit}
                            >
                                <Text style={styles.buttonText}>VALIDATE</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bgPrimary },
    centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
    infoText: {
        color: C.textInverse,
        fontSize: 18,
        fontFamily: F.family,
    },
    warningText: {
        color: C.error,
        fontSize: 20,
        fontFamily: F.familyBold,
        textAlign: 'center',
        marginBottom: 10,
    },
    subText: { color: C.textMuted, fontSize: 14, fontFamily: F.family, marginBottom: 30 },
    spinner: { marginTop: 20 },
    grantButton: {
        backgroundColor: C.secondary,
        borderRadius: theme.radius.sm,
        paddingHorizontal: 40,
        paddingVertical: 15,
        marginTop: 20,
        ...theme.shadows.button,
    },
    grantButtonText: {
        color: C.textInverse,
        fontSize: 16,
        fontFamily: F.familyBold,
    },
    header: {
        paddingTop: 50,
        paddingHorizontal: 20,
        paddingBottom: 15,
        backgroundColor: C.bgDarkCard,
        borderBottomWidth: 1,
        borderBottomColor: C.bgDarkBorder,
        zIndex: 10,
    },
    headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    headerTitle: {
        fontSize: 20,
        fontFamily: F.familyBold,
        color: C.textInverse,
        letterSpacing: 2,
    },
    headerRight: { flexDirection: 'row', alignItems: 'center' },
    iconButton: { marginLeft: 15, padding: 5 },
    iconText: { fontSize: 20, opacity: 0.8 },
    statsBar: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: C.bgDarkBorder,
    },
    statsText: {
        color: C.textMuted,
        fontSize: 12,
        fontFamily: F.familySemiBold,
        letterSpacing: 1,
    },
    statusDotWrap: { flexDirection: 'row', alignItems: 'center' },
    statusPulse: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: C.secondary,
    },
    overlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
    },
    scanFrame: { width: 280, height: 280, position: 'relative' },
    scanLine: {
        position: 'absolute',
        left: -20, right: -20,
        height: 3,
        top: 0,
        zIndex: 5,
    },
    scanLineGradient: { flex: 1, height: 3 },
    corner: {
        position: 'absolute',
        width: 30, height: 30,
        borderColor: C.secondary,
        borderWidth: 3,
    },
    cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
    cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
    cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
    cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
    statusContainer: { marginTop: 30, alignItems: 'center' },
    scanText: {
        color: C.textInverse,
        fontSize: 16,
        backgroundColor: 'rgba(26, 26, 26, 0.88)',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: C.bgDarkBorder,
        fontFamily: F.familySemiBold,
        textAlign: 'center',
    },
    loadingText: { color: C.secondary },
    loadingIndicator: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 },
    loadingSubText: { color: C.textMuted, fontSize: 12, fontFamily: F.family },
    resetButton: {
        position: 'absolute',
        bottom: 40,
        alignSelf: 'center',
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: C.bgDarkBorder,
        backgroundColor: C.bgDarkCard,
        paddingHorizontal: 30,
        paddingVertical: 12,
    },
    pendingBadge: {
        color: C.warning,
        fontSize: 10,
        fontFamily: F.familyBold,
        letterSpacing: 0.5,
    },
    manualButton: {
        position: 'absolute',
        bottom: 92,
        alignSelf: 'center',
        backgroundColor: C.bgDarkCard,
        borderWidth: 1,
        borderColor: C.bgDarkBorder,
        borderRadius: theme.radius.pill,
        paddingHorizontal: 20,
        paddingVertical: 10,
        zIndex: 12,
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.72)',
        justifyContent: 'center',
        padding: 24,
    },
    modalCard: {
        backgroundColor: C.bgDarkCard,
        borderRadius: theme.radius.lg,
        padding: 20,
        borderWidth: 1,
        borderColor: C.bgDarkBorder,
    },
    modalTitle: {
        color: C.textInverse,
        fontFamily: F.familyBold,
        fontSize: 18,
        marginBottom: 6,
    },
    modalHelp: {
        color: C.textMuted,
        fontFamily: F.family,
        fontSize: 12,
        lineHeight: 18,
        marginBottom: 14,
    },
    modalInput: {
        backgroundColor: C.bgPrimary,
        borderWidth: 1,
        borderColor: C.bgDarkBorder,
        borderRadius: theme.radius.sm,
        color: C.textInverse,
        fontFamily: F.familyMono,
        fontSize: 16,
        paddingHorizontal: 14,
        paddingVertical: 12,
        letterSpacing: 1,
    },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    modalButton: { flex: 1, paddingVertical: 12, borderRadius: theme.radius.sm, alignItems: 'center' },
    modalPrimary: { backgroundColor: C.secondary },
    modalGhost: { borderWidth: 1, borderColor: C.bgDarkBorder },
    resetButtonText: {
        color: C.secondary,
        fontSize: 14,
        fontFamily: F.familyBold,
        letterSpacing: 2,
    },
});