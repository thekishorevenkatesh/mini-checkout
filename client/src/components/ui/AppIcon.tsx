import type { ReactElement, SVGProps } from "react";

type AppIconName =
  | "brand"
  | "dashboard"
  | "store"
  | "products"
  | "orders"
  | "reports"
  | "profile"
  | "policies"
  | "search"
  | "filter"
  | "close"
  | "chevronLeft"
  | "chevronRight"
  | "upload"
  | "download"
  | "share"
  | "refresh"
  | "edit"
  | "trash"
  | "cart"
  | "pending"
  | "check"
  | "active"
  | "inactive"
  | "whatsapp"
  | "phone"
  | "instagram"
  | "facebook"
  | "twitter"
  | "youtube"
  | "linkedin"
  | "website"
  | "location"
  | "link"
  | "login"
  | "register"
  | "logout"
  | "sun"
  | "moon"
  | "earnings"
  | "language";

type IconProps = {
  className?: string;
};

function IconBase({
  className = "",
  children,
  viewBox = "0 0 24 24",
}: SVGProps<SVGSVGElement> & { className?: string; viewBox?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox={viewBox}
      className={`app-icon ${className}`.trim()}
    >
      {children}
    </svg>
  );
}

const iconMap: Record<AppIconName, (props: IconProps) => ReactElement> = {
  brand: ({ className }) => (
    <IconBase className={className}>
      <path d="M4 10.5 12 6l8 4.5" />
      <path d="M5.5 10.5V18a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-7.5" />
      <path d="M9 19v-5h6v5" />
    </IconBase>
  ),
  dashboard: ({ className }) => (
    <IconBase className={className}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="5" rx="1.5" />
      <rect x="13" y="11" width="7" height="9" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
    </IconBase>
  ),
  store: ({ className }) => (
    <IconBase className={className}>
      <path d="M5 9.5h14" />
      <path d="M6 9.5V19h12V9.5" />
      <path d="M4 9.5 5.5 5h13L20 9.5" />
      <path d="M10 13h4" />
    </IconBase>
  ),
  products: ({ className }) => (
    <IconBase className={className}>
      <path d="m12 3 8 4.5-8 4.5L4 7.5 12 3Z" />
      <path d="M4 7.5V16l8 5 8-5V7.5" />
      <path d="M12 12v9" />
    </IconBase>
  ),
  orders: ({ className }) => (
    <IconBase className={className}>
      <path d="M7 4h10l2 3v13H5V7l2-3Z" />
      <path d="M9 9h6" />
      <path d="M9 13h6" />
      <path d="M9 17h3" />
    </IconBase>
  ),
  reports: ({ className }) => (
    <IconBase className={className}>
      <path d="M5 19V9" />
      <path d="M10 19V5" />
      <path d="M15 19v-7" />
      <path d="M20 19v-11" />
    </IconBase>
  ),
  profile: ({ className }) => (
    <IconBase className={className}>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5 19a7 7 0 0 1 14 0" />
    </IconBase>
  ),
  policies: ({ className }) => (
    <IconBase className={className}>
      <path d="M12 3 6 5v6c0 4.5 2.4 7.2 6 10 3.6-2.8 6-5.5 6-10V5l-6-2Z" />
      <path d="m9.5 12 1.7 1.7L14.8 10" />
    </IconBase>
  ),
  search: ({ className }) => (
    <IconBase className={className}>
      <circle cx="11" cy="11" r="5.5" />
      <path d="m16 16 4 4" />
    </IconBase>
  ),
  filter: ({ className }) => (
    <IconBase className={className}>
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </IconBase>
  ),
  close: ({ className }) => (
    <IconBase className={className}>
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </IconBase>
  ),
  chevronLeft: ({ className }) => (
    <IconBase className={className}>
      <path d="m14.5 6-6 6 6 6" />
    </IconBase>
  ),
  chevronRight: ({ className }) => (
    <IconBase className={className}>
      <path d="m9.5 6 6 6-6 6" />
    </IconBase>
  ),
  upload: ({ className }) => (
    <IconBase className={className}>
      <path d="M12 16V5" />
      <path d="m8 9 4-4 4 4" />
      <path d="M5 19h14" />
    </IconBase>
  ),
  download: ({ className }) => (
    <IconBase className={className}>
      <path d="M12 5v11" />
      <path d="m8 12 4 4 4-4" />
      <path d="M5 19h14" />
    </IconBase>
  ),
  share: ({ className }) => (
    <IconBase className={className}>
      <circle cx="18" cy="5" r="2" />
      <circle cx="6" cy="12" r="2" />
      <circle cx="18" cy="19" r="2" />
      <path d="m8 12 8-6" />
      <path d="m8 12 8 6" />
    </IconBase>
  ),
  refresh: ({ className }) => (
    <IconBase className={className}>
      <path d="M20 11a8 8 0 0 0-13.7-5.6L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 13.7 5.6L20 16" />
      <path d="M20 20v-4h-4" />
    </IconBase>
  ),
  edit: ({ className }) => (
    <IconBase className={className}>
      <path d="m4 20 4-.8L18 9.2 14.8 6 4.8 16Z" />
      <path d="m13.8 7 3.2 3.2" />
    </IconBase>
  ),
  trash: ({ className }) => (
    <IconBase className={className}>
      <path d="M5 7h14" />
      <path d="M9 7V5h6v2" />
      <path d="M7 7l1 12h8l1-12" />
    </IconBase>
  ),
  cart: ({ className }) => (
    <IconBase className={className}>
      <circle cx="9" cy="19" r="1.4" />
      <circle cx="17" cy="19" r="1.4" />
      <path d="M4 5h2l2.1 9.2a1 1 0 0 0 1 .8h7.9a1 1 0 0 0 1-.8L20 8H7" />
    </IconBase>
  ),
  pending: ({ className }) => (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l2.5 2.5" />
    </IconBase>
  ),
  check: ({ className }) => (
    <IconBase className={className}>
      <path d="m5 12 4.2 4.2L19 6.5" />
    </IconBase>
  ),
  active: ({ className }) => (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="m8.7 12 2.2 2.2 4.4-4.4" />
    </IconBase>
  ),
  inactive: ({ className }) => (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="m9 9 6 6" />
      <path d="m15 9-6 6" />
    </IconBase>
  ),
  whatsapp: ({ className }) => (
    <IconBase className={className}>
      <path d="M12 4a7 7 0 0 0-6 10.7L5 20l5-1a7 7 0 1 0 2-15Z" />
      <path d="M9.5 9.5c.4 1.5 1.6 3 3 4 .8.6 1.4.8 2 .4l.7-.5" />
    </IconBase>
  ),
  phone: ({ className }) => (
    <IconBase className={className}>
      <path d="M6.6 5.7c.8-.8 2-.8 2.8 0l1.3 1.3c.6.6.8 1.5.4 2.3l-.7 1.3a14.5 14.5 0 0 0 3 3l1.3-.7c.8-.4 1.7-.2 2.3.4l1.3 1.3c.8.8.8 2 0 2.8l-.8.8c-.9.9-2.2 1.3-3.4 1A17.8 17.8 0 0 1 5.8 9.8c-.3-1.2.1-2.5 1-3.4l-.2-.7Z" />
    </IconBase>
  ),
  instagram: ({ className }) => (
    <IconBase className={className}>
      <rect x="5" y="5" width="14" height="14" rx="4" />
      <circle cx="12" cy="12" r="3.2" />
      <circle cx="16.4" cy="7.6" r=".8" />
    </IconBase>
  ),
  facebook: ({ className }) => (
    <IconBase className={className}>
      <path d="M14 8h2V5.5h-2c-2 0-3.5 1.5-3.5 3.5V11H8v2.5h2.5V19H13v-5.5h2.5L16 11H13V9c0-.6.4-1 1-1Z" />
    </IconBase>
  ),
  twitter: ({ className }) => (
    <IconBase className={className}>
      <path d="M4.5 6.5c2.6 3.7 5.5 5.5 8.7 5.6h.3A7.7 7.7 0 0 0 19 6.8c-.7.3-1.3.5-2 .6.7-.4 1.3-1 1.6-1.8-.7.4-1.5.7-2.3.9A3.3 3.3 0 0 0 10.8 9c0 .3 0 .6.1.9-2.5-.1-4.7-1.3-6.2-3.4-.3.5-.4 1-.4 1.7 0 1.1.6 2.1 1.5 2.7-.5 0-1-.1-1.5-.4 0 1.6 1.1 3 2.6 3.3-.3.1-.7.1-1 .1h-.7c.5 1.3 1.8 2.2 3.3 2.2A6.8 6.8 0 0 1 4 17.6a9.6 9.6 0 0 0 5.2 1.5c6.3 0 9.7-5.2 9.7-9.7v-.4c.6-.5 1.2-1.1 1.6-1.8" />
    </IconBase>
  ),
  youtube: ({ className }) => (
    <IconBase className={className}>
      <rect x="4" y="7" width="16" height="10" rx="3" />
      <path d="m10 10 5 2-5 2Z" />
    </IconBase>
  ),
  linkedin: ({ className }) => (
    <IconBase className={className}>
      <rect x="5" y="9" width="3" height="10" rx="1" />
      <circle cx="6.5" cy="6.5" r="1" />
      <path d="M11 19v-6a2.5 2.5 0 0 1 5 0v6" />
      <path d="M11 11h3" />
    </IconBase>
  ),
  website: ({ className }) => (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16" />
      <path d="M12 4c2.2 2.4 3.3 5 3.3 8S14.2 17.6 12 20" />
      <path d="M12 4c-2.2 2.4-3.3 5-3.3 8S9.8 17.6 12 20" />
    </IconBase>
  ),
  location: ({ className }) => (
    <IconBase className={className}>
      <path d="M12 20s6-5.8 6-10a6 6 0 1 0-12 0c0 4.2 6 10 6 10Z" />
      <circle cx="12" cy="10" r="2.3" />
    </IconBase>
  ),
  link: ({ className }) => (
    <IconBase className={className}>
      <path d="M10 14 8 16a3 3 0 1 1-4.2-4.2L6 9.6" />
      <path d="m14 10 2-2a3 3 0 1 1 4.2 4.2L18 14.4" />
      <path d="m9 15 6-6" />
    </IconBase>
  ),
  login: ({ className }) => (
    <IconBase className={className}>
      <path d="M10 6H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
      <path d="m13 8 4 4-4 4" />
      <path d="M10 12h7" />
    </IconBase>
  ),
  register: ({ className }) => (
    <IconBase className={className}>
      <circle cx="9" cy="8" r="3" />
      <path d="M4.5 18a4.5 4.5 0 0 1 9 0" />
      <path d="M18 8v6" />
      <path d="M15 11h6" />
    </IconBase>
  ),
  logout: ({ className }) => (
    <IconBase className={className}>
      <path d="M14 6h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3" />
      <path d="m10 8-4 4 4 4" />
      <path d="M17 12H6" />
    </IconBase>
  ),
  sun: ({ className }) => (
    <IconBase className={className}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2" />
      <path d="M12 19.5v2" />
      <path d="m4.9 4.9 1.4 1.4" />
      <path d="m17.7 17.7 1.4 1.4" />
      <path d="M2.5 12h2" />
      <path d="M19.5 12h2" />
      <path d="m4.9 19.1 1.4-1.4" />
      <path d="m17.7 6.3 1.4-1.4" />
    </IconBase>
  ),
  moon: ({ className }) => (
    <IconBase className={className}>
      <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a8 8 0 1 0 9.5 9.5Z" />
    </IconBase>
  ),
  language: ({ className }) => (
    <IconBase className={className}>
      <path d="M4 6h10" />
      <path d="M9 4v2c0 4-1.8 7.4-4.8 9.9" />
      <path d="M7 11c1.4 2 3.3 3.8 5.6 5.2" />
      <path d="M15 10h5" />
      <path d="m16 19 2.5-7 2.5 7" />
      <path d="M16.8 17h3.4" />
    </IconBase>
  ),
  earnings: ({ className }) => (
    <IconBase className={className}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16" cy="14" r="1" />
    </IconBase>
  ),
};

type AppIconProps = {
  name: AppIconName;
  className?: string;
};

export function AppIcon({ name, className = "" }: AppIconProps) {
  const Icon = iconMap[name];
  return <Icon className={className} />;
}
