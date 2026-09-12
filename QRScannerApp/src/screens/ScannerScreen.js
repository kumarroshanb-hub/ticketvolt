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
    }, 16); // ~60fps
  };

  const loadStats = async () => {
    try {
      const response = await scannerApi.getStats();
      if (response.data) {
        setScanCount(response.data.today_checkins || 0);
      }
    } catch (error) {
      console.log('Stats not available');
    }
  };

  const extractTicketCode = (data) => {
    console.log('📸 Raw QR data type:', typeof data);
    console.log('📸 Raw QR data:', data);
    
    if (typeof data === 'string') {
      const trimmed = data.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed);
          console.log('📸 Parsed JSON:', parsed);
          const code = parsed.code || parsed.ticket_id || parsed.unique_code || parsed.ticketCode;
          if (code) {
            console.log('📸 Extracted code from JSON:', code);
            return String(code);
          }
          const tixMatch = trimmed.match(/TIX[A-Z0-9]+/);
          if (tixMatch) {
            console.log('📸 Extracted TIX from JSON string:', tixMatch[0]);
            return tixMatch[0];
          }
          return trimmed;
        } catch (e) {
          console.log('📸 Failed to parse JSON, treating as string');
        }
      }
      const tixMatch = data.match(/TIX[A-Z0-9]+/);
      if (tixMatch) {
        console.log('📸 Extracted TIX from string:', tixMatch[0]);
        return tixMatch[0];
      }
      return data;
    }
    
    if (typeof data === 'object' && data !== null) {
      console.log('📸 Data is an object');
      const code = data.code || data.ticket_id || data.unique_code || data.ticketCode;
      if (code) {
        console.log('📸 Extracted code from object:', code);
        return String(code);
      }
      if (data.data && typeof data.data === 'object') {
        const nestedCode = data.data.code || data.data.ticket_id;
        if (nestedCode) {
          console.log('📸 Extracted nested code:', nestedCode);
          return String(nestedCode);
        }
      }
      const jsonStr = JSON.stringify(data);
      const tixMatch = jsonStr.match(/TIX[A-Z0-9]+/);
      if (tixMatch) {
        console.log('📸 Extracted TIX from object string:', tixMatch[0]);
        return tixMatch[0];
      }
      return JSON.stringify(data);
    }
    
    return String(data);
  };

  const handleBarcodeScanned = async ({ type, data }) => {
    if (scanned || loading) return;
    
    setScanned(true);
    setLoading(true);
    setStatusText('🔍 Decrypting payload...');

    try {
      const ticketCode = extractTicketCode(data);
      console.log('✅ Final ticket code:', ticketCode);
      
      if (!ticketCode || (typeof ticketCode === 'string' && !ticketCode.startsWith('TIX') && ticketCode.length < 5)) {
        console.log('⚠️ Invalid ticket code format:', ticketCode);
        setStatusText('❌ Invalid Credential');
        Alert.alert(
          '⛔ Invalid Credential',
          'The scanned QR code does not contain a valid ticket code.',
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
      const verifyResponse = await scannerApi.verify(ticketCode);
      
      if (verifyResponse.data) {
        const ticketData = verifyResponse.data;
        console.log('✅ Verify result:', ticketData);
        
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
                onPress: () => performCheckin(ticketCode, ticketData)
              },
              { text: 'Cancel', style: 'cancel', onPress: () => setScanned(false) }
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

  const performCheckin = async (ticketCode, ticketData) => {
    setLoading(true);
    setStatusText('⚡ Authenticating...');
    
    try {
      console.log('📤 Checking in ticket:', ticketCode);
      const response = await scannerApi.checkin(ticketCode);
      
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
          }
        }
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
      {/* Futuristic Header */}
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

      {/* Camera View with Futuristic Overlay */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
      />

      {/* Futuristic Scan Overlay */}
      <View style={styles.overlay}>
        <View style={styles.scanFrame}>
          {/* Animated Scan Line - using state for position */}
          <View
            style={[
              styles.scanLine,
              { transform: [{ translateY: scanLinePosition }] }
            ]}
          >
            <LinearGradient
              colors={['transparent', '#00f5ff', '#0066ff', '#00f5ff', 'transparent']}
              style={styles.scanLineGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            />
          </View>
          
          {/* Corner Decorations */}
          <View style={[styles.corner, styles.cornerTL]} />
          <View style={[styles.corner, styles.cornerTR]} />
          <View style={[styles.corner, styles.cornerBL]} />
          <View style={[styles.corner, styles.cornerBR]} />
          
          {/* Corner Glow Effects */}
          <View style={[styles.cornerGlow, styles.cornerGlowTL]} />
          <View style={[styles.cornerGlow, styles.cornerGlowTR]} />
          <View style={[styles.cornerGlow, styles.cornerGlowBL]} />
          <View style={[styles.cornerGlow, styles.cornerGlowBR]} />
        </View>
        
        {/* Status Text with Glow */}
        <View style={styles.statusContainer}>
          <Text style={styles.scanText}>
            {loading ? (
              <Text style={styles.loadingText}>
                ⚡ {statusText}
              </Text>
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

      {/* Reset Button */}
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
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  futuristicText: {
    color: '#00f5ff',
    fontSize: 20,
    fontFamily: 'monospace',
    textShadowColor: '#00f5ff',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  futuristicWarningText: {
    color: '#ff0055',
    fontSize: 24,
    fontFamily: 'monospace',
    textShadowColor: '#ff0055',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 30,
    marginBottom: 10,
  },
  futuristicSubText: {
    color: '#8899aa',
    fontSize: 16,
    fontFamily: 'monospace',
    marginBottom: 30,
  },
  spinner: {
    marginTop: 20,
  },
  grantButton: {
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 20,
  },
  grantButtonGradient: {
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 8,
  },
  grantButtonText: {
    color: '#0a0a0f',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  header: {
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,245,255,0.2)',
    position: 'relative',
    zIndex: 10,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#00f5ff',
    fontFamily: 'monospace',
    textShadowColor: '#00f5ff',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
    letterSpacing: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    marginLeft: 15,
    padding: 5,
  },
  iconText: {
    fontSize: 20,
    opacity: 0.8,
  },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,245,255,0.1)',
  },
  statsText: {
    color: '#00f5ff',
    fontSize: 12,
    fontFamily: 'monospace',
    opacity: 0.7,
    letterSpacing: 1,
  },
  statusDot: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
    shadowColor: '#00f5ff',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  scanFrame: {
    width: 280,
    height: 280,
    position: 'relative',
  },
  scanLine: {
    position: 'absolute',
    left: -20,
    right: -20,
    height: 3,
    top: 0,
    zIndex: 5,
  },
  scanLineGradient: {
    flex: 1,
    height: 3,
    shadowColor: '#00f5ff',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#00f5ff',
    borderWidth: 2,
    shadowColor: '#00f5ff',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 15,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  cornerGlow: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderColor: 'rgba(0,245,255,0.1)',
    borderWidth: 1,
  },
  cornerGlowTL: {
    top: -15,
    left: -15,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  cornerGlowTR: {
    top: -15,
    right: -15,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  cornerGlowBL: {
    bottom: -15,
    left: -15,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  cornerGlowBR: {
    bottom: -15,
    right: -15,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  statusContainer: {
    marginTop: 30,
    alignItems: 'center',
  },
  scanText: {
    color: 'white',
    fontSize: 16,
    backgroundColor: 'rgba(10,10,15,0.8)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,245,255,0.3)',
    fontFamily: 'monospace',
    textAlign: 'center',
    shadowColor: '#00f5ff',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
  },
  loadingText: {
    color: '#00f5ff',
  },
  loadingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 10,
  },
  loadingSubText: {
    color: '#8899aa',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  resetButton: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    borderRadius: 25,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,245,255,0.3)',
  },
  resetButtonGradient: {
    paddingHorizontal: 30,
    paddingVertical: 12,
  },
  resetButtonText: {
    color: '#00f5ff',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
});