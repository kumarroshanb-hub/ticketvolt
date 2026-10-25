// QRScannerApp/App.js
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, View, Text, TouchableOpacity, Alert, StyleSheet } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

// Brand fonts — must be loaded before any screen renders.
import {
    useFonts,
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
} from '@expo-google-fonts/montserrat';

import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/context/AuthContext';
import { initializeApiUrl, setupNetworkListener } from './src/services/api';
import { theme } from './src/theme';

const C = theme.colors;
const F = theme.fonts;

export default function App() {
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [networkStatus, setNetworkStatus] = useState(null);

    const [fontsLoaded] = useFonts({
        Montserrat_400Regular,
        Montserrat_500Medium,
        Montserrat_600SemiBold,
        Montserrat_700Bold,
        Montserrat_800ExtraBold,
    });

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

    // Gate on BOTH fonts and API init. Fonts loading is fast; showing
    // the spinner until both are ready avoids a flash of system font.
    if (!fontsLoaded || isLoading) {
        return (
            <SafeAreaProvider>
                <View style={styles.center}>
                    <ActivityIndicator size="large" color={C.secondary} />
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

const styles = StyleSheet.create({
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: C.bgDark,
    },
    loadingText: {
        color: C.textMuted,
        marginTop: 20,
        fontFamily: F.family,
    },
    networkText: {
        color: C.textLight,
        marginTop: 10,
        fontFamily: F.familyMono,
        fontSize: 12,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: C.bgDark,
        padding: 20,
    },
    errorTitle: {
        color: C.error,
        fontSize: 18,
        fontFamily: F.familyBold,
        textAlign: 'center',
    },
    errorMessage: {
        color: C.textMuted,
        marginTop: 10,
        fontFamily: F.family,
        textAlign: 'center',
    },
    errorHint: {
        color: C.textLight,
        marginTop: 20,
        fontFamily: F.family,
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
        backgroundColor: C.secondary,
        borderRadius: theme.radius.sm,
        minWidth: 120,
        alignItems: 'center',
    },
    retryButtonText: {
        color: C.textInverse,
        fontFamily: F.familySemiBold,
    },
    helpButton: {
        padding: 12,
        backgroundColor: C.bgDarkCard,
        borderRadius: theme.radius.sm,
        borderWidth: 1,
        borderColor: C.bgDarkBorder,
        minWidth: 120,
        alignItems: 'center',
    },
    helpButtonText: {
        color: C.textInverse,
        fontFamily: F.familySemiBold,
    },
});