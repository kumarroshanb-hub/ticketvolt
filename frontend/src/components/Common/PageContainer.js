// src/components/Common/PageContainer.js
import styled from 'styled-components';
import { theme } from '../../theme/tokens';

const PageContainer = styled.div`
    padding: 24px;
    max-width: 1400px;
    margin: 0 auto;
    background: ${theme.colors.bgPrimary};
    min-height: 100vh;
`;

export default PageContainer;