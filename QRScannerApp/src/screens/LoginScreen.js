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
import Constants from 'expo-constants';
import { AuthContext } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import { getCurrentApiUrl } from '../services/api';
import { theme } from '../theme';
import { Logo } from '../components/Logo';

const C = theme.colors;
const F = theme.fonts;

// ============================================================
// Demo credentials — loaded from app.config.js `extra`.
//
// SECURITY (unchanged):
//   • app.config.js sets `showDemoCreds` from SHOW_DEMO_CREDS,
//     which must be UNSET in production EAS builds.
//   • In production, `showDemoCreds` is false and this block is
//     never rendered. No production password ships in the bundle.
// ============================================================
const {
    showDemoCreds,
    demoAdminEmail,
    demoAdminPassword,
    demoOrganizerEmail,
    demoOrganizerPassword,
    demoUserEmail,
    demoUserPassword,
} = Constants.expoConfig?.extra ?? {};

const DEMO_CREDS = showDemoCreds
    ? [
          {
              key: 'admin',
              label: '🛡️ Admin',
              email: demoAdminEmail,
              password: demoAdminPassword,
          },
          {
              key: 'organizer',
              label: '📋 Organizer',
              email: demoOrganizerEmail,
              password: demoOrganizerPassword,
          },
          {
              key: 'user',
              label: '👤 User',
              email: demoUserEmail,
              password: demoUserPassword,
          },
      ].filter((c) => c.email && c.password)
    : [];

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [fadeAnim] = useState(new Animated.Value(0));
    const [apiUrl, setApiUrl] = useState('');
    const { login } = useContext(AuthContext);
    const navigation = useNavigation();

    useEffect(() => {
        const url = getCurrentApiUrl();
        setApiUrl(url);
        console.log('📡 Current API URL:', url);

        Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 600,
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
        Alert.alert('✅ Credentials Loaded', `Email: ${emailVal}`);
    };

    return (
        <View style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <Animated.View style={[styles.content, { opacity: fadeAnim }]}>

                        {/* Top Bar with Settings Button */}
                        <View style={styles.topBar}>
                            <View style={styles.topBarLeft}>
                                <Text style={styles.apiUrlText} numberOfLines={1}>
                                    📡 {apiUrl}
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={styles.settingsIcon}
                                onPress={handleSettings}
                                accessibilityLabel="Open settings"
                            >
                                <Text style={styles.settingsIconText}>⚙️</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Logo / Header */}
                        <View style={styles.header}>
                            <Logo variant="full" height={80} style={styles.brandLogo} />
                            <Text style={styles.subtitle}>SECURE AUTHENTICATION</Text>
                            <View style={styles.divider} />
                        </View>

                        {/* Login Form */}
                        <View style={styles.form}>
                            <View style={styles.inputContainer}>
                                <Text style={styles.inputLabel}>USER ID</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="user@domain.com"
                                    placeholderTextColor={C.textDisabled}
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
                                    placeholderTextColor={C.textDisabled}
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry
                                    editable={!loading}
                                />
                            </View>

                            <TouchableOpacity
                                style={[styles.loginButton, loading && styles.loginButtonDisabled]}
                                onPress={handleLogin}
                                disabled={loading}
                                accessibilityLabel="Sign in"
                            >
                                {loading ? (
                                    <ActivityIndicator color={C.textInverse} size="small" />
                                ) : (
                                    <Text style={styles.loginButtonText}>SIGN IN</Text>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.settingsButton}
                                onPress={handleSettings}
                                accessibilityLabel="Open settings"
                            >
                                <Text style={styles.settingsButtonText}>⚙️ SETTINGS</Text>
                            </TouchableOpacity>
                        </View>

                        {/* ============================================================
                            DEMO CREDENTIALS — rendered ONLY when DEMO_CREDS
                            is populated. In production builds: SHOW_DEMO_CREDS
                            is unset → showDemoCreds is false → DEMO_CREDS is
                            an empty array → this entire block is skipped.
                        ============================================================ */}
                        {DEMO_CREDS.length > 0 && (
                            <View style={styles.demoContainer}>
                                <Text style={styles.demoTitle}>QUICK LOGIN (DEV ONLY)</Text>
                                {DEMO_CREDS.map((cred) => (
                                    <TouchableOpacity
                                        key={cred.key}
                                        style={styles.demoButton}
                                        onPress={() => fillCredentials(cred.email, cred.password)}
                                    >
                                        <Text style={styles.demoButtonText}>{cred.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}

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
                            <Text style={styles.footerText}>⚡ TICKETVAULT v1.0</Text>
                            <Text style={styles.footerSubText}>Smart IP Discovery</Text>
                        </View>
                    </Animated.View>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: C.bgDark,
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
        marginRight: 10,
    },
    apiUrlText: {
        color: C.textLight,
        fontSize: 10,
        fontFamily: F.familyMono,
    },
    settingsIcon: {
        padding: 10,
        borderRadius: theme.radius.sm,
        backgroundColor: C.bgDarkCard,
        borderWidth: 1,
        borderColor: C.bgDarkBorder,
        marginLeft: 10,
    },
    settingsIconText: {
        fontSize: 20,
    },
    header: {
        alignItems: 'center',
        marginBottom: 30,
    },
    brandLogo: {
        marginBottom: 16,
    },
    subtitle: {
        fontSize: 12,
        color: C.textMuted,
        fontFamily: F.familySemiBold,
        letterSpacing: 3,
        marginTop: 5,
    },
    divider: {
        width: 60,
        height: 2,
        backgroundColor: C.secondary,
        marginTop: 15,
    },
    form: {
        width: '100%',
    },
    inputContainer: {
        marginBottom: 20,
    },
    inputLabel: {
        color: C.textMuted,
        fontSize: 11,
        fontFamily: F.familySemiBold,
        letterSpacing: 2,
        marginBottom: 6,
    },
    input: {
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderWidth: 1,
        borderColor: C.bgDarkBorder,
        borderRadius: theme.radius.sm,
        padding: 14,
        fontSize: 16,
        color: C.textInverse,
        fontFamily: F.family,
    },
    loginButton: {
        marginTop: 10,
        borderRadius: theme.radius.sm,
        backgroundColor: C.secondary,
        paddingVertical: 16,
        alignItems: 'center',
        ...theme.shadows.button,
    },
    loginButtonDisabled: {
        opacity: 0.6,
    },
    loginButtonText: {
        color: C.textInverse,
        fontSize: 16,
        fontFamily: F.familyBold,
        letterSpacing: 3,
    },
    settingsButton: {
        marginTop: 10,
        borderRadius: theme.radius.sm,
        paddingVertical: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: C.bgDarkBorder,
        backgroundColor: C.bgDarkCard,
    },
    settingsButtonText: {
        color: C.textInverse,
        fontSize: 14,
        fontFamily: F.familySemiBold,
        letterSpacing: 2,
    },
    demoContainer: {
        marginTop: 25,
        paddingTop: 15,
        borderTopWidth: 1,
        borderTopColor: C.bgDarkBorder,
    },
    demoTitle: {
        color: C.textMuted,
        fontSize: 11,
        fontFamily: F.familySemiBold,
        letterSpacing: 2,
        textAlign: 'center',
        marginBottom: 10,
    },
    demoButton: {
        padding: 10,
        borderRadius: theme.radius.sm,
        backgroundColor: C.bgDarkCard,
        borderWidth: 1,
        borderColor: C.bgDarkBorder,
        marginBottom: 8,
    },
    demoButtonText: {
        color: C.textInverse,
        fontSize: 14,
        fontFamily: F.family,
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
        backgroundColor: C.success,
    },
    statusDotActive: {
        backgroundColor: C.secondary,
    },
    statusLabel: {
        color: C.textMuted,
        fontSize: 10,
        fontFamily: F.family,
        letterSpacing: 1,
    },
    footer: {
        marginTop: 40,
        alignItems: 'center',
    },
    footerText: {
        color: C.textLight,
        fontSize: 10,
        fontFamily: F.familySemiBold,
        letterSpacing: 4,
    },
    footerSubText: {
        color: C.textDisabled,
        fontSize: 8,
        fontFamily: F.family,
        marginTop: 4,
        letterSpacing: 1,
    },
});