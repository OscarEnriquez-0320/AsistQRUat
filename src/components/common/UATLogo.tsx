import React, { useState } from 'react';

interface UATLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  variant?: 'full' | 'shield' | 'horizontal';
  customImagePath?: string;
}

export const UATLogo: React.FC<UATLogoProps> = ({
  className = '',
  size = 'lg',
  variant = 'shield',
  customImagePath,
}) => {
  const [imageError, setImageError] = useState(false);

  const dimensions = {
    sm: { w: 48, h: 26 },
    md: { w: 84, h: 44 },
    lg: { w: 130, h: 68 },
    xl: { w: 180, h: 94 },
    '2xl': { w: 240, h: 125 },
  }[size];

  const logoSrc = customImagePath || '/images/UAT Vertical.png';

  if (!imageError) {
    if (variant === 'horizontal') {
      return (
        <div className={`flex items-center gap-3 ${className}`}>
          <img
            src={logoSrc}
            alt="UAT - Universidad Autónoma de Tamaulipas"
            onError={() => setImageError(true)}
            style={{ width: dimensions.w, height: dimensions.h }}
            className="object-contain shrink-0 drop-shadow-xs"
          />
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#0c4467] block leading-tight">
              Universidad Autónoma de Tamaulipas
            </span>
            <span className="text-xs font-bold text-slate-800 block mt-0.5">
              Asistencia por QR
            </span>
          </div>
        </div>
      );
    }

    return (
      <div className={`flex items-center justify-center ${className}`}>
        <img
          src={logoSrc}
          alt="UAT - Universidad Autónoma de Tamaulipas"
          onError={() => setImageError(true)}
          style={{ width: dimensions.w, height: dimensions.h }}
          className="object-contain drop-shadow-xs select-none transition-transform hover:scale-102 duration-300"
        />
      </div>
    );
  }

  // Fallback vector si la imagen no carga
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <svg
        width={dimensions.w}
        height={dimensions.h}
        viewBox="0 0 330 172"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="object-contain select-none"
      >
        <path
          d="M32 28 H72 V98 C72 114 84 126 100 126 C116 126 128 114 128 98 V28 H168 V98 C168 136 138 166 100 166 C62 166 32 136 32 98 Z"
          fill="#0c4467"
        />
        <circle cx="100" cy="98" r="20" fill="#bb6225" />
        <path
          d="M174 28 H246 L278 166 H236 L226 122 H194 L184 166 H146 L174 28 Z M202 88 H218 L210 52 Z"
          fill="#bb6225"
        />
        <path
          d="M246 28 H318 V64 H296 V166 H258 V64 H246 Z"
          fill="#bb6225"
        />
      </svg>
    </div>
  );
};
