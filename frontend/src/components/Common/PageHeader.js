// src/components/Common/PageHeader.js
import styled from 'styled-components';
import { theme } from '../../theme/tokens';

const PageHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding: 16px 0;
    border-bottom: 1px solid ${theme.colors.borderLight};
    flex-wrap: wrap;
    gap: 16px;
`;

export default PageHeader;