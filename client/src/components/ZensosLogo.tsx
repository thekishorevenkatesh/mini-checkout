export const ZENSOS_LOGO_LIGHT = "/zensos-logo.png";
export const ZENSOS_LOGO_DARK = "/zensos-logo-1.png";

type ZensosLogoSize = "sm" | "md" | "lg";

/** Fixed box per size so light/dark assets never shift layout on theme change. */
const LOGO_BOX: Record<ZensosLogoSize, string> = {
  sm: "h-6 w-[5.5rem]",
  md: "h-10 w-[8.75rem]",
  lg: "h-11 w-[9.5rem]",
};

type ZensosLogoProps = {
  size?: ZensosLogoSize;
  className?: string;
  alt?: string;
};

/**
 * Theme-aware Zensos mark in a fixed-size frame. Both PNGs are centered with
 * object-contain inside the same box so switching themes does not resize the UI.
 */
export function ZensosLogo({ size = "md", className = "", alt = "Zensos" }: ZensosLogoProps) {
  const boxClass = LOGO_BOX[size];

  return (
    <span
      className={`relative inline-block shrink-0 overflow-hidden ${boxClass} ${className}`.trim()}
      role="img"
      aria-label={alt}
    >
      <img
        src={ZENSOS_LOGO_LIGHT}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-contain object-left dark:hidden"
        decoding="async"
      />
      <img
        src={ZENSOS_LOGO_DARK}
        alt=""
        aria-hidden
        className="absolute inset-0 hidden h-full w-full object-contain object-left dark:block"
        decoding="async"
      />
    </span>
  );
}
