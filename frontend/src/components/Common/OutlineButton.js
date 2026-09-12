// src/components/Common/OutlineButton.js
import { styled } from '@mui/material/styles';
import { Button } from '@mui/material';

const OutlineButton = styled(Button)`
    text-transform: none;
    font-weight: 600;
    border-radius: 8px;
    border-color: #e2e8f0;
    color: #475569;
    
    &:hover {
        border-color: #4f46e5;
        color: #4f46e5;
        background: rgba(79, 70, 229, 0.04);
    }
`;

export default OutlineButton;