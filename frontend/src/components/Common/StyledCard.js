// src/components/Common/StyledCard.js
import styled from 'styled-components';
import { Card } from '@mui/material';

const StyledCard = styled(Card)`
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    height: 100%;
    transition: all 0.2s ease;
    
    &:hover {
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        transform: translateY(-2px);
    }
`;

export default StyledCard;