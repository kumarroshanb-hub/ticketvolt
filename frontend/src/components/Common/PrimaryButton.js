// src/components/Common/PrimaryButton.js
import { styled } from '@mui/material/styles';
import { Button } from '@mui/material';
import { theme } from '../../theme/tokens';

const C = theme.colors;

const PrimaryButton = styled(Button)`
    background: ${C.primaryGradient};
    color: ${C.textInverse};
    text-transform: none;
    font-weight: 600;
    padding: 8px 24px;
    border-radius: 8px;
    box-shadow: ${theme.shadows.button};

    &:hover {
        background: linear-gradient(135deg, ${C.primaryDark} 0%, ${C.primaryLight} 100%);
        box-shadow: ${theme.shadows.buttonHover};
        transform: translateY(-1px);
    }

    &:disabled {
        background: ${C.textLight};
        color: ${C.textInverse};
        box-shadow: none;
        transform: none;
    }
`;

export default PrimaryButton;