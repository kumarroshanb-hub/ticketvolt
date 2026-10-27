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
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthContext } from '../context/AuthContext';
import { scannerApi } from '../services/api';
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

    useEffect(() => {
        loadStats();
        startScanAnimation();
        return () => {
            if (animationInterval.current) {
                clearInterval(animationInterval.current);
                animationInterval.current = null;
            }
        };
    }, []);

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
            const verifyResponse = await scannerApi.verify(ticketPayload);

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

        try {
            const response = await scannerApi.checkin(ticketPayload);
            if (response.data) {
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
                    <Text style={styles.statsText}>📊 AUTHENTICATIONS: {scanCount}</Text>
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
    resetButtonText: {
        color: C.secondary,
        fontSize: 14,
        fontFamily: F.familyBold,
        letterSpacing: 2,
    },
});