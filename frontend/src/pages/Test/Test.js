import React from 'react';

const Test = () => {
    return (
        <div style={{ 
            color: 'white', 
            padding: '40px',
            background: '#0A0B1A',
            minHeight: '100vh',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            flexDirection: 'column'
        }}>
            <h1 style={{ color: '#5B5FEF' }}>✅ Test Page is Working!</h1>
            <p>If you see this, the app is loading correctly.</p>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)' }}>
                Current URL: {window.location.href}
            </p>
        </div>
    );
};

export default Test;