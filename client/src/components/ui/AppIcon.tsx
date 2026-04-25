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
  | "language";

const ICON_CLASS_MAP: Record<AppIconName, string> = {
  brand: "fi fi-br-store-alt",
  dashboard: "fi fi-br-dashboard",
  store: "fi fi-br-store-buyer",
  products: "fi fi-br-box-open",
  orders: "fi fi-br-receipt",
  reports: "fi fi-br-chart-line-up",
  profile: "fi fi-br-circle-user",
  policies: "fi fi-br-shield-check",
  search: "fi fi-br-search",
  filter: "fi fi-br-filter",
  close: "fi fi-br-cross-small",
  chevronLeft: "fi fi-br-angle-small-left",
  chevronRight: "fi fi-br-angle-small-right",
  upload: "fi fi-br-file-upload",
  download: "fi fi-br-download",
  share: "fi fi-br-paper-plane",
  refresh: "fi fi-br-refresh",
  edit: "fi fi-br-pencil",
  trash: "fi fi-br-trash",
  cart: "fi fi-br-shopping-cart",
  pending: "fi fi-br-hourglass-end",
  check: "fi fi-br-check",
  active: "fi fi-br-badge-check",
  inactive: "fi fi-br-circle-xmark",
  whatsapp: "fi fi-brands-whatsapp",
  phone: "fi fi-br-phone-call",
  instagram: "fi fi-brands-instagram",
  facebook: "fi fi-brands-facebook",
  twitter: "fi fi-brands-twitter",
  youtube: "fi fi-brands-youtube",
  linkedin: "fi fi-brands-linkedin",
  website: "fi fi-br-globe",
  location: "fi fi-br-map-marker",
  link: "fi fi-br-link",
  login: "fi fi-br-key",
  register: "fi fi-br-rocket",
  logout: "fi fi-br-arrow-right-to-bracket",
  sun: "fi fi-br-sun",
  moon: "fi fi-br-moon-stars",
  language: "fi fi-br-globe",
};

type AppIconProps = {
  name: AppIconName;
  className?: string;
};

export function AppIcon({ name, className = "" }: AppIconProps) {
  return <i aria-hidden="true" className={`${ICON_CLASS_MAP[name]} app-icon ${className}`.trim()} />;
}
