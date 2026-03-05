"use client";

import React, { useEffect, useRef } from "react";

export default function MatrixRainBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ripplesRef = useRef<{ x: number; y: number; radius: number; alpha: number }[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas to full screen
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    // Matrix Configuration
    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize);
    const drops: number[] = new Array(columns).fill(1); // Y-coordinate of drops

    // Characters to use (Katakana + Latin)
    const chars =
      "アァカサタナハマヤャラワガザダバパイィキシチニヒミリヰギジヂビピウゥクスツヌフムユュルグズブヅプエェケセテネヘメレヱゲゼデベペオォコソトノホモヨョロヲゴゾドボポヴッン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    const draw = () => {
      // Create fade effect using destination-out to make trails transparent
      // This ensures the canvas background remains transparent, not black
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Reset composite operation to draw new text
      ctx.globalCompositeOperation = "source-over";

      // Text settings
      ctx.font = `${fontSize}px monospace`;

      // Draw drops
      for (let i = 0; i < drops.length; i++) {
        // Random character
        const text = chars.charAt(Math.floor(Math.random() * chars.length));

        // x = column index * font size
        // y = drop value * font size
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        // Checking ripples
        let isInsideRipple = false;
        ripplesRef.current.forEach(ripple => {
          const dx = x - ripple.x;
          const dy = y - ripple.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          // If inside the active ripple ring (width 50px)
          if (distance > ripple.radius - 50 && distance < ripple.radius) {
            isInsideRipple = true;
          }
        });

        if (isInsideRipple) {
          ctx.fillStyle = "#ffffff"; // White hot ripple
          ctx.shadowBlur = 15;
          ctx.shadowColor = "#34d399";
        } else {
          // Much brighter emerald for visibility
          ctx.fillStyle = "#10b981";
          if (Math.random() > 0.95) ctx.fillStyle = "#6ee7b7"; // Random bright highlights
          ctx.shadowBlur = 0;
        }

        ctx.fillText(text, x, y);

        // Reset drop or move down
        if (y > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }

      // Draw and Update Ripples
      // We draw the ripple effect primarily via the text color change above,
      // but we can add a subtle glow ring too.
      ripplesRef.current.forEach((ripple, index) => {
        ctx.beginPath();
        ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(52, 211, 153, ${ripple.alpha})`; // Brighter stroke
        ctx.lineWidth = 3;
        ctx.stroke();

        // Update ripple
        ripple.radius += 5; // Expand speed
        ripple.alpha -= 0.02; // Fade speed

        // Remove dead ripples
        if (ripple.alpha <= 0) {
          ripplesRef.current.splice(index, 1);
        }
      });
    };

    const interval = setInterval(draw, 33); // ~30FPS

    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // Handle Click for Ripple
  const handleClick = (e: React.MouseEvent) => {
    // Get coordinates relative to the viewport (since fixed)
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ripplesRef.current.push({
      x,
      y,
      radius: 0,
      alpha: 1.0,
    });
  };

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      className="fixed inset-0 w-full h-full z-0 pointer-events-auto cursor-crosshair opacity-60"
      style={{}}
    />
  );
}
