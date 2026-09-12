// QRScannerApp/src/screens/LoginScreen.js
import React, { useState, useContext, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Easing,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthContext } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { getCurrentApiUrl } from '../services/api';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));
  const [apiUrl, setApiUrl] = useState('');
  const { login } = useContext(AuthContext);
  const navigation = useNavigation();

  useEffect(() => {
    // Get current API URL for display
    const url = getCurrentApiUrl();
    setApiUrl(url);
    console.log('📡 Current API URL:', url);
    
    // Animate
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('⚠️ Input Required', 'Please enter your credentials to continue');
      return;
    }

    setLoading(true);
    try {
      console.log('🔑 Attempting login with:', email);
      console.log('📡 API URL:', getCurrentApiUrl());
      
      const result = await login(email, password);
      
      if (result.success) {
        console.log('✅ Login successful');
        // Navigation handled by AuthContext
      } else {
        Alert.alert('⛔ Authentication Failed', result.error || 'Invalid credentials');
      }
    } catch (error) {
      console.error('❌ Login error:', error);
      Alert.alert('⚠️ System Error', 'Unable to authenticate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSettings = () => {
    navigation.navigate('Settings');
  };

  const fillCredentials = (emailVal, passwordVal) => {
    setEmail(emailVal);
    setPassword(passwordVal);
    Alert.alert('✅ Credentials Loaded', `Email: ${emailVal}\nPassword: ${passwordVal}`);
  };

  return (
    <LinearGradient colors={['#0a0a0f', '#1a0a2e', '#0a0a0f']} style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
            
            {/* Top Bar with Settings Button */}
            <View style={styles.topBar}>
              <View style={styles.topBarLeft}>
                <Text style={styles.apiUrlText}>📡 {apiUrl}</Text>
              </View>
              <TouchableOpacity
                style={styles.settingsIcon}
                onPress={handleSettings}
              >
                <Text style={styles.settingsIconText}>⚙️</Text>
              </TouchableOpacity>
            </View>

            {/* Logo / Header */}
            <View style={styles.header}>
              <Text style={styles.logoIcon}>⚡</Text>
              <Text style={styles.title}>TICKETVOLT</Text>
              <Text style={styles.subtitle}>SECURE AUTHENTICATION</Text>
              <View style={styles.divider} />
            </View>

            {/* Futuristic Decorative Lines */}
            <View style={styles.decorationContainer}>
              <View style={styles.decorationLine} />
              <View style={styles.decorationDot} />
              <View style={styles.decorationLine} />
            </View>

            {/* Login Form */}
            <View style={styles.form}>
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>USER ID</Text>
                <TextInput
                  style={styles.input}
                  placeholder="user@domain.com"
                  placeholderTextColor="rgba(136,153,170,0.5)"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!loading}
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>PASSWORD</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor="rgba(136,153,170,0.5)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  editable={!loading}
                />
              </View>

              <TouchableOpacity
                style={styles.loginButton}
                onPress={handleLogin}
                disabled={loading}
              >
                <LinearGradient
                  colors={['#00f5ff', '#0066ff']}
                  style={styles.loginButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  {loading ? (
                    <ActivityIndicator color="#0a0a0f" size="small" />
                  ) : (
                    <Text style={styles.loginButtonText}>AUTHENTICATE</Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>

              {/* Settings Button */}
              <TouchableOpacity
                style={styles.settingsButton}
                onPress={handleSettings}
              >
                <LinearGradient
                  colors={['rgba(0,245,255,0.15)', 'rgba(0,102,255,0.15)']}
                  style={styles.settingsButtonGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.settingsButtonText}>⚙️ SETTINGS</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Demo Credentials */}
            <View style={styles.demoContainer}>
              <Text style={styles.demoTitle}>QUICK LOGIN</Text>
              
              <TouchableOpacity
                style={styles.demoButton}
                onPress={() => fillCredentials('admin@ticketvolt.com', 'REDACTED')}
              >
                <Text style={styles.demoButtonText}>🛡️ Admin</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.demoButton}
                onPress={() => fillCredentials('organizer@ticketvolt.com', 'REDACTED')}
              >
                <Text style={styles.demoButtonText}>📋 Organizer</Text>
              </TouchableOpacity>
            </View>

            {/* Status Indicators */}
            <View style={styles.statusContainer}>
              <View style={styles.statusItem}>
                <View style={[styles.statusDot, styles.statusDotSecure]} />
                <Text style={styles.statusLabel}>Secure Connection</Text>
              </View>
              <View style={styles.statusItem}>
                <View style={[styles.statusDot, styles.statusDotActive]} />
                <Text style={styles.statusLabel}>System Online</Text>
              </View>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>⚡ TICKETVOLT v1.0</Text>
              <Text style={styles.footerSubText}>SDK 57 • Smart IP Discovery</Text>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 30,
    paddingBottom: 20,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 10,
  },
  topBarLeft: {
    flex: 1,
  },
  apiUrlText: {
    color: '#8899aa',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  settingsIcon: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,245,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,245,255,0.2)',
    marginLeft: 10,
  },
  settingsIconText: {
    fontSize: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logoIcon: {
    fontSize: 48,
    marginBottom: 10,
    textShadowColor: '#00f5ff',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#00f5ff',
    fontFamily: 'monospace',
    textShadowColor: '#00f5ff',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 12,
    color: '#8899aa',
    fontFamily: 'monospace',
    letterSpacing: 3,
    marginTop: 5,
  },
  divider: {
    width: 60,
    height: 2,
    backgroundColor: 'rgba(0,245,255,0.3)',
    marginTop: 15,
  },
  decorationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  decorationLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(0,245,255,0.1)',
  },
  decorationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#00f5ff',
    marginHorizontal: 10,
    shadowColor: '#00f5ff',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 10,
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    color: '#8899aa',
    fontSize: 11,
    fontFamily: 'monospace',
    letterSpacing: 2,
    marginBottom: 6,
  },
  input: {
    backgroundColor: 'rgba(10,10,15,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(0,245,255,0.15)',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: '#ffffff',
    fontFamily: 'monospace',
  },
  loginButton: {
    marginTop: 10,
    borderRadius: 8,
    overflow: 'hidden',
  },
  loginButtonGradient: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#0a0a0f',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'monospace',
    letterSpacing: 3,
  },
  settingsButton: {
    marginTop: 10,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,245,255,0.3)',
  },
  settingsButtonGradient: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  settingsButtonText: {
    color: '#00f5ff',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'monospace',
    letterSpacing: 2,
  },
  demoContainer: {
    marginTop: 25,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,245,255,0.1)',
  },
  demoTitle: {
    color: '#8899aa',
    fontSize: 11,
    fontFamily: 'monospace',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 10,
  },
  demoButton: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(0,245,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(0,245,255,0.1)',
    marginBottom: 8,
  },
  demoButtonText: {
    color: '#00f5ff',
    fontSize: 14,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
    gap: 20,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusDotSecure: {
    backgroundColor: '#00f5ff',
    shadowColor: '#00f5ff',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 5,
  },
  statusDotActive: {
    backgroundColor: '#00ff88',
    shadowColor: '#00ff88',
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 5,
  },
  statusLabel: {
    color: '#8899aa',
    fontSize: 10,
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  footer: {
    marginTop: 40,
    alignItems: 'center',
  },
  footerText: {
    color: 'rgba(0,245,255,0.2)',
    fontSize: 10,
    fontFamily: 'monospace',
    letterSpacing: 4,
  },
  footerSubText: {
    color: 'rgba(0,245,255,0.1)',
    fontSize: 8,
    fontFamily: 'monospace',
    marginTop: 4,
    letterSpacing: 1,
  },
});