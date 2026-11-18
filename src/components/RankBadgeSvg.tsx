import { useState } from 'react';
import { Shield } from 'lucide-react';
import { JOKI_RANK_IMAGES } from '../utils/format.ts';

export function RankBadgeSvg({ tier, imageUrl }: { tier: string; imageUrl?: string }) {
  const [hasError, setHasError] = useState(false);
  const src = imageUrl || JOKI_RANK_IMAGES[tier] || '';

  if (hasError || !src) {
    return (
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-[#0B0D12] text-amber-400">
        <Shield className="h-7 w-7" />
      </div>
    );
  }

  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-white p-1">
      <img
        src={src}
        alt={`Logo Rank ${tier}`}
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
        className="h-full w-full object-contain"
      />
    </div>
  );
}
