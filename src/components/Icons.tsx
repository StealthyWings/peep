// Hand-drawn line icons (24×24, stroke = currentColor) in a field-guide style.

import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 24, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  )
}

/** Raw path data, reused by stickers (which draw inside their own SVG). */
export const GLYPHS = {
  camera: (
    <>
      <path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.5" r="3.6" />
      <circle cx="12" cy="13.5" r="1.4" />
      <path d="M17.5 11h.01" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />
      <path d="M2.5 9.5c.6 1 .6 2 0 3M21.5 9.5c-.6 1-.6 2 0 3" opacity=".6" />
    </>
  ),
  binoculars: (
    <>
      <path d="M5.5 9 7 4.5h3L10.5 9M13.5 9 14 4.5h3L18.5 9" />
      <circle cx="6.5" cy="15" r="4" />
      <circle cx="17.5" cy="15" r="4" />
      <path d="M10.5 13.5h3" />
    </>
  ),
  book: (
    <>
      <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z" />
      <path d="M12 6.5v13" />
      <path d="M6 9c1.3-.2 2.7 0 3.5.5M6 12c1.3-.2 2.7 0 3.5.5" opacity=".6" />
    </>
  ),
  flock: (
    <>
      <path d="M3 9c1.5-1.4 3-1.4 4.5 0 1.5-1.4 3-1.4 4.5 0" />
      <path d="M10 15c1.6-1.5 3.3-1.5 5 0 1.6-1.5 3.3-1.5 5 0" />
      <path d="M8 19.5c1-.9 2-.9 3 0 1-.9 2-.9 3 0" opacity=".7" />
    </>
  ),
  bird: (
    <>
      <path d="M4 15c0-4.5 3.5-8 8-8 2.2 0 4 1.2 5 3l3 .5-2.6 1.6C17 16 14 19 9.5 19 6.5 19 4 17.5 4 15Z" />
      <path d="M7.5 14.5c2 .2 4-.6 5.5-2.5" />
      <circle cx="15" cy="9.8" r=".6" fill="currentColor" />
      <path d="M9.5 19 9 21.5M12 18.7l.3 2.8" />
    </>
  ),
  feather: (
    <>
      <path d="M19.5 4.5C13 4.5 7 10 6 18.5" />
      <path d="M19.5 4.5c.5 6-3.5 11.5-10.5 12.5" />
      <path d="M9.5 13.5l3-1M11.5 10.5l3-1M8 16.5l2.5-.5" opacity=".7" />
      <path d="M6 18.5 4.5 20" />
    </>
  ),
  owl: (
    <>
      <path d="M6 5.5 8 8M18 5.5 16 8" />
      <path d="M6 9c0-2 2.7-3 6-3s6 1 6 3v6c0 3.3-2.7 5.5-6 5.5S6 18.3 6 15Z" />
      <circle cx="9.4" cy="11" r="1.9" />
      <circle cx="14.6" cy="11" r="1.9" />
      <path d="m11.3 13.2.7 1.2.7-1.2" />
      <path d="M9 17c1.8.8 4.2.8 6 0" opacity=".6" />
    </>
  ),
  wings: (
    <>
      <path d="M10.6 10.5C8.5 7 5.3 5.5 2 6c.5 2 1.6 3.4 3.1 4.3-1 .3-2 .3-2.8 0 .9 2 2.9 3.3 5.4 3.3-.6.7-1.4 1.1-2.3 1.3 1.4 1.3 3.6 1.5 5.2.6" />
      <path d="M13.4 10.5C15.5 7 18.7 5.5 22 6c-.5 2-1.6 3.4-3.1 4.3 1 .3 2 .3 2.8 0-.9 2-2.9 3.3-5.4 3.3.6.7 1.4 1.1 2.3 1.3-1.4 1.3-3.6 1.5-5.2.6" />
      <path d="M12 8.5c-.9 0-1.4.8-1.4 1.9V16l1.4 2.5 1.4-2.5v-5.6c0-1.1-.5-1.9-1.4-1.9Z" />
      <path d="m11 18.8-.6 1.7M13 18.8l.6 1.7" opacity=".7" />
    </>
  ),
  pair: (
    <>
      <path d="M2.5 13c0-3 2.3-5.2 5.3-5.2 1.5 0 2.7.8 3.3 2l2 .3-1.7 1C11.2 14.6 9.3 16 7 16c-2.4 0-4.5-1.2-4.5-3Z" />
      <path d="M21.5 15c0-3-2.3-5.2-5.3-5.2-1.5 0-2.7.8-3.3 2" opacity=".7" />
      <path d="M21.5 15c0 1.8-2.1 3-4.5 3" opacity=".7" />
    </>
  ),
  ear: (
    <>
      <path d="M7 9a5 5 0 0 1 10 0c0 3-3 3.5-3 6.5a2.5 2.5 0 0 1-5 .5" />
      <path d="M10 9.5a2 2 0 0 1 4 0c0 1.2-1.5 1.5-1.5 3" />
      <path d="M19.5 6c1 1.5 1.5 3 1.5 4.5M3 10.5C3 9 3.5 7.5 4.5 6" opacity=".6" />
    </>
  ),
  lens: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <circle cx="11" cy="11" r="3" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  sunrise: (
    <>
      <path d="M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0" />
      <path d="M12 5v3M5 9l2 2M19 9l-2 2M2.5 14h2M19.5 14h2" />
    </>
  ),
  moon: (
    <>
      <path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5Z" />
      <path d="M17 4.5v2M16 5.5h2M20.5 8.5v1.5M19.75 9.25h1.5" opacity=".7" />
    </>
  ),
  leaf: (
    <>
      <path d="M5 19C4 11 9 5 19.5 4.5 20 15 14 20 5 19Z" />
      <path d="M5 19 14 10M9.5 14.5h3.5M11.5 12.5V9" opacity=".7" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.5 8.5-2 5-5 2 2-5Z" />
      <path d="M12 3.5v1.5M12 19v1.5M3.5 12H5M19 12h1.5" opacity=".6" />
    </>
  ),
  boot: (
    <>
      <path d="M8 3.5h5V12l6 2.5c1 .4 1.5 1.2 1.5 2.2V19H4.5v-3.5L8 13Z" />
      <path d="M4.5 19v1.5h16V19M8.5 7h4.5M8.5 10h4.5" />
    </>
  ),
  frog: (
    <>
      <circle cx="8" cy="7.5" r="2.5" />
      <circle cx="16" cy="7.5" r="2.5" />
      <path d="M5.8 9c-1.8 1.3-2.8 3.3-2.8 5.5C3 17.5 7 19.5 12 19.5s9-2 9-5c0-2.2-1-4.2-2.8-5.5" />
      <path d="M9 14c1.8 1 4.2 1 6 0" />
      <circle cx="8" cy="7.5" r=".6" fill="currentColor" />
      <circle cx="16" cy="7.5" r=".6" fill="currentColor" />
    </>
  ),
  heart: (
    <>
      <path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10Z" />
      <path d="M9 11.5c.8-1 2-1 3 0 1-1 2.2-1 3 0" opacity=".7" />
    </>
  ),
  duck: (
    <>
      <circle cx="15.5" cy="6.5" r="2.7" />
      <path d="M18 6.6 21.3 7.4 18 8.4" />
      <path d="M13.6 8.6c-.8 1.9-1.9 3-3.6 3H6c-1.7 0-3 1.2-3 2.8C3 17.2 6.5 19 11 19s8.5-1.8 8.5-4.8c0-1.8-1-3-2.6-3.6" />
      <path d="M7.5 14.5c2 1 4.5 1 6.5-.5" opacity=".7" />
      <circle cx="16.2" cy="6" r=".5" fill="currentColor" />
      <path d="M2.5 21.5c1.5 0 1.5-.8 3-.8s1.5.8 3 .8 1.5-.8 3-.8 1.5.8 3 .8 1.5-.8 3-.8 1.5.8 3 .8" opacity=".6" />
    </>
  ),
  gull: (
    <>
      <path d="M2.5 13c3.2-2.8 6.6-2.4 9.5 2.2 2.9-4.6 6.3-5 9.5-2.2" />
      <path d="M12 15.2v1.8" />
      <path d="M13.5 6.5c1.3-1.1 2.7-.9 3.8.9 1.1-1.8 2.5-2 3.8-.9" opacity=".65" />
      <path d="M4 7.5c.9-.8 1.9-.6 2.6.6.7-1.2 1.7-1.4 2.6-.6" opacity=".45" />
    </>
  ),
  nest: (
    <>
      <ellipse cx="9" cy="11.5" rx="2.3" ry="3" />
      <ellipse cx="15" cy="11.5" rx="2.3" ry="3" />
      <ellipse cx="12" cy="10.5" rx="2.3" ry="3" />
      <path d="M3 13.5c0 4 4 6.5 9 6.5s9-2.5 9-6.5" />
      <path d="M3 13.5h18M5 16.5l3-1.5M10 18l3-2M15 17.5l3-2" opacity=".7" />
    </>
  ),
  lock: (
    <>
      <rect x="5.5" y="10.5" width="13" height="10" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z" />
      <circle cx="12" cy="10" r="2.4" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15" />
    </>
  ),
  share: (
    <>
      <path d="M12 15V4M8 7.5 12 3.5l4 4" />
      <path d="M7 11H5.5a1 1 0 0 0-1 1v7.5a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1V12a1 1 0 0 0-1-1H17" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type GlyphName = keyof typeof GLYPHS

export function Glyph({ name, ...rest }: IconProps & { name: GlyphName }) {
  return <Icon {...rest}>{GLYPHS[name]}</Icon>
}
