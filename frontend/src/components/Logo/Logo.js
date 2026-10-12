// frontend/src/components/Logo/Logo.js
//
// Single source of truth for rendering the TiKetVault logo.
//
// Replaces inline logo rendering that was duplicated across:
//   • components/Sidebar/Sidebar.js
//   • pages/Login/Login.js
//   • components/Ticket/E-Ticket.js
//
// Variants:
//   • "full"     — full wordmark "TiKetVault" with red 'K'
//   • "compact"  — icon-only logomark (ticket shape with TK)
//   • "both"     — logomark + wordmark side-by-side
//
// All colors come from theme tokens. No hardcoded hex values.
//
// `inverse` prop swaps charcoal → white for use on dark/gradient
// backgrounds (Login page, E-Ticket header).

import React from 'react';
import styled, { css } from 'styled-components';
import { theme } from '../../theme/tokens';

const C = theme.colors;
const F = theme.fonts;

// ============================================================
// FULL WORDMARK — "TiKetVault" with red 'K'
// ============================================================

const FullLogoWrap = styled.span`
    display: inline-flex;
    align-items: baseline;
    font-family: ${F.family};
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1;
    white-space: nowrap;
    user-select: none;

    /* Size is driven by font-size prop → scales everything */
    font-size: ${props => props.$size}px;

    /* Charcoal by default; white when on a dark background */
    color: ${props => (props.$inverse ? C.textInverse : C.primary)};

    /* Optional: hide when sidebar is collapsed */
    ${props => props.$hidden && css`display: none;`}
`;

const RedK = styled.span`
    color: ${C.secondary};
`;

export const FullLogo = ({ size = 20, hidden = false, inverse = false, className = '' }) => (
    <FullLogoWrap $size={size} $hidden={hidden} $inverse={inverse} className={className}>
        Ti<RedK>K</RedK>etVault
    </FullLogoWrap>
);

// ============================================================
// COMPACT LOGOMARK — charcoal ticket badge with "TK"
// ============================================================

const MarkWrap = styled.span`
    display: inline-flex;
    align-items: center;
    justify-content: center;

    width: ${props => props.$size}px;
    height: ${props => props.$size}px;
    min-width: ${props => props.$size}px;

    background: ${props => (props.$inverse ? 'rgba(255, 255, 255, 0.2)' : C.primary)};
    border-radius: ${props => Math.round(props.$size * 0.18)}px;

    font-family: ${F.family};
    font-weight: 800;
    font-size: ${props => Math.round(props.$size * 0.5)}px;
    letter-spacing: -0.03em;
    line-height: 1;
    color: ${C.textInverse};
    user-select: none;

    /* Two concave notches on the left & right to mimic the ticket silhouette */
    position: relative;
    overflow: hidden;
    box-shadow: ${props => (props.$inverse ? 'none' : theme.shadows.card)};

    &::before,
    &::after {
        content: '';
        position: absolute;
        width: ${props => Math.round(props.$size * 0.18)}px;
        height: ${props => Math.round(props.$size * 0.18)}px;
        border-radius: 50%;
        top: 50%;
        transform: translateY(-50%);
        background: ${props => (props.$inverse ? C.primaryGradient : C.bgPrimary)};
    }

    &::before { left: -${props => Math.round(props.$size * 0.09)}px; }
    &::after  { right: -${props => Math.round(props.$size * 0.09)}px; }
`;

const MarkRedK = styled.span`
    color: ${C.secondary};
    margin-left: -0.04em;
`;

export const CompactLogo = ({ size = 40, inverse = false, className = '' }) => (
    <MarkWrap $size={size} $inverse={inverse} className={className} aria-label="TiKetVault">
        T<MarkRedK>K</MarkRedK>
    </MarkWrap>
);

// ============================================================
// DEFAULT EXPORT — the most common case
// ============================================================

/**
 * <Logo /> — full wordmark by default.
 *
 * Props:
 *   variant: 'full' | 'compact' | 'both'
 *     - 'full'    → renders only the wordmark
 *     - 'compact' → renders only the logomark
 *     - 'both'    → renders logomark + wordmark side-by-side
 *
 *   size: number — controls overall scale (font-size baseline)
 *   hidden: boolean — hides the wordmark (used by collapsed sidebar)
 *   inverse: boolean — white text + translucent bg (for dark surfaces)
 */
const Logo = ({
    variant = 'full',
    size = 20,
    hidden = false,
    inverse = false,
    className = '',
    ...rest
}) => {
    if (variant === 'compact') {
        return (
            <CompactLogo
                size={size * 2}
                inverse={inverse}
                className={className}
                {...rest}
            />
        );
    }

    if (variant === 'both') {
        return (
            <span
                className={className}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: size * 0.6,
                }}
                {...rest}
            >
                <CompactLogo size={size * 2} inverse={inverse} />
                <FullLogo size={size * 1.1} hidden={hidden} inverse={inverse} />
            </span>
        );
    }

    return (
        <FullLogo
            size={size}
            hidden={hidden}
            inverse={inverse}
            className={className}
            {...rest}
        />
    );
};

export default Logo;