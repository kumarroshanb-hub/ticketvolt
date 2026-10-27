// QRScannerApp/src/screens/SettingsScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getCurrentApiUrl,
  updateApiUrl,
  resetApiUrl,
  checkApiHealth,
  initializeApiUrl,
  discoverBackend,
  getWorkingIp,
} from '../services/api';
import { theme } from '../theme';

const C = theme.colors;
const F = theme.fonts;

export default function SettingsScreen({ navigation }) {
  const [apiUrl, setApiUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [isHealthy, setIsHealthy] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [discoveryStatus, setDiscoveryStatus] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [lastWorkingIp, setLastWorkingIp] = useState('');
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryProgress, setDiscoveryProgress] = useState(0);

  const [showCloudOptions, setShowCloudOptions] = useState(false);
  const [ngrokUrl, setNgrokUrl] = useState('');
  const [tunnelUrl, setTunnelUrl] = useState('');
  const [buildTimeUrl, setBuildTimeUrl] = useState('');

  useEffect(() => {
    // Show what was baked in at build time so the user can tell the
    // difference between "no override" and "override active".
    setBuildTimeUrl(process.env.EXPO_PUBLIC_API_URL || '(not set)');

    loadSettings();
    loadLastWorkingIp();
    loadNgrokUrl();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      // This resolves through the same priority chain as the rest of
      // the app: saved override (dev) -> build-time URL -> discovery.
      await initializeApiUrl();
      const url = getCurrentApiUrl();
      setApiUrl(url || '');
      await checkConnection();
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadLastWorkingIp = async () => {
    try {
      const ip = await getWorkingIp();
      if (ip) setLastWorkingIp(ip);
    } catch (error) {
      console.error('Failed to load last working IP:', error);
    }
  };

  const loadNgrokUrl = async () => {
    try {
      const url = await AsyncStorage.getItem('ngrokUrl');
      if (url) {
        setNgrokUrl(url);
        setTunnelUrl(url);
      }
    } catch (error) {
      console.error('Failed to load ngrok URL:', error);
    }
  };

  const checkConnection = async () => {
    setStatusMessage('Establishing connection...');
    try {
      const healthy = await checkApiHealth();
      setIsHealthy(healthy);
      setStatusMessage(healthy ? '🟢 SYSTEM ONLINE' : '🔴 SYSTEM OFFLINE');
      if (healthy) {
        setRetryCount(0);
        const url = getCurrentApiUrl();
        const ipMatch = url.match(/http:\/\/([^:/]+)/);
        if (ipMatch) {
          await AsyncStorage.setItem('lastWorkingIp', ipMatch[1]);
          setLastWorkingIp(ipMatch[1]);
        }
      } else {
        setRetryCount((prev) => prev + 1);
      }
    } catch (error) {
      console.error('Health check error:', error);
      setIsHealthy(false);
      setStatusMessage('⚠️ CONNECTION ERROR');
      setRetryCount((prev) => prev + 1);
    }
  };

  const handleDiscoverBackend = async () => {
    setIsDiscovering(true);
    setDiscoveryProgress(0);
    setDiscoveryStatus('🔍 Searching for backend...');
    setStatusMessage('🔍 Discovering...');

    try {
      const result = await discoverBackend((progress) => {
        setDiscoveryProgress(progress);
        setDiscoveryStatus(`🔍 Scanning... ${progress}%`);
      });

      if (result.success) {
        setApiUrl(result.url);
        setDiscoveryStatus('✅ Backend discovered!');
        setStatusMessage('✅ Discovered: ' + result.url);
        setIsHealthy(true);
        setRetryCount(0);
        setDiscoveryProgress(100);

        const ipMatch = result.url.match(/http:\/\/([^:/]+)/);
        if (ipMatch) {
          await AsyncStorage.setItem('lastWorkingIp', ipMatch[1]);
          setLastWorkingIp(ipMatch[1]);
        }

        Alert.alert(
          '✅ Success!',
          `Backend found at:\n${result.url}\n\nWould you like to use this endpoint?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Use This',
              onPress: async () => {
                try {
                  await updateApiUrl(result.url);
                  await checkConnection();
                  Alert.alert('✅ Connected', 'Backend is now connected successfully!');
                } catch (error) {
                  Alert.alert('⚠️ Error', 'Failed to save endpoint: ' + error.message);
                }
              },
            },
          ]
        );
      } else {
        setDiscoveryStatus('❌ No backend found');
        setStatusMessage('❌ Discovery failed');
        setIsHealthy(false);

        Alert.alert(
          '❌ Not Found',
          'Could not find backend automatically.\n\nPlease enter the URL manually or check:\n' +
            '• Backend is running (docker compose up -d)\n' +
            '• Phone and computer are on same network\n' +
            '• Firewall is disabled',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Discovery error:', error);
      setDiscoveryStatus('❌ Discovery error');
      setStatusMessage('⚠️ Error: ' + error.message);
      Alert.alert('⚠️ Error', 'Discovery failed: ' + error.message);
    } finally {
      setIsDiscovering(false);
    }
  };

  const handleSaveUrl = async () => {
    if (!apiUrl.trim()) {
      Alert.alert('Error', 'Please enter a valid server endpoint');
      return;
    }

    setLoading(true);
    try {
      await updateApiUrl(apiUrl);
      await checkConnection();

      // If this is a tunnel URL, remember it separately so it can be
      // preferred on cellular data in future sessions.
      if (
        apiUrl.includes('ngrok.io') ||
        apiUrl.includes('ngrok-free.app') ||
        apiUrl.includes('trycloudflare.com')
      ) {
        await AsyncStorage.setItem('ngrokUrl', apiUrl);
        setNgrokUrl(apiUrl);
      }

      Alert.alert('✅ Success', 'Server endpoint updated successfully!');
    } catch (error) {
      Alert.alert('⚠️ Error', 'Failed to update endpoint: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTunnel = async () => {
    if (!tunnelUrl.trim()) {
      Alert.alert('Error', 'Please enter a valid tunnel URL');
      return;
    }

    setLoading(true);
    try {
      await updateApiUrl(tunnelUrl);
      await AsyncStorage.setItem('ngrokUrl', tunnelUrl);
      setNgrokUrl(tunnelUrl);
      setApiUrl(getCurrentApiUrl() || tunnelUrl);
      await checkConnection();
      Alert.alert('✅ Success', 'Tunnel endpoint saved and activated!');
    } catch (error) {
      Alert.alert('⚠️ Error', 'Failed to save tunnel: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetUrl = async () => {
    Alert.alert(
      'Reset Configuration',
      'Revert to the default server endpoint?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await resetApiUrl();
              await AsyncStorage.removeItem('ngrokUrl');
              setNgrokUrl('');
              setTunnelUrl('');
              const url = getCurrentApiUrl();
              setApiUrl(url || '');
              await checkConnection();
              Alert.alert('✅ Success', 'Endpoint reset to default');
            } catch (error) {
              Alert.alert('⚠️ Error', 'Failed to reset: ' + error.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const openHelp = () => {
    Alert.alert(
      '📱 Connection Help',
      '1. Make sure backend is running:\n   docker compose up -d\n\n' +
        '2. Find your computer IP:\n   ipconfig getifaddr en0\n\n' +
        '3. Phone and computer must be on same WiFi\n\n' +
        '4. Try using the 🔍 DISCOVER button\n\n' +
        '5. Check firewall settings\n\n' +
        '6. For Android emulator use:\n   http://10.0.2.2:8000/api\n\n' +
        '7. For physical device use:\n   http://YOUR_IP:8000/api\n\n' +
        '8. The app remembers your last working IP',
      [{ text: 'OK' }]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>⚙️ SYSTEM CONFIG</Text>
          <Text style={styles.subtitle}>Configure the scanner interface</Text>
          <View style={styles.headerDivider} />
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>SERVER ENDPOINT</Text>
          <Text style={styles.hint}>
            Enter the URL where your TicketVolt backend is running
          </Text>

          {lastWorkingIp ? (
            <View style={styles.lastIpContainer}>
              <Text style={styles.lastIpLabel}>📌 Last Working IP:</Text>
              <Text style={styles.lastIpValue}>{lastWorkingIp}</Text>
            </View>
          ) : null}

          <View style={styles.lastIpContainer}>
            <Text style={styles.lastIpLabel}>
              🔒 Build-time URL (EXPO_PUBLIC_API_URL):
            </Text>
            <Text
              style={styles.lastIpValue}
              numberOfLines={1}
              ellipsizeMode="middle"
            >
              {buildTimeUrl}
            </Text>
          </View>

          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              value={apiUrl}
              onChangeText={setApiUrl}
              placeholder="http://192.168.31.197:8000/api"
              placeholderTextColor={C.textDisabled}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.discoverButton]}
              onPress={handleDiscoverBackend}
              disabled={loading || isDiscovering}
            >
              {isDiscovering ? (
                <View style={[styles.buttonInner, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }]}>
                  <ActivityIndicator color={C.textInverse} size="small" />
                  <Text style={[styles.buttonText, { marginLeft: 8 }]}>
                    {discoveryProgress}%
                  </Text>
                </View>
              ) : (
                <View style={styles.buttonInner}>
                  <Text style={styles.buttonText}>🔍 DISCOVER</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={handleSaveUrl}
              disabled={loading}
            >
              <View style={styles.buttonInner}>
                {loading ? (
                  <ActivityIndicator color={C.textInverse} size="small" />
                ) : (
                  <Text style={styles.buttonText}>UPDATE</Text>
                )}
              </View>
            </TouchableOpacity>
          </View>

          {isDiscovering && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View
                  style={[styles.progressFill, { width: `${discoveryProgress}%` }]}
                />
              </View>
              <Text style={styles.progressText}>{discoveryStatus}</Text>
            </View>
          )}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.resetButton, styles.fullWidthButton]}
              onPress={handleResetUrl}
              disabled={loading}
            >
              <View style={[styles.buttonInner, styles.resetButtonInner]}>
                <Text style={styles.resetButtonText}>RESET TO DEFAULT</Text>
              </View>
            </TouchableOpacity>
          </View>

          {discoveryStatus && !isDiscovering ? (
            <View style={styles.discoveryStatusContainer}>
              <Text style={styles.discoveryStatusText}>{discoveryStatus}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>☁️ CLOUD CONNECTION</Text>
          <Text style={styles.hint}>
            Use when phone is on mobile data and Mac is on WiFi
          </Text>

          <TouchableOpacity
            style={styles.ngrokButton}
            onPress={() => setShowCloudOptions(!showCloudOptions)}
          >
            <Text style={styles.ngrokButtonText}>
              {showCloudOptions ? '▼ Hide Cloud Options' : '▶ Show Cloud Options'}
            </Text>
          </TouchableOpacity>

          {showCloudOptions && (
            <View>
              <View style={styles.tipContainer}>
                <Text style={styles.tipTitle}>
                  🔗 ngrok / Cloudflare:
                </Text>
                <Text style={styles.tip}>1. Install: brew install ngrok</Text>
                <Text style={styles.tip}>2. Run: ngrok http 8000</Text>
                <Text style={styles.tip}>
                  3. Copy the URL (e.g., https://abc.ngrok-free.app)
                </Text>
                <Text style={styles.tip}>4. Add /api to the end</Text>
              </View>

              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  value={tunnelUrl}
                  onChangeText={setTunnelUrl}
                  placeholder="https://abc123.ngrok-free.app/api"
                  placeholderTextColor={C.textDisabled}
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!loading}
                />
              </View>

              <TouchableOpacity
                style={[styles.button, styles.fullWidthButton]}
                onPress={handleSaveTunnel}
                disabled={loading}
              >
                <View style={styles.buttonInner}>
                  {loading ? (
                    <ActivityIndicator color={C.textInverse} size="small" />
                  ) : (
                    <Text style={styles.buttonText}>SAVE TUNNEL</Text>
                  )}
                </View>
              </TouchableOpacity>

              {ngrokUrl ? (
                <View style={styles.savedUrlContainer}>
                  <Text style={styles.savedUrlText}>📌 Saved: {ngrokUrl}</Text>
                </View>
              ) : null}
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>CONNECTION STATUS</Text>
          <TouchableOpacity
            style={[styles.checkButton, loading && styles.disabled]}
            onPress={checkConnection}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={C.secondary} size="small" />
            ) : (
              <Text style={styles.checkButtonText}>⟳ PING SERVER</Text>
            )}
          </TouchableOpacity>
          <View style={styles.statusContainer}>
            <View
              style={[
                styles.statusBadge,
                isHealthy ? styles.statusHealthy : styles.statusUnhealthy,
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  isHealthy ? styles.statusTextHealthy : styles.statusTextUnhealthy,
                ]}
              >
                {statusMessage || (isHealthy ? '🟢 SYSTEM ONLINE' : '🔴 SYSTEM OFFLINE')}
              </Text>
            </View>
            {!isHealthy && retryCount > 2 && (
              <Text style={styles.retryText}>
                ⚠️ Multiple connection attempts failed. Check your network.
              </Text>
            )}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>📋 TROUBLESHOOTING</Text>

          <TouchableOpacity style={styles.helpButton} onPress={openHelp}>
            <Text style={styles.helpButtonText}>🆘 GET HELP</Text>
          </TouchableOpacity>

          <View style={styles.tipContainer}>
            <Text style={styles.tipTitle}>COMMON ISSUES:</Text>
            <Text style={styles.tip}>1. Ensure backend is running on your computer</Text>
            <Text style={styles.tip}>2. Verify your computer's IP address</Text>
            <Text style={styles.tip}>3. Phone and computer must be on same network</Text>
            <Text style={styles.tip}>4. Temporarily disable firewall</Text>
            <Text style={styles.tip}>5. Use: http://YOUR_IP:8000/api</Text>
          </View>

          <View style={styles.tipContainer}>
            <Text style={styles.tipTitle}>FIND YOUR IP:</Text>
            <Text style={styles.tip}>Mac: ipconfig getifaddr en0</Text>
            <Text style={styles.tip}>Windows: ipconfig</Text>
            <Text style={styles.tip}>Linux: hostname -I</Text>
          </View>

          <View style={styles.tipContainer}>
            <Text style={styles.tipTitle}>
              AUTO-DISCOVER:
            </Text>
            <Text style={styles.tip}>
              Tap the 🔍 DISCOVER button to automatically find your backend
            </Text>
            <Text style={styles.tip}>
              The app scans IPs around your current IP first
            </Text>
            <Text style={styles.tip}>
              The app remembers your last working IP address
            </Text>
          </View>

          <View style={styles.tipContainer}>
            <Text style={styles.tipTitle}>
              ☁️ CLOUD CONNECTION:
            </Text>
            <Text style={styles.tip}>
              Use ngrok when phone and computer are on different networks
            </Text>
            <Text style={styles.tip}>
              The app will remember your tunnel URL for future use
            </Text>
            <Text style={styles.tip}>Perfect for testing on cellular data</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>⚡ TICKETVOLT v1.0</Text>
          <Text style={styles.footerSubText}>
            Smart IP Auto-Discovery Enabled
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bgDark,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 25,
    paddingTop: 10,
  },
  title: {
    fontSize: 24,
    fontFamily: F.familyBold,
    color: C.textInverse,
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 14,
    color: C.textMuted,
    marginTop: 5,
    fontFamily: F.family,
    letterSpacing: 1,
  },
  headerDivider: {
    height: 2,
    width: 40,
    backgroundColor: C.secondary,
    marginTop: 15,
  },
  card: {
    backgroundColor: C.bgDarkCard,
    padding: 20,
    borderRadius: theme.radius.md,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: C.bgDarkBorder,
  },
  label: {
    fontSize: 14,
    fontFamily: F.familySemiBold,
    color: C.textInverse,
    marginBottom: 5,
    letterSpacing: 2,
  },
  hint: {
    fontSize: 12,
    color: C.textMuted,
    marginBottom: 12,
    fontFamily: F.family,
  },
  inputWrapper: {
    borderWidth: 1,
    borderColor: C.bgDarkBorder,
    borderRadius: theme.radius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    marginBottom: 12,
  },
  input: {
    padding: 12,
    fontSize: 14,
    color: C.textInverse,
    fontFamily: F.family,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  button: {
    flex: 1,
    borderRadius: theme.radius.sm,
    overflow: 'hidden',
    backgroundColor: C.secondary,
  },
  buttonInner: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discoverButton: {
    marginRight: 5,
  },
  saveButton: {
    marginLeft: 5,
  },
  resetButton: {
    flex: 1,
    backgroundColor: C.bgDark,
    borderWidth: 1,
    borderColor: C.secondary,
  },
  resetButtonInner: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidthButton: {
    width: '100%',
  },
  buttonText: {
    color: C.textInverse,
    fontSize: 14,
    fontFamily: F.familyBold,
    letterSpacing: 2,
  },
  resetButtonText: {
    color: C.secondary,
    fontSize: 14,
    fontFamily: F.familyBold,
    letterSpacing: 2,
  },
  checkButton: {
    borderRadius: theme.radius.sm,
    backgroundColor: C.bgDark,
    borderWidth: 1,
    borderColor: C.bgDarkBorder,
    paddingVertical: 12,
    alignItems: 'center',
    marginVertical: 10,
  },
  checkButtonText: {
    color: C.textInverse,
    fontSize: 14,
    fontFamily: F.familySemiBold,
    letterSpacing: 2,
  },
  disabled: {
    opacity: 0.5,
  },
  statusContainer: {
    marginTop: 10,
    alignItems: 'center',
  },
  statusBadge: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: theme.radius.sm,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
  },
  statusHealthy: {
    backgroundColor: `${C.success}1A`,
    borderColor: `${C.success}4D`,
  },
  statusUnhealthy: {
    backgroundColor: `${C.error}1A`,
    borderColor: `${C.error}4D`,
  },
  statusText: {
    fontSize: 14,
    fontFamily: F.familySemiBold,
    letterSpacing: 1,
  },
  statusTextHealthy: {
    color: C.success,
  },
  statusTextUnhealthy: {
    color: C.error,
  },
  retryText: {
    color: C.warning,
    fontSize: 12,
    fontFamily: F.family,
    marginTop: 8,
    textAlign: 'center',
  },
  discoveryStatusContainer: {
    marginTop: 10,
    padding: 10,
    borderRadius: theme.radius.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: C.bgDarkBorder,
  },
  discoveryStatusText: {
    color: C.textMuted,
    fontSize: 12,
    fontFamily: F.family,
    textAlign: 'center',
  },
  lastIpContainer: {
    marginBottom: 12,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: C.bgDarkBorder,
  },
  lastIpLabel: {
    color: C.textLight,
    fontSize: 11,
    fontFamily: F.family,
  },
  lastIpValue: {
    color: C.textInverse,
    fontSize: 14,
    fontFamily: F.familyMono,
    fontWeight: 'bold',
    marginTop: 2,
  },
  progressContainer: {
    marginTop: 10,
    marginBottom: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: C.secondary,
    borderRadius: 2,
  },
  progressText: {
    color: C.textMuted,
    fontSize: 11,
    fontFamily: F.family,
    marginTop: 4,
    textAlign: 'center',
  },
  ngrokButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: C.bgDarkBorder,
    marginBottom: 10,
  },
  ngrokButtonText: {
    color: C.textInverse,
    fontSize: 14,
    fontFamily: F.family,
    textAlign: 'center',
    letterSpacing: 1,
  },
  savedUrlContainer: {
    marginTop: 8,
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: C.bgDarkBorder,
  },
  savedUrlText: {
    color: C.textMuted,
    fontSize: 12,
    fontFamily: F.familyMono,
  },
  helpButton: {
    borderRadius: theme.radius.sm,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.bgDarkBorder,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    marginVertical: 10,
  },
  helpButtonText: {
    color: C.textInverse,
    fontSize: 14,
    fontFamily: F.familySemiBold,
    letterSpacing: 2,
  },
  tipContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 15,
    borderRadius: theme.radius.sm,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: C.secondary,
  },
  tipTitle: {
    fontSize: 12,
    fontFamily: F.familyBold,
    color: C.textInverse,
    marginBottom: 5,
    letterSpacing: 1,
  },
  tip: {
    fontSize: 12,
    color: C.textMuted,
    marginBottom: 3,
    fontFamily: F.family,
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
  },
  footerText: {
    color: C.textLight,
    fontSize: 12,
    fontFamily: F.familySemiBold,
    letterSpacing: 3,
  },
  footerSubText: {
    color: C.textDisabled,
    fontSize: 10,
    fontFamily: F.family,
    marginTop: 4,
    letterSpacing: 1,
  },
});