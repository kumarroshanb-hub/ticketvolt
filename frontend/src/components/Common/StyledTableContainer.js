// src/components/Common/StyledTableContainer.js
import styled from 'styled-components';
import { Paper } from '@mui/material';

const StyledTableContainer = styled(Paper)`
    border-radius: 12px;
    border: 1px solid #e2e8f0;
    overflow: hidden;
    background: white;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
    margin-top: 16px;
`;

export default StyledTableContainer;