// QRScannerApp/src/navigation/AppNavigator.js
import React, { useContext } from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { AuthContext } from '../context/AuthContext';
import { theme } from '../theme';

// Import screens
import LoginScreen from '../screens/LoginScreen';
import ScannerScreen from '../screens/ScannerScreen';
import SettingsScreen from '../screens/SettingsScreen';
import HistoryScreen from '../screens/HistoryScreen';

const C = theme.colors;
const F = theme.fonts;

const Stack = createStackNavigator();

// Shared header options — defined once so the Settings and History
// chrome can never drift apart again.
const modalHeader = (title, { presentation } = {}) => ({
  headerShown: true,
  headerTitle: title,
  headerStyle: {
    backgroundColor: C.bgDarkCard,
  },
  headerTitleStyle: {
    color: C.textInverse,
    fontSize: 18,
    fontFamily: F.familySemiBold,
  },
  headerTintColor: C.secondary,
  headerBackTitle: 'Back',
  ...(presentation ? { presentation } : {}),
});

export default function AppNavigator() {
  const { user, isLoading } = useContext(AuthContext);

  if (isLoading) {
    return null;
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: C.bgDark },
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
            options={modalHeader('⚙️ Settings', { presentation: 'modal' })}
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
            options={modalHeader('⚙️ Settings', { presentation: 'modal' })}
          />

          {/* ✅ History Screen */}
          <Stack.Screen
            name="History"
            component={HistoryScreen}
            options={modalHeader('📋 History')}
          />
        </>
      )}
    </Stack.Navigator>
  );
}