// src/components/Common/PageSubtitle.js
import styled from 'styled-components';
import { Typography } from '@mui/material';
import { theme } from '../../theme/tokens';

const PageSubtitle = styled(Typography)`
    color: ${theme.colors.textSecondary};
    font-size: 0.875rem;
    margin-top: 4px;
`;

export default PageSubtitle;