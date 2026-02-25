import React from 'react';

// Minimalist domed robot/bird icon
export const RobotBirdIcon = ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
        {/* Wider, flatter Dome Body */}
        <path d="M3 18v-5c0-4.4 3.6-8 9-8s9 3.6 9 8v5H3z" />
        {/* Solid Eye (centered on the wider head) */}
        <circle cx="8" cy="11.5" r="1.5" fill="currentColor" stroke="none" />
        {/* Laser/Beak crossing edge */}
        <path d="M22 10.5l-9 4.5" />
    </svg>
);
