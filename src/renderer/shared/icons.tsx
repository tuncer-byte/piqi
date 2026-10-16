import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ children, size = 14, strokeWidth = 2, ...props }: IconProps & { children: ReactNode }): ReactNode {
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
      {...props}
    >
      {children}
    </svg>
  )
}

export const ThumbUp = (p: IconProps): ReactNode => (
  <Icon {...p}>
    <path d="M7 11v9H4v-9zM7 11l4-8c1.5 0 2.5 1 2.5 2.5V9H19a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 17.8 20H7" />
  </Icon>
)

export const ThumbDown = (p: IconProps): ReactNode => (
  <Icon {...p}>
    <path d="M17 13V4h3v9zM17 13l-4 8c-1.5 0-2.5-1-2.5-2.5V15H5a2 2 0 0 1-2-2.3l1.2-7A2 2 0 0 1 6.2 4H17" />
  </Icon>
)

export const Pin = (p: IconProps): ReactNode => (
  <Icon {...p}>
    <path d="M12 17v5M8 3h8l-1 6 3 4H6l3-4z" />
  </Icon>
)

export const Close = (p: IconProps): ReactNode => (
  <Icon {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
)

export const ChevronDown = (p: IconProps): ReactNode => (
  <Icon strokeWidth={2.4} {...p}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
)

export const ChevronLeft = (p: IconProps): ReactNode => (
  <Icon strokeWidth={2.4} {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Icon>
)

export const ChevronRight = (p: IconProps): ReactNode => (
  <Icon strokeWidth={2.4} {...p}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
)

export const Search = (p: IconProps): ReactNode => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </Icon>
)

export const Mic = (p: IconProps): ReactNode => (
  <Icon {...p}>
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Icon>
)

export const Speaker = (p: IconProps): ReactNode => (
  <Icon {...p}>
    <path d="M11 5 6 9H2v6h4l5 4V5Z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
  </Icon>
)

export const Stop = (p: IconProps): ReactNode => (
  <Icon {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </Icon>
)

export const EyeOff = (p: IconProps): ReactNode => (
  <Icon {...p}>
    <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
    <path d="M4 4l16 16" />
  </Icon>
)

export const Upload = (p: IconProps): ReactNode => (
  <Icon {...p}>
    <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />
  </Icon>
)

export const Shield = (p: IconProps): ReactNode => (
  <Icon {...p}>
    <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />
  </Icon>
)

export const Lock = (p: IconProps): ReactNode => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Icon>
)

export const Accessibility = (p: IconProps): ReactNode => (
  <Icon {...p}>
    <circle cx="12" cy="4" r="2" />
    <path d="M4 8h16M12 8v6M8 22l4-8 4 8" />
  </Icon>
)

export const Waveform = (p: IconProps): ReactNode => (
  <Icon {...p}>
    <path d="M3 12h2M7 8v8M11 5v14M15 8v8M19 11v2" />
  </Icon>
)

export const Play = (p: IconProps): ReactNode => (
  <Icon {...p}>
    <path d="M7 4v16l13-8z" />
  </Icon>
)

export const ArrowLeft = (p: IconProps): ReactNode => (
  <Icon {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
)

export const Check = (p: IconProps): ReactNode => (
  <Icon strokeWidth={2.4} {...p}>
    <path d="M5 12l5 5L20 7" />
  </Icon>
)

export const Plus = (p: IconProps): ReactNode => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const Trash = (p: IconProps): ReactNode => (
  <Icon {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </Icon>
)

export const Pencil = (p: IconProps): ReactNode => (
  <Icon {...p}>
    <path d="m15 5 4 4M4 20l4.5-1 10-10a2.12 2.12 0 0 0-3-3l-10 10L4 20Z" />
  </Icon>
)
