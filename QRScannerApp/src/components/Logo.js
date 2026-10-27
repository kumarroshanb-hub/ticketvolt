// QRScannerApp/src/components/Logo.js
//
// Mirrors frontend/src/components/Logo/Logo.js. Renders the official
// brand PNG assets. The PNGs are multi-color, so NEVER apply tintColor.
//
// Requires the assets to exist:
//   QRScannerApp/assets/logo-wordmark.png  ← ticketvolt-logo.png
//   QRScannerApp/assets/logo-mark.png      ← ticketvolt-logomark.png
//
// Copy command (run from repo root):
//   cp frontend/src/assets/logo/ticketvolt-logo.png      QRScannerApp/assets/logo-wordmark.png
//   cp frontend/src/assets/logo/ticketvolt-logomark.png  QRScannerApp/assets/logo-mark.png

import React from 'react';
import { Image, View, StyleSheet } from 'react-native';

const LOGO_FULL = require('../../assets/logo-wordmark.png');
const LOGO_MARK = require('../../assets/logo-mark.png');

/**
 * <Logo /> — brand logo.
 *
 * Props:
 *   variant: 'full' | 'compact' | 'both'
 *   height:  number  — rendered pixel height (default 56)
 *   style:   any     — extra styles applied to the outer container
 */
export const Logo = ({ variant = 'full', height = 56, style }) => {
    if (variant === 'compact') {
        return (
            <Image
                source={LOGO_MARK}
                style={[
                    { height, width: height, resizeMode: 'contain' },
                    style,
                ]}
                accessibilityLabel="TicketVault"
            />
        );
    }

    if (variant === 'both') {
        // Logomark is slightly taller than the wordmark so they optically
        // balance. Gap scales with the mark.
        const markH = height * 1.25;
        const gap = Math.round(markH * 0.35);
        return (
            <View style={[styles.row, { gap }, style]}>
                <Image
                    source={LOGO_MARK}
                    style={{ height: markH, width: markH, resizeMode: 'contain' }}
                    accessibilityLabel="TicketVault"
                />
                <Image
                    source={LOGO_FULL}
                    style={{ height, width: height * 2.4, resizeMode: 'contain' }}
                    accessibilityLabel="TicketVault"
                />
            </View>
        );
    }

    return (
        <Image
            source={LOGO_FULL}
            style={[
                { height, width: height * 2.4, resizeMode: 'contain' },
                style,
            ]}
            accessibilityLabel="TicketVault"
        />
    );
};

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
    },
});

export default Logo;