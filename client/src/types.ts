export type OrderStatus = "pending" | "paid" | "delivered" | "cancelled";
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

export interface VariantItem {
  variantId: string;
  title: string;
  attributes: Record<string, string>;
  price: number;
  mrp: number;
  stockQuantity: number;
  isActive: boolean;
}

export interface Seller {
  _id: string;
  slug: string;
  businessName: string;
  businessCategory?: string;
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
  approvalStatus: "draft" | "pending" | "approved" | "rejected";
  storePublished?: boolean;
  publishRequestedAt?: string | null;
  approvedAt?: string | null;
  approvedBy?: string;
  termsAcceptedAt?: string | null;
  createdAt?: string;
  idProofUrl?: string;
  addressProofUrl?: string;
}

export interface Product {
  _id: string;
  seller: Seller | string;
  title: string;
  category: string;
  description: string;
  imageUrl: string;
  imageUrls?: string[];
  notes: string;
  mrp: number;
  price: number; // selling price
  variants: ProductVariant[];
  variantItems?: VariantItem[];
  variantPrices?: Record<string, number>;
  variantMrps?: Record<string, number>;
  variantQuantities?: Record<string, number>;
  isActive: boolean;
  createdAt: string;
}

export interface OrderItem {
  product: Product | string;
  productTitle: string;
  productCategory: string;
  productImageUrl: string;
  variantId: string;
  variantTitle: string;
  selectedVariants: Record<string, string>;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface Order {
  _id: string;
  seller: string;
  product: Product | null;
  items: OrderItem[];
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
