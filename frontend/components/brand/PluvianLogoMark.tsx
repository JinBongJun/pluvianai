import React from "react";

interface PluvianLogoMarkProps {
  className?: string;
}

export default function PluvianLogoMark({ className = "" }: PluvianLogoMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M6 17.5V12.1C6 8.3 8.9 5.5 12.5 5.5C16.1 5.5 19 8.3 19 12.1V17.5"
        stroke="#06b6d4"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="11.1" cy="9.1" r="1.35" fill="#22d3ee" />
    </svg>
  );
}
