// frontend/src/pages/Events/components/styled.js
import styled from 'styled-components';
import { Paper, Typography, TextField, Card } from '@mui/material';
import { theme } from '../../../theme/tokens';

const C = theme.colors;

export const StyledPaper = styled(Paper)`
    background: ${(p) => p.theme.colors.bgCard};
    border: 1px solid ${(p) => p.theme.colors.borderLight};
    border-radius: ${(p) => p.theme.borderRadius.lg};
    padding: 32px;
    box-shadow: ${(p) => p.theme.shadows.card};

    @media (max-width: 900px) {
        padding: 16px;
    }
`;

export const SectionTitle = styled(Typography)`
    color: ${(p) => p.theme.colors.textPrimary};
    font-weight: 600;
    margin-bottom: 16px;
`;

export const SessionPaper = styled(Paper)`
    background: ${(p) => p.theme.colors.bgCard};
    border: 1px solid ${(p) => p.theme.colors.borderLight};
    border-radius: ${(p) => p.theme.borderRadius.md};
    padding: 16px;
    margin-bottom: 12px;
    box-shadow: ${(p) => p.theme.shadows.card};
`;

export const TierPaper = styled(Paper)`
    background: ${(p) => p.theme.colors.bgCard};
    border: 1px solid ${(p) => p.theme.colors.borderLight};
    border-radius: ${(p) => p.theme.borderRadius.md};
    padding: 16px;
    margin-bottom: 12px;
    box-shadow: ${(p) => p.theme.shadows.card};
`;

export const TemplateCard = styled(Card)`
    border: ${(p) => (p.isDefault ? `2px solid ${C.success}` : `1px solid ${C.borderLight}`)};
    border-radius: 12px;
    transition: all 0.2s ease;
    cursor: ${(p) => (p.disabled ? 'not-allowed' : 'pointer')};
    opacity: ${(p) => (p.disabled ? 0.6 : 1)};

    &:hover {
        border-color: ${(p) => (p.disabled ? C.borderLight : C.primary)};
        box-shadow: ${(p) => (p.disabled ? 'none' : theme.shadows.cardHover)};
        transform: ${(p) => (p.disabled ? 'none' : 'translateY(-2px)')};
    }
`;

export const StyledTextField = styled(TextField)`
    & .MuiOutlinedInput-root {
        color: ${(p) => p.theme.colors.textPrimary};
        background: ${(p) => p.theme.colors.bgInput};

        fieldset { border-color: ${(p) => p.theme.colors.borderLight}; }
        &:hover fieldset { border-color: ${(p) => p.theme.colors.borderHover}; }
        &.Mui-focused fieldset { border-color: ${(p) => p.theme.colors.primary}; }
    }

    & .MuiInputLabel-root { color: ${(p) => p.theme.colors.textSecondary}; }
    & .MuiInputLabel-root.Mui-focused { color: ${(p) => p.theme.colors.primary}; }
    & .MuiSvgIcon-root { color: ${(p) => p.theme.colors.textMuted}; }
`;