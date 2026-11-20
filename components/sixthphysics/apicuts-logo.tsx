import React from 'react';

export function ApicutsLogoMark({ className = 'h-3.5 w-3.5 shrink-0' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient
          id="sp-apicuts-lg"
          gradientUnits="userSpaceOnUse"
          x1="4"
          y1="60"
          x2="60"
          y2="4"
        >
          <stop offset="0" stopColor="#0A1A47" />
          <stop offset=".55" stopColor="#1E4FD6" />
          <stop offset="1" stopColor="#4FB0FF" />
        </linearGradient>
        <linearGradient
          id="sp-apicuts-ls"
          gradientUnits="userSpaceOnUse"
          x1="34"
          y1="30"
          x2="60"
          y2="4"
        >
          <stop offset="0" stopColor="#5DB4FF" />
          <stop offset="1" stopColor="#A6D6FF" />
        </linearGradient>
        <clipPath id="sp-apicuts-lo">
          <polygon points="-10,-21.3 80,68.7 80,80 -10,80" />
        </clipPath>
        <clipPath id="sp-apicuts-hi">
          <polygon points="-10,-24.7 80,65.3 80,-30 -10,-30" />
        </clipPath>
      </defs>
      <rect
        x="4"
        y="4"
        width="56"
        height="56"
        rx="14"
        fill="url(#sp-apicuts-lg)"
        clipPath="url(#sp-apicuts-lo)"
      />
      <g transform="translate(3.5 -3.5)">
        <rect
          x="4"
          y="4"
          width="56"
          height="56"
          rx="14"
          fill="url(#sp-apicuts-ls)"
          clipPath="url(#sp-apicuts-hi)"
        />
      </g>
    </svg>
  );
}
