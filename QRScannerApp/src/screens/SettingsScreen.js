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
import { LinearGradient } from 'expo-linear-gradient';
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

  useEffect(() => {
    loadSettings();
    loadLastWorkingIp();
    loadNgrokUrl();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      await initializeApiUrl();
      const url = await getCurrentApiUrl();
      setApiUrl(url);
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
      if (ip) {
        setLastWorkingIp(ip);
      }
    } catch (error) {
      console.error('Failed to load last working IP:', error);
    }
  };

  const loadNgrokUrl = async () => {
    try {
      const url = await AsyncStorage.getItem('ngrokUrl');
      if (url) setNgrokUrl(url);
    } catch (e) {
      console.error('Failed to load ngrok URL:', e);
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
        const url = await getCurrentApiUrl();
        const ipMatch = url.match(/http:\/\/([^:]+)/);
        if (ipMatch) {
          await AsyncStorage.setItem('lastWorkingIp', ipMatch[1]);
          setLastWorkingIp(ipMatch[1]);
        }
      }
    } catch (error) {
      console.error('Health check error:', error);
      setIsHealthy(false);
      setStatusMessage('⚠️ CONNECTION ERROR');
      setRetryCount(prev => prev + 1);
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
        
        const ipMatch = result.url.match(/http:\/\/([^:]+)/);
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
              }
            }
          ]
        );
      } else {
        setDiscoveryStatus('❌ No backend found');
        setStatusMessage('❌ Discovery failed');
        setIsHealthy(false);
        
        Alert.alert(
          '❌ Not Found',
          'Could not find backend automatically.\n\nPlease enter the URL manually or check:\n• Backend is running (docker compose up -d)\n• Phone and computer are on same network\n• Firewall is disabled',
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
      
      if (apiUrl.includes('ngrok.io')) {
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

  const handleResetUrl = async () => {
    Alert.alert(
      'Reset Configuration',
      'Revert to default server endpoint?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          onPress: async () => {
            setLoading(true);
            try {
              await resetApiUrl();
              await AsyncStorage.removeItem('ngrokUrl');
              setNgrokUrl('');
              const url = await getCurrentApiUrl();
              setApiUrl(url);
              await checkConnection();
              Alert.alert('✅ Success', 'Endpoint reset to default');
            } catch (error) {
              Alert.alert('⚠️ Error', 'Failed to reset: ' + error.message);
            } finally {
              setLoading(false);
            }
          }
        }
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
    <LinearGradient colors={['#0a0a0f', '#1a0a2e', '#0a0a0f']} style={styles.container}>
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
          
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.input}
              value={apiUrl}
              onChangeText={setApiUrl}
              placeholder="http://192.168.31.233:8000/api"
              placeholderTextColor="rgba(136,153,170,0.5)"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.discoverButton]}
              onPress={handleDiscoverBackend}
              disabled={loading || isDiscovering}
            >
              <LinearGradient
                colors={['#00f5ff', '#0066ff']}
                style={styles.buttonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {isDiscovering ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <ActivityIndicator color="#0a0a0f" size="small" />
                    <Text style={[styles.buttonText, { marginLeft: 8 }]}>
                      {discoveryProgress}%
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.buttonText}>🔍 DISCOVER</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={handleSaveUrl}
              disabled={loading}
            >
              <LinearGradient
                colors={['#00f5ff', '#0066ff']}
                style={styles.buttonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {loading ? (
                  <ActivityIndicator color="#0a0a0f" size="small" />
                ) : (
                  <Text style={styles.buttonText}>UPDATE</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
          
          {isDiscovering && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${discoveryProgress}%` }]} />
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
              <LinearGradient
                colors={['rgba(255,0,85,0.2)', 'rgba(255,0,85,0.1)']}
                style={styles.buttonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.resetButtonText}>RESET TO DEFAULT</Text>
              </LinearGradient>
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
              <View style={[styles.tipContainer, { borderLeftColor: '#8b5cf6' }]}>
                <Text style={[styles.tipTitle, { color: '#8b5cf6' }]}>🔗 ngrok:</Text>
                <Text style={styles.tip}>
                  1. Install: brew install ngrok
                </Text>
                <Text style={styles.tip}>
                  2. Run: ngrok http 8000
                </Text>
                <Text style={styles.tip}>
                  3. Copy the URL (e.g., https://abc.ngrok.io)
                </Text>
                <Text style={styles.tip}>
                  4. Add /api to the end
                </Text>
              </View>
              
              <View style={styles.inputWrapper}>
                <TextInput
                  style={styles.input}
                  value={apiUrl}
                  onChangeText={setApiUrl}
                  placeholder="https://abc123.ngrok.io/api"
                  placeholderTextColor="rgba(136,153,170,0.5)"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              
              {ngrokUrl ? (
                <View style={styles.savedUrlContainer}>
                  <Text style={styles.savedUrlText}>
                    📌 Saved: {ngrokUrl}
                  </Text>
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
            <LinearGradient
              colors={['rgba(0,245,255,0.15)', 'rgba(0,102,255,0.15)']}
              style={styles.checkButtonGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {loading ? (
                <ActivityIndicator color="#00f5ff" size="small" />
              ) : (
                <Text style={styles.checkButtonText}>⟳ PING SERVER</Text>
              )}
            </LinearGradient>
          </TouchableOpacity>
          <View style={styles.statusContainer}>
            <View style={[
              styles.statusBadge,
              isHealthy ? styles.statusHealthy : styles.statusUnhealthy
            ]}>
              <Text style={[
                styles.statusText,
                isHealthy ? styles.statusTextHealthy : styles.statusTextUnhealthy
              ]}>
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
            <LinearGradient
              colors={['rgba(0,245,255,0.1)', 'rgba(0,102,255,0.1)']}
              style={styles.helpButtonGradient}
            >
              <Text style={styles.helpButtonText}>🆘 GET HELP</Text>
            </LinearGradient>
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

          <View style={[styles.tipContainer, { borderLeftColor: '#00f5ff' }]}>
            <Text style={[styles.tipTitle, { color: '#00f5ff' }]}>AUTO-DISCOVER:</Text>
            <Text style={styles.tip}>Tap the 🔍 DISCOVER button to automatically find your backend</Text>
            <Text style={styles.tip}>The app scans IPs around your current IP first</Text>
            <Text style={styles.tip}>The app remembers your last working IP address</Text>
          </View>

          <View style={[styles.tipContainer, { borderLeftColor: '#8b5cf6' }]}>
            <Text style={[styles.tipTitle, { color: '#8b5cf6' }]}>☁️ CLOUD CONNECTION:</Text>
            <Text style={styles.tip}>Use ngrok when phone and computer are on different networks</Text>
            <Text style={styles.tip}>The app will remember your ngrok URL for future use</Text>
            <Text style={styles.tip}>Perfect for testing on cellular data</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>⚡ TICKETVOLT v1.0</Text>
          <Text style={styles.footerSubText}>Smart IP Auto-Discovery Enabled</Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    fontSize: 28,
    fontWeight: 'bold',
    color: '#00f5ff',
    fontFamily: 'monospace',
    textShadowColor: '#00f5ff',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
    letterSpacing: 3,
  },
  subtitle: {
    fontSize: 14,
    color: '#8899aa',
    marginTop: 5,
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  headerDivider: {
    height: 1,
    backgroundColor: 'rgba(0,245,255,0.2)',
    marginTop: 15,
  },
  card: {
    backgroundColor: 'rgba(26,10,46,0.6)',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,245,255,0.1)',
    shadowColor: '#00f5ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#00f5ff',
    marginBottom: 5,
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  hint: {
    fontSize: 12,
    color: '#8899aa',
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  inputWrapper: {
    borderWidth: 1,
    borderColor: 'rgba(0,245,255,0.2)',
    borderRadius: 8,
    backgroundColor: 'rgba(10,10,15,0.8)',
    marginBottom: 12,
  },
  input: {
    padding: 12,
    fontSize: 14,
    color: '#ffffff',
    fontFamily: 'monospace',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  button: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  discoverButton: {
    marginRight: 5,
  },
  saveButton: {
    marginLeft: 5,
  },
  resetButton: {
    flex: 1,
  },
  fullWidthButton: {
    width: '100%',
  },
  buttonGradient: {
    padding: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#0a0a0f',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  resetButtonText: {
    color: '#ff0055',
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  checkButton: {
    borderRadius: 8,
    overflow: 'hidden',
    marginVertical: 10,
  },
  checkButtonGradient: {
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,245,255,0.2)',
    borderRadius: 8,
  },
  checkButtonText: {
    color: '#00f5ff',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
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
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
  },
  statusHealthy: {
    backgroundColor: 'rgba(0,245,255,0.1)',
    borderColor: 'rgba(0,245,255,0.3)',
  },
  statusUnhealthy: {
    backgroundColor: 'rgba(255,0,85,0.1)',
    borderColor: 'rgba(255,0,85,0.3)',
  },
  statusText: {
    fontSize: 14,
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  statusTextHealthy: {
    color: '#00f5ff',
  },
  statusTextUnhealthy: {
    color: '#ff0055',
  },
  retryText: {
    color: '#f59e0b',
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 8,
    textAlign: 'center',
  },
  discoveryStatusContainer: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,245,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0,245,255,0.1)',
  },
  discoveryStatusText: {
    color: '#8899aa',
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  lastIpContainer: {
    marginBottom: 12,
    padding: 10,
    backgroundColor: 'rgba(0,245,255,0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,245,255,0.15)',
  },
  lastIpLabel: {
    color: '#64748b',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  lastIpValue: {
    color: '#00f5ff',
    fontSize: 16,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    marginTop: 2,
  },
  progressContainer: {
    marginTop: 10,
    marginBottom: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#00f5ff',
    borderRadius: 2,
  },
  progressText: {
    color: '#8899aa',
    fontSize: 11,
    fontFamily: 'monospace',
    marginTop: 4,
    textAlign: 'center',
  },
  ngrokButton: {
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.3)',
    marginBottom: 10,
  },
  ngrokButtonText: {
    color: '#a78bfa',
    fontSize: 14,
    fontFamily: 'monospace',
    textAlign: 'center',
    letterSpacing: 1,
  },
  savedUrlContainer: {
    marginTop: 8,
    padding: 10,
    backgroundColor: 'rgba(139,92,246,0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.2)',
  },
  savedUrlText: {
    color: '#a78bfa',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  helpButton: {
    borderRadius: 8,
    overflow: 'hidden',
    marginVertical: 10,
  },
  helpButtonGradient: {
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,245,255,0.2)',
    borderRadius: 8,
  },
  helpButtonText: {
    color: '#00f5ff',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  tipContainer: {
    backgroundColor: 'rgba(255,200,0,0.05)',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#ffcc00',
  },
  tipTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ffcc00',
    marginBottom: 5,
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  tip: {
    fontSize: 12,
    color: '#8899aa',
    marginBottom: 3,
    fontFamily: 'monospace',
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
  },
  footerText: {
    color: 'rgba(0,245,255,0.3)',
    fontSize: 12,
    fontFamily: 'monospace',
    letterSpacing: 3,
  },
  footerSubText: {
    color: 'rgba(0,245,255,0.15)',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 4,
    letterSpacing: 1,
  },
});