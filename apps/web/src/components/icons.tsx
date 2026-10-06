// Иконки — те же контуры, что на холсте дизайна (design/directions/project): вкладки, узлы ленты, галочка.
// Рисунок в сетке 24 × 24 — это координаты картинки, а не раскладка; размер задаёт место, где иконка стоит.
import type { ReactNode, SVGProps } from 'react';

type IconProps = { size?: number | string } & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>;

function Icon({ size = '1em', children, strokeWidth = 2, ...rest }: IconProps & { children: ReactNode }): ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const TodayIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="6" cy="6" r="2" />
    <circle cx="6" cy="18" r="2" />
    <path d="M6 8v8M11 6h8M11 18h8M11 12h5" />
  </Icon>
);

export const WordsIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="7.5" width="12" height="13" rx="2.5" />
    <path d="M8.5 4.5h9a2.5 2.5 0 0 1 2.5 2.5v10" />
  </Icon>
);

export const ExamIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="13" r="7.5" />
    <path d="M12 9.5V13l2.5 1.5M9.5 3h5" />
  </Icon>
);

export const ProgressIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 19.5h16M7 16v-5M12 16V7M17 16v-3" />
  </Icon>
);

/** Шестерёнка — как на холсте; контур — Feather Icons (MIT, © Cole Bemis). */
export const SettingsIcon = (p: IconProps) => (
  <Icon strokeWidth={1.9} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </Icon>
);

/** Verbal — пузырь с текстом (узел ленты на холсте). */
export const VerbalIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6.5l-4.5 3.5v-3.5a2 2 0 0 1-2-2z" />
    <path d="M8.5 9h7M8.5 12.5h4.5" />
  </Icon>
);

/** Quant — знак деления: своей иконки у раздела на холсте нет, контур — в той же манере. */
export const QuantIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14" />
    <circle cx="12" cy="6.5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="17.5" r="1.4" fill="currentColor" stroke="none" />
  </Icon>
);

/** Эссе — карандаш над строкой. */
export const EssayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h16" />
    <path d="M14.5 4.5l3 3L9 16H6v-3z" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon strokeWidth={2.6} {...p}>
    <path d="M5.5 12.5l4 4 9-9" />
  </Icon>
);

export const BackIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14.5 5.5L8 12l6.5 6.5" />
  </Icon>
);

export const OfflineIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 4.2-2.4M19 13a10 10 0 0 0-2.2-1.6M2 9.5a15 15 0 0 1 5.4-3M22 9.5A15 15 0 0 0 11 5.1" />
    <circle cx="12" cy="20" r="0.8" fill="currentColor" />
  </Icon>
);
