import type { StickerDef } from '../lib/stickers'
import { GLYPHS } from './Icons'

interface Props {
  sticker: StickerDef
  locked?: boolean
  size?: number
}

/** Die-cut paper sticker: line-art glyph, name set along the bottom curve. */
export function Sticker({ sticker, locked = false, size = 96 }: Props) {
  const pid = `p-${sticker.id}`
  const [face, ring] = sticker.colors
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label={`${sticker.name}${locked ? ' (locked)' : ''}`}
      className={locked ? 'sticker locked' : 'sticker'}
    >
      <defs>
        <path id={pid} d="M 24 66 A 36 36 0 0 0 96 66" />
      </defs>
      <circle cx="60" cy="60" r="57" fill="#fbf8f0" />
      <circle cx="60" cy="60" r="50" fill={face} />
      <circle cx="60" cy="60" r="50" fill="none" stroke={ring} strokeWidth="3" />
      <circle cx="60" cy="60" r="44" fill="none" stroke={ring} strokeWidth=".8" strokeDasharray="1.5 3" opacity=".7" />
      <g
        transform="translate(38 26) scale(1.85)"
        fill="none"
        stroke={ring}
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        color={ring}
      >
        {GLYPHS[sticker.glyph]}
      </g>
      <text fontSize="9.5" fontWeight="600" fill={ring} letterSpacing="1.6" fontFamily="Jost, sans-serif">
        <textPath href={`#${pid}`} startOffset="50%" textAnchor="middle">
          {sticker.name.toUpperCase()}
        </textPath>
      </text>
      {locked && (
        <g transform="translate(84 84)">
          <circle r="14" fill="#fbf8f0" stroke="#6f6853" strokeWidth="1" />
          <g transform="translate(-8 -8.5) scale(.68)" fill="none" stroke="#6f6853" strokeWidth="2" strokeLinecap="round">
            {GLYPHS.lock}
          </g>
        </g>
      )}
    </svg>
  )
}
