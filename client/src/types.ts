export type OrderStatus = "pending" | "paid" | "confirmed" | "cancelled";
export type PaymentMode = "prepaid_only" | "cod_only" | "both";
export type PaymentMethod = "prepaid" | "cod";

export interface SocialLink {
  platform: string;
  url: string;
}

export interface Banner {
  imageUrl: string;
  title?: string;
}

export interface ProductVariant {
  label: string;   // "Size", "Color", etc.
  options: string[]; // ["S","M","L"]
}

export interface Seller {
  _id: string;
  slug: string;
  businessName: string;
  phone: string;
  businessEmail: string;
  upiId: string;
  profileImageUrl: string;
  businessLogo: string;
  favicon: string;
  businessAddress: string;
  businessGST: string;
  whatsappNumber: string;
  callNumber: string;
  socialLinks: SocialLink[];
  banners: Banner[];
  categories: string[];
  deliveryMode: "always_free" | "flat_rate";
  defaultDeliveryCharge: number;
  freeDeliveryThreshold: number;
  paymentMode: PaymentMode;
  privacyPolicy: string;
  returnRefundPolicy: string;
  termsAndConditions: string;
  approvalStatus: "pending" | "approved" | "rejected";
  approvedAt?: string | null;
  approvedBy?: string;
  createdAt?: string;
}

export interface Product {
  _id: string;
  seller: Seller | string;
  title: string;
  category: string;
  description: string;
  imageUrl: string;
  notes: string;
  mrp: number;
  price: number; // selling price
  variants: ProductVariant[];
  variantPrices?: Record<string, number>;
  variantMrps?: Record<string, number>;
  variantQuantities?: Record<string, number>;
  isActive: boolean;
  createdAt: string;
}

export interface Order {
  _id: string;
  seller: string;
  product: Product;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  note: string;
  amount: number;
  quantity: number;
  deliveryCharge: number;
  selectedVariants: Record<string, string>;
  paymentMethod: PaymentMethod;
  paymentStatus: OrderStatus;
  paymentScreenshotUrl: string;
  createdAt: string;
}
