// src/components/Common/StyledTableContainer.js
import styled from 'styled-components';
import { Paper } from '@mui/material';
import { theme } from '../../theme/tokens';

const C = theme.colors;

const StyledTableContainer = styled(Paper)`
    border-radius: 12px;
    border: 1px solid ${C.borderLight};
    overflow: hidden;
    background: ${C.bgCard};
    box-shadow: ${theme.shadows.card};
    margin-top: 16px;
`;

export default StyledTableContainer;