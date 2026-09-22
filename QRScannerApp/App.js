// QRScannerApp/App.js
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, View, Text, TouchableOpacity, Alert } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/context/AuthContext';
import { initializeApiUrl, setupNetworkListener } from './src/services/api';

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [networkStatus, setNetworkStatus] = useState(null);

  useEffect(() => {
    initializeApp();

    const unsubscribe = setupNetworkListener((newUrl) => {
      console.log('📡 Network change detected, new URL:', newUrl);
      setNetworkStatus('Network changed. Reconnecting...');
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const initializeApp = async () => {
    try {
      console.log('🚀 Initializing app...');

      const netInfo = await NetInfo.fetch();
      setNetworkStatus(netInfo);
      console.log('📶 Initial network:', netInfo);

      if (!netInfo.isConnected) {
        setError('No internet connection. Please check your network.');
        return;
      }

      if (netInfo.type === 'cellular') {
        console.log('📱 Using cellular data — may not reach a local backend');
      }

      await initializeApiUrl();
      console.log('✅ App initialized successfully');
      setError(null);
    } catch (err) {
      console.error('❌ Initialization error:', err);
      setError(err.message || 'Initialization failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const retryConnection = async () => {
    setIsLoading(true);
    setError(null);
    await initializeApp();
  };

  if (isLoading) {
    return (
      <SafeAreaProvider>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#00f5ff" />
          <Text style={styles.loadingText}>Initializing Scanner...</Text>
          {networkStatus?.type && (
            <Text style={styles.networkText}>Network: {networkStatus.type}</Text>
          )}
        </View>
      </SafeAreaProvider>
    );
  }

  if (error) {
    return (
      <SafeAreaProvider>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>⚠️ Connection Error</Text>
          <Text style={styles.errorMessage}>{error}</Text>
          <Text style={styles.errorHint}>
            Please check:{'\n'}
            • Backend is running{'\n'}
            • Phone and computer are on same WiFi{'\n'}
            • IP address in settings is correct
          </Text>
          <View style={styles.errorButtons}>
            <TouchableOpacity style={styles.retryButton} onPress={retryConnection}>
              <Text style={styles.retryButtonText}>🔄 Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.helpButton}
              onPress={() =>
                Alert.alert(
                  '📱 Connection Help',
                  '1. Find your computer IP: ipconfig getifaddr en0\n' +
                  '2. Open the app and go to Settings\n' +
                  '3. Enter: http://YOUR_IP:8000/api\n' +
                  '4. Tap UPDATE\n' +
                  '5. Tap PING SERVER'
                )
              }
            >
              <Text style={styles.helpButtonText}>🆘 Help</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <NavigationContainer>
          <AppNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = {
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0f',
  },
  loadingText: {
    color: '#8899aa',
    marginTop: 20,
    fontFamily: 'monospace',
  },
  networkText: {
    color: '#64748b',
    marginTop: 10,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a0a0f',
    padding: 20,
  },
  errorTitle: {
    color: '#ff0055',
    fontSize: 18,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  errorMessage: {
    color: '#8899aa',
    marginTop: 10,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  errorHint: {
    color: '#64748b',
    marginTop: 20,
    fontFamily: 'monospace',
    textAlign: 'center',
    fontSize: 12,
    lineHeight: 18,
  },
  errorButtons: {
    marginTop: 20,
    flexDirection: 'row',
    gap: 10,
  },
  retryButton: {
    padding: 12,
    backgroundColor: '#4f46e5',
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  retryButtonText: {
    color: 'white',
    fontFamily: 'monospace',
  },
  helpButton: {
    padding: 12,
    backgroundColor: '#1a0a2e',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4f46e5',
    minWidth: 120,
    alignItems: 'center',
  },
  helpButtonText: {
    color: '#00f5ff',
    fontFamily: 'monospace',
  },
};