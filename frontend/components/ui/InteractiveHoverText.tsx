"use client";

import React, { useState } from "react";

interface InteractiveHoverTextProps {
  text: string;
  className?: string;
  textClassName?: string;
}

const InteractiveHoverText: React.FC<InteractiveHoverTextProps> = ({
  text,
  className,
  textClassName,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <div className={`inline-block cursor-default ${className}`}>
      {text.split("").map((char, index) => (
        <span
          key={index}
          className={`inline-block transition-all duration-200 ${textClassName}`}
          style={{
            transform:
              hoveredIndex === index ? "translateY(-10px) scale(1.1)" : "translateY(0) scale(1)",
            textShadow:
              hoveredIndex === index
                ? "0 0 20px rgba(52, 211, 153, 0.8), 0 0 40px rgba(52, 211, 153, 0.4)"
                : "none",
            color: hoveredIndex === index ? "#4ade80" : "currentColor",
            transitionDelay: "0ms",
          }}
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          {char === " " ? "\u00A0" : char}
        </span>
      ))}
    </div>
  );
};

export default InteractiveHoverText;
