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
// Sizing:
//   The `height` prop is the rendered pixel height.
//   Defaults are tuned so the logo looks right at typical call sites
//   (sidebar header, login card, e-ticket header).
//
//   For backwards compatibility, `size` is accepted as an alias of
//   `height`. New code should prefer `height`.

import React from 'react';
import styled from 'styled-components';

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
 * @param {number}  height   - rendered pixel height (default 40)
 * @param {boolean} hidden   - hide entirely (used for collapsed sidebar)
 * @param {boolean} inverse  - use the light-on-dark variant
 */
export const FullLogo = ({
    height = 56,
    hidden = false,
    inverse = false,
    alt = 'TiKetVault',
    className = '',
}) => (
    <LogoImg
        src={inverse ? logoFullInverse : logoFull}
        alt={alt}
        $height={height}
        $hidden={hidden}
        className={className}
        draggable={false}
    />
);

/**
 * Compact logomark — icon-only ticket badge.
 *
 * @param {number}  height   - rendered pixel height/width (default 44)
 * @param {boolean} inverse  - use the light-on-dark variant
 */
export const CompactLogo = ({
    height = 60,
    inverse = false,
    alt = 'TiKetVault',
    className = '',
}) => (
    <LogoImg
        src={inverse ? logoMarkInverse : logoMark}
        alt={alt}
        $height={height}
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
 *   height: number   — pixel height (of the wordmark, or the mark for 'compact')
 *   size:   number   — legacy alias for `height`
 *   hidden: boolean  — hide the wordmark (used by collapsed sidebar)
 *   inverse: boolean — white text + translucent bg (for dark surfaces)
 */
const Logo = ({
    variant = 'full',
    height,
    size,                // legacy alias
    hidden = false,
    inverse = false,
    className = '',
    ...rest
}) => {
    // Resolve height, honoring either prop name.
    const h = height ?? size;

    if (variant === 'compact') {
        return (
            <CompactLogo
                height={h ?? 60}
                inverse={inverse}
                className={className}
                {...rest}
            />
        );
    }

    if (variant === 'both') {
        // Wordmark gets the requested height; mark is slightly taller so
        // they optically balance. Gap scales with the mark.
        const markH = (h ?? 48) * 1.25;
        const wordH = h ?? 48;
        const gap = Math.round(markH * 0.35);

        return (
            <LogoRow $gap={gap} className={className} {...rest}>
                <CompactLogo height={markH} inverse={inverse} />
                <FullLogo height={wordH} hidden={hidden} inverse={inverse} />
            </LogoRow>
        );
    }

    return (
        <FullLogo
            height={h ?? 56}
            hidden={hidden}
            inverse={inverse}
            className={className}
            {...rest}
        />
    );
};

export default Logo;