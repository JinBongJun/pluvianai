'use client';

import React, { useEffect, useState } from 'react';

export const MouseSpotlight = () => {
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            setMousePos({ x: e.clientX, y: e.clientY });
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    return (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
            {/* Brighter Mouse Spotlight Glow */}
            <div
                className="absolute inset-0 transition-opacity duration-300"
                style={{
                    background: `radial-gradient(circle 500px at ${mousePos.x}px ${mousePos.y}px, rgba(16, 185, 129, 0.1), transparent 80%)`
                }}
            />

            {/* Sharpened Grid revealed by Mouse Spotlight */}
            <div
                className="absolute inset-0 bg-flowing-lines-sharp"
                style={{
                    WebkitMaskImage: `radial-gradient(circle 300px at ${mousePos.x}px ${mousePos.y}px, black 0%, transparent 100%)`,
                    maskImage: `radial-gradient(circle 300px at ${mousePos.x}px ${mousePos.y}px, black 0%, transparent 100%)`
                }}
            />
        </div>
    );
};
