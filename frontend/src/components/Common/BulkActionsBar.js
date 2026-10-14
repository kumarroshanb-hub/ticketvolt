// src/components/Common/BulkActionsBar.js
import styled from 'styled-components';
import { theme } from '../../theme/tokens';

const C = theme.colors;

const BulkActionsBar = styled.div`
    background: ${C.infoBanner};
    padding: 12px 20px;
    border-radius: 10px;
    margin-bottom: 16px;
    border: 1px solid ${C.infoBannerBorder};
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
`;

export default BulkActionsBar;