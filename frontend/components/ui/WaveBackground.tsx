'use client';

import React, { useEffect, useRef } from 'react';

const WaveBackground = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let width = window.innerWidth;
        let height = window.innerHeight;

        // Wave parameters
        const waveHeight = 60; // Amplitude
        const waveFrequency = 0.02; // Frequency of the sine wave
        const speed = 0.002; // Speed of movement
        const gridSpacing = 40; // Spacing between dots

        // Grid expansion factor to prevent edges from showing
        const expansionFactor = 4;

        // Particle class
        class Particle {
            x: number;
            y: number;
            z: number;
            baseY: number;

            constructor(x: number, y: number) {
                this.x = x;
                this.y = y;
                this.z = 0;
                this.baseY = y;
            }

            update(time: number) {
                // Calculate wave motion based on x, y and time
                // Use a combination of sine waves for a more organic terrain look
                const distFromCenter = Math.sqrt((this.x - width / 2) ** 2 + (this.y - height / 2) ** 2);

                this.z = Math.sin(this.x * waveFrequency + time * speed) * waveHeight +
                    Math.cos(this.y * waveFrequency + time * speed) * waveHeight;
            }

            draw(ctx: CanvasRenderingContext2D) {
                // 3D Projection (Simplified)
                const perspective = 300;
                const cameraY = -100; // Lift camera up

                // Adjust for perspective
                const scale = perspective / (perspective + 100 + this.y * 0.1);
                // We want the wave to look like a floor/terrain, so we tilt it.
                // Simple 2.5D projection:

                // Center the grid
                const cx = width / 2;
                const cy = height / 2;

                // 3D rotation matrix simulation (Rotating around X axis to create floor effect)
                // New Y = Y * cos(angle) - Z * sin(angle)
                // New Z = Y * sin(angle) + Z * cos(angle)

                const angle = 1.2; // Tilt angle

                // Relativize coordinates to center
                let rx = (this.x - width / 2);
                let ry = (this.y - height / 2);
                let rz = this.z;

                // Rotate
                let py = ry * Math.cos(angle) - rz * Math.sin(angle);
                let pz = ry * Math.sin(angle) + rz * Math.cos(angle) + 500; // +500 pushes it back

                // Project
                if (pz <= 0) return; // Behind camera

                let k = perspective / pz;
                let sx = cx + rx * k;
                let sy = cy + py * k;

                // Size attenuation
                const size = Math.max(0.5, 3 * k);
                const alpha = Math.min(1, Math.max(0.1, (pz - 200) / 1000)); // Fade in distance

                ctx.fillStyle = `rgba(16, 185, 129, ${1 - alpha})`; // Emerald green

                // Draw Circle
                ctx.beginPath();
                ctx.arc(sx, sy, size, 0, Math.PI * 2);
                ctx.fill();

                // Optional: Glow effect can be expensive, maybe just for close particles
                // if (k > 0.8) {
                //    ctx.shadowBlur = 10;
                //    ctx.shadowColor = 'rgba(16, 185, 129, 0.5)';
                // } else {
                //    ctx.shadowBlur = 0;
                // }
            }
        }

        let particles: Particle[] = [];

        const init = () => {
            width = window.innerWidth;
            height = window.innerHeight;
            canvas.width = width;
            canvas.height = height;

            particles = [];

            // Create a grid of particles that extends well beyond the screen
            const rows = Math.ceil((height * expansionFactor) / gridSpacing);
            const cols = Math.ceil((width * expansionFactor) / gridSpacing);

            const startX = -(cols * gridSpacing) / 2 + width / 2;
            const startY = -(rows * gridSpacing) / 4 + height / 2; // Bias towards bottom for "floor"

            for (let i = 0; i < cols; i++) {
                for (let j = 0; j < rows; j++) {
                    const x = startX + i * gridSpacing;
                    const y = startY + j * gridSpacing;
                    particles.push(new Particle(x, y));
                }
            }
        };

        const animate = () => {
            const time = Date.now();

            // Clear but keep a slight trail? No, clear fully for crisp dots
            ctx.clearRect(0, 0, width, height);

            // Background is transparent so it overlays on the main black bg

            particles.forEach(p => {
                p.update(time);
                p.draw(ctx);
            });

            animationFrameId = requestAnimationFrame(animate);
        };

        init();
        animate();

        const handleResize = () => {
            init();
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ opacity: 0.6 }}
        />
    );
};

export default WaveBackground;
