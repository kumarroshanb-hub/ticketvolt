// src/components/Common/StyledCard.js
import styled from 'styled-components';
import { Card } from '@mui/material';
import { theme } from '../../theme/tokens';

const C = theme.colors;

const StyledCard = styled(Card)`
    border-radius: 12px;
    border: 1px solid ${C.borderLight};
    box-shadow: ${theme.shadows.card};
    height: 100%;
    transition: all 0.2s ease;

    &:hover {
        box-shadow: ${theme.shadows.cardHover};
        transform: translateY(-2px);
    }
`;

export default StyledCard;