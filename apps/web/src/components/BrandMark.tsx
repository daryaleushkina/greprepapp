// Знак — та же лента шагов, что в приложении: три узла на нити и строки шагов (макет T4-SignIn; так же рисует
// приложение Apple, BrandMark.swift). Координаты — сетка рисунка 30 × 30, размер задаёт место, где знак стоит.
import type { ReactNode } from 'react';

export function BrandMark({ className }: { className?: string }): ReactNode {
  return (
    <svg className={className} viewBox="0 0 30 30" fill="none" aria-hidden="true" focusable="false">
      <path d="M9 7.5v15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity=".45" />
      <circle cx="9" cy="6" r="3.6" fill="currentColor" />
      <circle cx="9" cy="15" r="2.6" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9" cy="24" r="2.6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 6h8M16 15h6M16 24h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
