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
// Implementation note:
//   We use <img> tags pointing at the SVG assets in `src/assets/logo/`.
//   This guarantees the logo appears EXACTLY as designed in the branding
//   guide, regardless of font loading, kerning, or platform-specific
//   font metric differences.
//
//   `inverse` swaps to a white-wordmark version for dark backgrounds.

import React from 'react';
import styled from 'styled-components';
import { theme } from '../../theme/tokens';

// Asset imports — Webpack/Vite will bundle these.
import logoFull from '../../assets/logo/ticketvolt-logo.svg';
import logoFullInverse from '../../assets/logo/ticketvolt-logo-inverse.svg';
import logoMark from '../../assets/logo/ticketvolt-logomark.svg';
import logoMarkInverse from '../../assets/logo/ticketvolt-logomark-inverse.svg';

// ============================================================
// STYLED WRAPPERS
// ============================================================

const LogoImg = styled.img`
    display: block;
    height: ${props => props.$height}px;
    width: auto;
    max-width: 100%;
    object-fit: contain;
    user-select: none;
    pointer-events: none;
    transition: opacity 0.2s ease;

    ${props => props.$hidden && `display: none;`}
`;

const LogoRow = styled.span`
    display: inline-flex;
    align-items: center;
    gap: ${props => props.$gap}px;
    user-select: none;
`;

// ============================================================
// PUBLIC COMPONENTS
// ============================================================

/**
 * Full wordmark logo.
 *
 * @param {number}  size     - rendered height in pixels (default 28)
 * @param {boolean} hidden   - hide entirely (used for collapsed sidebar)
 * @param {boolean} inverse  - use the white/light-on-dark variant
 */
export const FullLogo = ({
    size = 28,
    hidden = false,
    inverse = false,
    alt = 'TiKetVault',
    className = '',
}) => (
    <LogoImg
        src={inverse ? logoFullInverse : logoFull}
        alt={alt}
        $height={size}
        $hidden={hidden}
        className={className}
        draggable={false}
    />
);

/**
 * Compact logomark — icon-only ticket badge.
 *
 * @param {number}  size     - rendered height/width in pixels (default 40)
 * @param {boolean} inverse  - use the light-on-dark variant
 */
export const CompactLogo = ({
    size = 40,
    inverse = false,
    alt = 'TiKetVault',
    className = '',
}) => (
    <LogoImg
        src={inverse ? logoMarkInverse : logoMark}
        alt={alt}
        $height={size}
        className={className}
        draggable={false}
    />
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
 *   size: number    — pixel height (of the wordmark, or the mark for 'compact')
 *   hidden: boolean — hide the wordmark (used by collapsed sidebar)
 *   inverse: boolean — white text + translucent bg (for dark surfaces)
 */
const Logo = ({
    variant = 'full',
    size = 28,
    hidden = false,
    inverse = false,
    className = '',
    ...rest
}) => {
    if (variant === 'compact') {
        return (
            <CompactLogo
                size={size * 1.4}
                inverse={inverse}
                className={className}
                {...rest}
            />
        );
    }

    if (variant === 'both') {
        return (
            <LogoRow $gap={Math.round(size * 0.4)} className={className} {...rest}>
                <CompactLogo size={size * 1.4} inverse={inverse} />
                <FullLogo size={size} hidden={hidden} inverse={inverse} />
            </LogoRow>
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