// src/components/Common/OutlineButton.js
import { styled } from '@mui/material/styles';
import { Button } from '@mui/material';
import { theme } from '../../theme/tokens';

const C = theme.colors;

const OutlineButton = styled(Button)`
    text-transform: none;
    font-weight: 600;
    border-radius: 8px;
    border-color: ${C.borderLight};
    color: ${C.textSecondary};

    &:hover {
        border-color: ${C.primary};
        color: ${C.primary};
        background: rgba(51, 51, 51, 0.04);
    }
`;

export default OutlineButton;