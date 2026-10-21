// QRScannerApp/src/screens/ScannerScreen.js - NO ANIMATED API
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

const { width, height } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Canonical ticket payload contract
// ---------------------------------------------------------------------------
const TICKET_SCHEMA_VERSION = 1;
const TICKET_TYPE = 'ticket';
const TICKET_CODE_REGEX = /^TIX[A-Z0-9]{8,32}$/;
const MAX_QR_PAYLOAD_LENGTH = 2048;

// ---------------------------------------------------------------------------
// Strict extractor -- fail closed. Returns the canonical payload object
// ({ v, type, code, sig }) or null. Also returns a diagnostic reason
// so the UI can tell the operator *why* the payload was rejected.
// ---------------------------------------------------------------------------
export function extractTicketPayloadWithReason(raw) {
  if (typeof raw !== 'string') {
    return { payload: null, reason: 'not-a-string' };
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { payload: null, reason: 'empty' };
  }
  if (trimmed.length > MAX_QR_PAYLOAD_LENGTH) {
    return { payload: null, reason: 'too-long' };
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { payload: null, reason: 'not-json' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { payload: null, reason: 'not-object' };
  }

  if (parsed.v !== TICKET_SCHEMA_VERSION) {
    return { payload: null, reason: `bad-v:${parsed.v}` };
  }
  if (parsed.type !== TICKET_TYPE) {
    return { payload: null, reason: `bad-type:${parsed.type}` };
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
    if (!allowedKeys.has(key)) {
      return { payload: null, reason: `extra-key:${key}` };
    }
  }

  return {
    payload: {
      v: parsed.v,
      type: parsed.type,
      code: parsed.code,
      sig: parsed.sig,
    },
    reason: null,
  };
}

// Backwards-compatible helper that returns just the payload or null.
export function extractTicketPayload(raw) {
  return extractTicketPayloadWithReason(raw).payload;
}

// Backwards-compatible helper for any callers that still expect a code string.
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

      if (position >= 140) {
        direction = -1;
      } else if (position <= -140) {
        direction = 1;
      }

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

    // === TEMPORARY DIAGNOSTIC — remove once the QR format is confirmed ===
    console.log('=== [QR RAW] ===');
    console.log('type:', type);
    console.log('data typeof:', typeof data);
    console.log('data length:', typeof data === 'string' ? data.length : 'n/a');
    console.log('data:', data);
    console.log('=== [/QR RAW] ===');
    // === END TEMPORARY DIAGNOSTIC ===

    try {
      const { payload: ticketPayload, reason } = extractTicketPayloadWithReason(data);

      if (!ticketPayload) {
        // Include the raw data (truncated) and the parser reason in the
        // alert so the operator sees exactly what failed without needing
        // to open the terminal.
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
          if (ticketData.ticket?.is_checked_in === true) {
            setStatusText('⚠️ Already Authenticated');
            Alert.alert(
              '⚠️ Already Authenticated',
              `This credential was already verified.\n\nIdentity: ${ticketData.ticket?.attendee_name || 'N/A'}\nEvent: ${ticketData.ticket?.event || 'N/A'}\nVerified at: ${ticketData.ticket?.checked_in_at ? new Date(ticketData.ticket.checked_in_at).toLocaleString() : 'N/A'}`,
              [{ text: 'OK', onPress: () => setScanned(false) }]
            );
            setLoading(false);
            setTimeout(() => {
              setScanned(false);
              setStatusText('Initialize Scan Sequence');
            }, 2000);
            return;
          }

          setStatusText('✅ Authentication Successful');
          Alert.alert(
            '✅ Authentication Successful',
            `Credential verified!\n\nIdentity: ${ticketData.ticket?.attendee_name || 'N/A'}\nEvent: ${ticketData.ticket?.event || 'N/A'}`,
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
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      setStatusText('❌ System Error');
      Alert.alert(
        '⚠️ System Error',
        errorMessage,
        [{ text: 'OK', onPress: () => setScanned(false) }]
      );
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
        setScanCount(prev => prev + 1);
        setStatusText('✅ Authentication Complete!');
        Alert.alert(
          '✅ Authentication Complete',
          `Credential has been verified!\n\nIdentity: ${ticketData?.ticket?.attendee_name || 'N/A'}\nEvent: ${ticketData?.ticket?.event || 'N/A'}`,
          [{ text: 'OK', onPress: () => setScanned(false) }]
        );
      }
    } catch (error) {
      console.error('❌ Check-in failed:', error);

      let errorMessage = 'Authentication failed.';
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }

      setStatusText('❌ Authentication Failed');
      Alert.alert(
        '⚠️ Authentication Failed',
        errorMessage,
        [{ text: 'OK', onPress: () => setScanned(false) }]
      );
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
      <LinearGradient colors={['#0a0a0f', '#1a0a2e']} style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.futuristicText}>Initializing system...</Text>
          <ActivityIndicator color="#00f5ff" size="large" style={styles.spinner} />
        </View>
      </LinearGradient>
    );
  }

  if (!permission.granted) {
    return (
      <LinearGradient colors={['#0a0a0f', '#1a0a2e']} style={styles.container}>
        <View style={styles.centerContent}>
          <Text style={styles.futuristicWarningText}>⚠️ CAMERA ACCESS REQUIRED</Text>
          <Text style={styles.futuristicSubText}>Permission needed for optical scanning</Text>
          <TouchableOpacity style={styles.grantButton} onPress={requestPermission}>
            <LinearGradient
              colors={['#00f5ff', '#0066ff']}
              style={styles.grantButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.grantButtonText}>GRANT PERMISSION</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(10,10,15,0.95)', 'rgba(26,10,46,0.9)']}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>⚡ SCAN</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => navigation.navigate('History')}
            >
              <Text style={styles.iconText}>📋</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => navigation.navigate('Settings')}
            >
              <Text style={styles.iconText}>⚙️</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleLogout}
            >
              <Text style={styles.iconText}>⏻</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.statsBar}>
          <Text style={styles.statsText}>📊 AUTHENTICATIONS: {scanCount}</Text>
          <View style={styles.statusDot}>
            <View style={[styles.statusPulse, { backgroundColor: '#00f5ff' }]} />
          </View>
        </View>
      </LinearGradient>

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
              colors={['transparent', '#00f5ff', '#0066ff', '#00f5ff', 'transparent']}
              style={styles.scanLineGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />
          </View>

          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />

          <View style={[styles.cornerGlow, styles.cornerGlowTL]} />
          <View style={[styles.cornerGlow, styles.cornerGlowTR]} />
          <View style={[styles.cornerGlow, styles.cornerGlowBL]} />
          <View style={[styles.cornerGlow, styles.cornerGlowBR]} />
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
              <ActivityIndicator color="#00f5ff" size="small" />
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
      >
        <LinearGradient
          colors={['rgba(0,245,255,0.15)', 'rgba(0,102,255,0.15)']}
          style={styles.resetButtonGradient}
        >
          <Text style={styles.resetButtonText}>⟳ RESET SCANNER</Text>
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  centerContent: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  futuristicText: {
    color: '#00f5ff', fontSize: 20, fontFamily: 'monospace',
    textShadowColor: '#00f5ff', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 20,
  },
  futuristicWarningText: {
    color: '#ff0055', fontSize: 24, fontFamily: 'monospace',
    textShadowColor: '#ff0055', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 30,
    marginBottom: 10,
  },
  futuristicSubText: { color: '#8899aa', fontSize: 16, fontFamily: 'monospace', marginBottom: 30 },
  spinner: { marginTop: 20 },
  grantButton: { borderRadius: 8, overflow: 'hidden', marginTop: 20 },
  grantButtonGradient: { paddingHorizontal: 40, paddingVertical: 15, borderRadius: 8 },
  grantButtonText: {
    color: '#0a0a0f', fontSize: 16, fontWeight: 'bold', fontFamily: 'monospace',
  },
  header: {
    paddingTop: 50, paddingHorizontal: 20, paddingBottom: 15,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,245,255,0.2)',
    position: 'relative', zIndex: 10,
  },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: {
    fontSize: 22, fontWeight: 'bold', color: '#00f5ff', fontFamily: 'monospace',
    textShadowColor: '#00f5ff', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 15,
    letterSpacing: 2,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { marginLeft: 15, padding: 5 },
  iconText: { fontSize: 20, opacity: 0.8 },
  statsBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 8, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: 'rgba(0,245,255,0.1)',
  },
  statsText: {
    color: '#00f5ff', fontSize: 12, fontFamily: 'monospace', opacity: 0.7, letterSpacing: 1,
  },
  statusDot: { flexDirection: 'row', alignItems: 'center' },
  statusPulse: {
    width: 8, height: 8, borderRadius: 4, marginRight: 6,
    shadowColor: '#00f5ff', shadowOffset: { width: 0, height: 0 }, shadowRadius: 10,
  },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
  },
  scanFrame: { width: 280, height: 280, position: 'relative' },
  scanLine: {
    position: 'absolute', left: -20, right: -20, height: 3, top: 0, zIndex: 5,
  },
  scanLineGradient: {
    flex: 1, height: 3,
    shadowColor: '#00f5ff', shadowOffset: { width: 0, height: 0 }, shadowRadius: 20,
  },
  corner: {
    position: 'absolute', width: 30, height: 30,
    borderColor: '#00f5ff', borderWidth: 2,
    shadowColor: '#00f5ff', shadowOffset: { width: 0, height: 0 }, shadowRadius: 15,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
  cornerGlow: {
    position: 'absolute', width: 60, height: 60,
    borderColor: 'rgba(0,245,255,0.1)', borderWidth: 1,
  },
  cornerGlowTL: { top: -15, left: -15, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerGlowTR: { top: -15, right: -15, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerGlowBL: { bottom: -15, left: -15, borderTopWidth: 0, borderRightWidth: 0 },
  cornerGlowBR: { bottom: -15, right: -15, borderTopWidth: 0, borderLeftWidth: 0 },
  statusContainer: { marginTop: 30, alignItems: 'center' },
  scanText: {
    color: 'white', fontSize: 16,
    backgroundColor: 'rgba(10,10,15,0.8)',
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(0,245,255,0.3)',
    fontFamily: 'monospace', textAlign: 'center',
    shadowColor: '#00f5ff', shadowOffset: { width: 0, height: 0 }, shadowRadius: 20,
  },
  loadingText: { color: '#00f5ff' },
  loadingIndicator: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 },
  loadingSubText: { color: '#8899aa', fontSize: 12, fontFamily: 'monospace' },
  resetButton: {
    position: 'absolute', bottom: 40, alignSelf: 'center',
    borderRadius: 25, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(0,245,255,0.3)',
  },
  resetButtonGradient: { paddingHorizontal: 30, paddingVertical: 12 },
  resetButtonText: {
    color: '#00f5ff', fontSize: 14, fontWeight: '600',
    fontFamily: 'monospace', letterSpacing: 2,
  },
});