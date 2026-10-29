// frontend/src/components/LanguageSwitcher/LanguageSwitcher.js
import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { Language as LanguageIcon, KeyboardArrowDown } from '@mui/icons-material';
import {
    SUPPORTED_LANGUAGES,
    setLanguage,
    getCurrentLanguage,
    normalizeLanguage,
} from '../../i18n';
import { theme } from '../../theme/tokens';

const C = theme.colors;
const F = theme.fonts;

// ---------------------------------------------------------------------------
// Two visual variants:
//   • variant="light"  — dark text, for the admin shell
//   • variant="dark"   — white text, for the landing hero
// ---------------------------------------------------------------------------
const Wrap = styled.div`
    position: relative;
    font-family: ${F.family};
    flex-shrink: 0;
`;

const Trigger = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    min-height: 40px;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
    font-family: ${F.family};
    font-size: 13px;
    font-weight: 600;

    background: ${(p) =>
        p.$variant === 'dark'
            ? 'rgba(255,255,255,0.06)'
            : C.bgCard};
    border: 1px solid
        ${(p) =>
            p.$variant === 'dark'
                ? 'rgba(255,255,255,0.18)'
                : C.borderLight};
    color: ${(p) =>
        p.$variant === 'dark' ? '#ffffff' : C.textPrimary};

    &:hover {
        border-color: ${C.secondary};
        color: ${C.secondary};
    }
`;

const Flag = styled.span`
    font-size: 16px;
    line-height: 1;
`;

const Label = styled.span`
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;

    @media (max-width: 600px) {
        display: none;
    }
`;

const Chevron = styled(KeyboardArrowDown)`
    font-size: 18px !important;
    transition: transform 0.15s ease;
    transform: rotate(${(p) => (p.$open ? '180deg' : '0deg')});
`;

const Dropdown = styled.ul`
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 180px;
    margin: 0;
    padding: 6px;
    list-style: none;
    border-radius: 12px;
    background: ${C.bgCard};
    border: 1px solid ${C.borderLight};
    box-shadow: ${theme.shadows.dropdown};
    z-index: 2000;
    animation: fadeIn 0.12s ease;

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-4px); }
        to   { opacity: 1; transform: translateY(0); }
    }
`;

const Item = styled.li`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
    color: ${(p) => (p.$active ? C.primary : C.textPrimary)};
    background: ${(p) => (p.$active ? 'rgba(51,51,51,0.08)' : 'transparent')};
    font-weight: ${(p) => (p.$active ? 700 : 500)};

    &:hover {
        background: ${C.bgInput};
    }
`;

const Check = styled.span`
    margin-left: auto;
    font-size: 12px;
    font-weight: 700;
    color: ${C.primary};
`;

const LanguageSwitcher = ({ variant = 'light', compact = false }) => {
    const { i18n, t } = useTranslation();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    // Both `current` and `currentMeta` MUST be derived via the same
    // normaliser so 'en-HK', 'en', 'zh-hant', and 'zh-Hant' all resolve
    // to the correct metadata. The previous code compared raw codes and
    // silently showed the wrong flag when i18n.language was a BCP-47
    // tag like 'en-HK'.
    const current = getCurrentLanguage();
    const currentMeta =
        SUPPORTED_LANGUAGES.find(
            (l) => normalizeLanguage(l.code) === current
        ) || SUPPORTED_LANGUAGES[0];

    // Close on outside click.
    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // Close on Escape.
    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open]);

    const handleSelect = async (code) => {
        setOpen(false);

        // Compare NORMALISED forms. Raw i18n.language can be 'en-HK'
        // or 'zh-hant' and would never equal a raw 'en' / 'zh-Hant',
        // which made clicking the currently-active language a no-op
        // (i.e. the button appeared "broken" even when the switch
        // itself worked).
        if (normalizeLanguage(code) === normalizeLanguage(i18n.language)) {
            return;
        }

        await setLanguage(code);
    };

    return (
        <Wrap ref={ref}>
            <Trigger
                type="button"
                $variant={variant}
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-label={t('common.changeLanguage', { defaultValue: 'Change language' })}
            >
                <LanguageIcon fontSize="small" />
                {!compact && (
                    <>
                        <Flag>{currentMeta.flag}</Flag>
                        <Label>{currentMeta.nativeLabel}</Label>
                    </>
                )}
                {compact && <Flag>{currentMeta.flag}</Flag>}
                <Chevron $open={open} />
            </Trigger>

            {open && (
                <Dropdown role="listbox">
                    {SUPPORTED_LANGUAGES.map((lang) => {
                        const isActive =
                            normalizeLanguage(lang.code) === current;
                        return (
                            <Item
                                key={lang.code}
                                role="option"
                                aria-selected={isActive}
                                $active={isActive}
                                onClick={() => handleSelect(lang.code)}
                            >
                                <Flag>{lang.flag}</Flag>
                                <span>{lang.nativeLabel}</span>
                                {isActive && <Check>✓</Check>}
                            </Item>
                        );
                    })}
                </Dropdown>
            )}
        </Wrap>
    );
};

export default LanguageSwitcher;