// src/components/Common/PageTitle.js
import styled from 'styled-components';
import { Typography } from '@mui/material';
import { theme } from '../../theme/tokens';

const PageTitle = styled(Typography)`
    font-weight: 700;
    color: ${theme.colors.textPrimary};
    font-size: 1.75rem;
    letter-spacing: -0.01em;
`;

export default PageTitle;