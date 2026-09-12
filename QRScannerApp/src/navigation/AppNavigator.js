// QRScannerApp/src/navigation/AppNavigator.js
import React, { useContext } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { AuthContext } from '../context/AuthContext';

// Import screens
import LoginScreen from '../screens/LoginScreen';
import ScannerScreen from '../screens/ScannerScreen';
import SettingsScreen from '../screens/SettingsScreen';
import HistoryScreen from '../screens/HistoryScreen';

const Stack = createStackNavigator();

export default function AppNavigator() {
  const { user, isLoading } = useContext(AuthContext);

  if (isLoading) {
    return null;
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: '#000' },
      }}
    >
      {!user ? (
        <>
          {/* ✅ Login Screen */}
          <Stack.Screen name="Login" component={LoginScreen} />
          
          {/* ✅ Settings accessible BEFORE login */}
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              headerShown: true,
              headerTitle: '⚙️ Settings',
              headerStyle: {
                backgroundColor: '#1a1a2e',
              },
              headerTitleStyle: {
                color: 'white',
                fontSize: 18,
                fontWeight: '600',
              },
              headerTintColor: '#00f5ff',
              headerBackTitle: 'Back',
              presentation: 'modal',
            }}
          />
        </>
      ) : (
        <>
          {/* ✅ Scanner Screen */}
          <Stack.Screen name="Scanner" component={ScannerScreen} />
          
          {/* ✅ Settings accessible AFTER login */}
          <Stack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              headerShown: true,
              headerTitle: '⚙️ Settings',
              headerStyle: {
                backgroundColor: '#1a1a2e',
              },
              headerTitleStyle: {
                color: 'white',
                fontSize: 18,
                fontWeight: '600',
              },
              headerTintColor: '#00f5ff',
              headerBackTitle: 'Back',
              presentation: 'modal',
            }}
          />
          
          {/* ✅ History Screen */}
          <Stack.Screen
            name="History"
            component={HistoryScreen}
            options={{
              headerShown: true,
              headerTitle: '📋 History',
              headerStyle: {
                backgroundColor: '#1a1a2e',
              },
              headerTitleStyle: {
                color: 'white',
                fontSize: 18,
                fontWeight: '600',
              },
              headerTintColor: '#00f5ff',
              headerBackTitle: 'Back',
            }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}