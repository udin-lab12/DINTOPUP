import { useState } from 'react';
import { Gamepad2 } from 'lucide-react';

interface GameImageProps {
  src: string;
  alt: string;
  className?: string;
}

export function GameImage({ src, alt, className = '' }: GameImageProps) {
  const [hasError, setHasError] = useState(false);

  if (hasError || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#1A1F2B] to-[#10131A] text-slate-400 p-4 text-center ${className}`}
      >
        <Gamepad2 className="w-8 h-8 text-amber-400/70 mb-2" strokeWidth={1.6} />
        <span className="text-xs font-medium text-slate-300 line-clamp-2">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
}
