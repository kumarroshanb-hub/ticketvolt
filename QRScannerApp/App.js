import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, View, Text, Alert } from 'react-native';
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
    
    // Setup network monitoring
    const unsubscribe = setupNetworkListener((newUrl) => {
      console.log('📡 Network change detected, new URL:', newUrl);
      setNetworkStatus('Network changed. Reconnecting...');
      // Refresh the app state if needed
    });
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const initializeApp = async () => {
    try {
      console.log('🚀 Initializing app...');
      
      // Check network status
      const netInfo = await NetInfo.fetch();
      setNetworkStatus(netInfo);
      console.log('📶 Initial network:', netInfo);
      
      if (!netInfo.isConnected) {
        setError('No internet connection. Please check your network.');
        setIsLoading(false);
        return;
      }
      
      if (netInfo.type === 'cellular') {
        console.log('📱 Using cellular data - may not reach local backend');
        // Show warning but continue
      }
      
      await initializeApiUrl();
      console.log('✅ App initialized successfully');
    } catch (error) {
      console.error('❌ Initialization error:', error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const retryConnection = () => {
    setIsLoading(true);
    setError(null);
    initializeApp();
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0f' }}>
        <ActivityIndicator size="large" color="#00f5ff" />
        <Text style={{ color: '#8899aa', marginTop: 20, fontFamily: 'monospace' }}>
          Initializing Scanner...
        </Text>
        {networkStatus && (
          <Text style={{ color: '#64748b', marginTop: 10, fontFamily: 'monospace', fontSize: 12 }}>
            Network: {networkStatus.type}
          </Text>
        )}
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center', 
        backgroundColor: '#0a0a0f', 
        padding: 20 
      }}>
        <Text style={{ color: '#ff0055', fontSize: 18, fontFamily: 'monospace', textAlign: 'center' }}>
          ⚠️ Connection Error
        </Text>
        <Text style={{ color: '#8899aa', marginTop: 10, fontFamily: 'monospace', textAlign: 'center' }}>
          {error}
        </Text>
        <Text style={{ color: '#64748b', marginTop: 20, fontFamily: 'monospace', textAlign: 'center', fontSize: 12 }}>
          Please check:\n• Backend is running\n• Phone and computer are on same WiFi\n• IP address in settings is correct
        </Text>
        <View style={{ marginTop: 20, flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity 
            style={{ 
              padding: 12, 
              backgroundColor: '#4f46e5', 
              borderRadius: 8, 
              minWidth: 120,
              alignItems: 'center'
            }}
            onPress={retryConnection}
          >
            <Text style={{ color: 'white', fontFamily: 'monospace' }}>🔄 Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={{ 
              padding: 12, 
              backgroundColor: '#1a0a2e', 
              borderRadius: 8, 
              borderWidth: 1,
              borderColor: '#4f46e5',
              minWidth: 120,
              alignItems: 'center'
            }}
            onPress={() => {
              // Navigate to settings or show help
              Alert.alert(
                '📱 Connection Help',
                '1. Find your computer IP: ipconfig getifaddr en0\n' +
                '2. Go to Settings in the app\n' +
                '3. Enter: http://YOUR_IP:8000/api\n' +
                '4. Tap UPDATE\n' +
                '5. Tap PING SERVER'
              );
            }}
          >
            <Text style={{ color: '#00f5ff', fontFamily: 'monospace' }}>🆘 Help</Text>
          </TouchableOpacity>
        </View>
      </View>
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

// Add TouchableOpacity import
import { TouchableOpacity } from 'react-native';