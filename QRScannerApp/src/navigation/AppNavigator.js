// QRScannerApp/src/navigation/AppNavigator.js
import React, { useContext, useEffect } from 'react';  // UPDATED: added useEffect
import { createStackNavigator } from '@react-navigation/stack';
import { Alert } from 'react-native';                   // ADDED FOR 6-TIER HIERARCHY
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

// ADDED FOR 6-TIER HIERARCHY: roles permitted to operate the scanner.
// Members and Guests (regular users) must NOT be able to check in tickets.
const SCANNER_AUTHORIZED_ROLES = ['super_admin', 'owner', 'admin', 'staff'];

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
  const { user, isLoading, logout } = useContext(AuthContext);  // UPDATED: destructure logout

  // ADDED FOR 6-TIER HIERARCHY: derive authorization from the user's role.
  // A logged-in user whose role is not in SCANNER_AUTHORIZED_ROLES is treated
  // as unauthorized and bounced back to the Login screen with a clear message.
  const isAuthorized = Boolean(user) && SCANNER_AUTHORIZED_ROLES.includes(user.role);

  // ADDED FOR 6-TIER HIERARCHY: if a previously-authorized user has their role
  // downgraded server-side (e.g. removed from an org, demoted from staff),
  // force-logout on next app open so they cannot reach the Scanner screen.
  useEffect(() => {
    if (!isLoading && user && !isAuthorized) {
      Alert.alert(
        'Access Restricted',
        'Your account does not have permission to use the scanner. ' +
        'Only Owners, Admins, and Staff can check in tickets. ' +
        'You will be signed out.',
        [
          {
            text: 'OK',
            onPress: () => {
              logout().catch((err) =>
                console.error('Auto-logout failed:', err)
              );
            },
          },
        ],
        { cancelable: false }
      );
    }
  }, [isLoading, user, isAuthorized, logout]);

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
      {/* UPDATED FOR 6-TIER HIERARCHY: gate on isAuthorized instead of !user.
          Unauthorized logged-in users fall through to the Login branch,
          where the useEffect above will sign them out. */}
      {!isAuthorized ? (
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