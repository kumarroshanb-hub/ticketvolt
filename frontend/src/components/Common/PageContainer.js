// src/components/Common/PageContainer.js
import styled from 'styled-components';
import { theme } from '../../theme/tokens';

const PageContainer = styled.div`
    padding: clamp(16px, 2.4vw, 32px);
    max-width: 1400px;
    width: 100%;
    margin: 0 auto;
    background: ${theme.colors.bgPrimary};
    min-height: 100vh;
    min-height: 100dvh;
    overflow-x: clip;

    @media (max-width: 900px) {
        padding: 16px;
    }

    @media (max-width: 480px) {
        padding: 12px;
    }
`;

export default PageContainer;