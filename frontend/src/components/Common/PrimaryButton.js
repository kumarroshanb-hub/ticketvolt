// src/components/Common/PrimaryButton.js
import { styled } from '@mui/material/styles';
import { Button } from '@mui/material';

const PrimaryButton = styled(Button)`
    background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
    color: white;
    text-transform: none;
    font-weight: 600;
    padding: 8px 24px;
    border-radius: 8px;
    box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);
    
    &:hover {
        background: linear-gradient(135deg, #4338ca 0%, #6d28d9 100%);
        box-shadow: 0 6px 20px rgba(79, 70, 229, 0.45);
        transform: translateY(-1px);
    }
    
    &:disabled {
        background: #94a3b8;
        box-shadow: none;
        transform: none;
    }
`;

export default PrimaryButton;