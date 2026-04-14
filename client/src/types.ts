export type OrderStatus = "pending" | "paid" | "confirmed" | "cancelled";

export interface Seller {
  _id: string;
  slug: string;
  businessName: string;
  phone: string;
  upiId: string;
  profileImageUrl: string;
}

export interface Product {
  _id: string;
  seller: Seller | string;
  title: string;
  description: string;
  imageUrl: string;
  notes: string;
  price: number;
  isActive: boolean;
  createdAt: string;
}

export interface Order {
  _id: string;
  seller: string;
  product: Product;
  customerName: string;
  customerPhone: string;
  note: string;
  amount: number;
  quantity: number;
  paymentStatus: OrderStatus;
  createdAt: string;
}
