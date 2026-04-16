# Mini-Checkout — Complete Codebase Walkthrough

> **Project:** Vendor-First Mini Checkout MVP  
> **Stack:** React 19 + TypeScript + Tailwind (client) · Node.js + Express 5 + MongoDB (server)  
> **Deploy target:** Vercel (two separate projects — client SPA, server serverless)

---

## 1. Repository Layout

```
mini-checkout/
├── client/          ← Vite + React SPA (seller dashboard + public store)
│   └── src/
│       ├── api/client.ts        ← Axios instance + token helper
│       ├── context/AuthContext.tsx  ← Global auth state (seller + token)
│       ├── components/ProtectedRoute.tsx
│       ├── pages/
│       │   ├── LoginPage.tsx        ← Login + Registration flow (OTP)
│       │   ├── DashboardPage.tsx    ← Full seller dashboard (6 tabs)
│       │   └── PublicStorePage.tsx  ← Customer-facing store + checkout
│       ├── types.ts             ← Shared TypeScript interfaces
│       └── App.tsx              ← React Router routes
└── server/          ← Express API
    ├── api/index.js             ← Vercel serverless entry-point
    └── src/
        ├── server.js            ← Local dev entry (connectDB + listen)
        ├── app.js               ← Express app + CORS + route mounts
        ├── config/db.js         ← Mongoose connect (singleton)
        ├── middleware/auth.js   ← JWT Bearer token guard
        ├── models/
        │   ├── Seller.js
        │   ├── Product.js
        │   └── Order.js
        ├── routes/
        │   ├── authRoutes.js    ← OTP auth + seller profile CRUD
        │   ├── productRoutes.js ← Product CRUD + public listing
        │   ├── orderRoutes.js   ← Order lifecycle + CSV export
        │   └── storeRoutes.js   ← Store config (banners, social, categories)
        └── utils/
            ├── otp.js           ← 6-digit OTP generator + SHA-256 hash helpers
            ├── slug.js          ← URL-safe slug generator
            └── mailer.js        ← Nodemailer SMTP (disabled in demo)
```

---

## 2. Data Models

### `Seller` (MongoDB)
| Field | Type | Notes |
|---|---|---|
| `slug` | String (unique, indexed) | URL-safe store identifier |
| `businessName` | String (required) | Display name |
| `phone` | String (unique, required) | Login identifier |
| `businessEmail` | String | Optional email |
| `upiId` | String | UPI payment ID |
| `businessAddress` | String | Shown on public store |
| `businessGST` | String | Optional GST number |
| `profileImageUrl` | String | Seller avatar |
| `businessLogo` | String | Store logo URL |
| `favicon` | String | Favicon URL |
| `whatsappNumber` | String | WhatsApp CTA |
| `callNumber` | String | Call CTA |
| `socialLinks` | `[{ platform, url }]` | Social media links |
| `banners` | `[{ imageUrl, title }]` | Store hero banners |
| `categories` | `[String]` | Product category tags |
| `otp` / `otpExpiry` | String / Date | **Transient** — cleared after verify |

### `Product` (MongoDB)
| Field | Type | Notes |
|---|---|---|
| `seller` | ObjectId → Seller | Owner ref |
| `title` | String (required) | Product name |
| `category` | String | Matches a seller category |
| `description` | String | Short description |
| `imageUrl` | String | Product image |
| `notes` | String | Extra info (delivery, pickup, etc.) |
| `mrp` | Number | Original price for discount badge |
| `price` | Number (required) | Selling price |
| `variants` | `[{ label, options[] }]` | e.g. Size: [S, M, L] |
| `isActive` | Boolean | Show/hide on public store |

### `Order` (MongoDB)
| Field | Type | Notes |
|---|---|---|
| `seller` | ObjectId → Seller | Owner ref |
| `product` | ObjectId → Product | What was ordered |
| `customerName` | String (required) | |
| `customerPhone` | String (required) | |
| `deliveryAddress` | String | |
| `note` | String | Special instructions |
| `amount` | Number | `price × quantity` |
| `quantity` | Number | |
| `deliveryCharge` | Number | Added by customer at checkout |
| `selectedVariants` | `Map<String,String>` | e.g. `{ "Size": "M" }` |
| `paymentStatus` | `pending\|paid\|confirmed\|cancelled` | Managed by seller |
| `paymentScreenshotUrl` | String | Customer submits proof URL |

---

## 3. Server API Reference

### Auth — `/api/auth`
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/send-otp` | ❌ | Generate OTP for phone/email; returns OTP in demo mode |
| POST | `/verify-otp` | ❌ | Verify OTP → returns JWT token + seller |
| POST | `/register` | ✅ | Complete new seller profile post-OTP |
| GET | `/me` | ✅ | Fetch current seller profile |
| PUT | `/me` | ✅ | Update seller profile fields |

### Products — `/api/products`
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/` | ✅ | Create product (auto-adds category to seller) |
| GET | `/my` | ✅ | Fetch seller's own products |
| GET | `/public/:sellerSlug` | ❌ | Public: returns seller + active products |
| PATCH | `/:id/toggle` | ✅ | Toggle `isActive` |
| PUT | `/:id` | ✅ | Update product fields |
| DELETE | `/:id` | ✅ | Delete product |

### Orders — `/api/orders`
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/` | ❌ | Customer places order (no auth — public) |
| GET | `/my` | ✅ | Seller fetches all orders (with product populated) |
| GET | `/my/report?days=N` | ✅ | Aggregated stats: total orders, revenue, top products |
| GET | `/my/export` | ✅ | CSV download of all orders |
| PATCH | `/:id/status` | ✅ | Seller updates order status |
| PATCH | `/:id/payment-screenshot` | ❌ | Customer submits payment proof URL |

### Store — `/api/store`
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/public/:sellerSlug` | ❌ | Fetch seller store config (no OTP fields) |
| PUT | `/options` | ✅ | Update banners, social links, categories, branding |

---

## 4. Authentication Flow

```
Phone → POST /auth/send-otp
         ↓ (seller pre-created if new)
         ↓ OTP stored plain in DB (demo mode — no email sent)
         ↓ OTP returned in API response (shown in UI amber box)
OTP   → POST /auth/verify-otp
         ↓ Compare plain OTP, clear after match
         ↓ Returns JWT (7-day expiry) + seller object + isProfileComplete flag
         ↓
         ├─ isProfileComplete=true  → Navigate to /dashboard
         └─ isProfileComplete=false → "Complete Profile" step (Step 3 in login flow)
                                      OR auto-complete from Register form fields
```

> [!NOTE]
> The `otp.js` utility defines `hashOtp` / `verifyOtp` (SHA-256) but they are **not used** in `authRoutes.js` — the current demo stores and compares the OTP in plain text. Hashing is ready to be switched on for production.

> [!IMPORTANT]
> The SMTP mailer (`mailer.js`) is fully coded but **commented out** in `authRoutes.js`. Enabling it requires setting `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` in `server/.env`.

---

## 5. Client Architecture

### Routing (`App.tsx`)
```
/                   → redirect to /dashboard
/login              → LoginPage (public)
/dashboard          → DashboardPage (ProtectedRoute — requires JWT in localStorage)
/store/:sellerSlug  → PublicStorePage (public — no auth)
*                   → redirect to /dashboard
```

### Auth State (`AuthContext.tsx`)
- Persists `token` + `seller` in `localStorage` under keys `vendor_mvp_token` / `vendor_mvp_seller`
- On boot: calls `GET /auth/me` to refresh seller data
- Exposes: `sendOtp`, `verifyOtp`, `register`, `logout`, `refreshProfile`, `updateProfile`
- Axios instance in `api/client.ts` uses `VITE_API_BASE_URL` (fallback: `localhost:5000/api`)

### `LoginPage.tsx` — Multi-step form
| Mode | Steps |
|---|---|
| **Login** | 1. Phone/email → 2. OTP verify → 3. Complete profile (only if new) |
| **Register** | 1. Phone + full business details → 2. OTP verify + auto-register |

- Dev OTP amber box shown when API returns OTP in response
- "Back" button resets to contact step
- After register/login redirect to `/dashboard`

---

## 6. Dashboard — 6 Tabs

| Tab | Key Feature |
|---|---|
| **📊 Dashboard** | Stats cards (products, orders, pending, confirmed), revenue (7d / 30d), public store link with copy button |
| **🏪 Store Options** | Branding (logo, favicon, WhatsApp, call), Banner management (add/remove with preview), Social links (platform + URL), Category tags — all saved via `PUT /store/options` |
| **📦 Products** | Add product form (title, price, MRP, category, image URL, description, notes, variants), product catalog with activate/deactivate + delete |
| **🧾 Orders** | Responsive table (desktop) + card list (mobile); shows customer, product, variants, delivery address, payment proof link, status dropdown to update |
| **📈 Reports** | 7-day / 30-day toggle; total orders + revenue; top-selling products ranked by units sold; CSV export button |
| **👤 Profile** | Edit businessName, email, UPI ID, address, GST, logo URL, favicon URL |

---

## 7. Public Store Page (`/store/:slug`)

### Left panel — Store + Products
- Store header: logo, business name, address, WhatsApp/call CTAs, social links
- Auto-play banner carousel (4-second interval, dot navigation)
- Category filter tabs (derived from product list)
- Product grid: image, title, category badge, price + MRP + discount %, description, notes
- Add to Cart → qty stepper + variant selectors (appear after add), Remove button

### Right panel — Checkout (sticky on desktop)
- Order summary: line items, delivery charge (editable), grand total
- UPI payment: seller's UPI ID displayed, QR code (`qrcode.react`), "Pay via UPI" deep-link, Copy UPI intent link
- Order form: name, phone, delivery address, note → `POST /orders` for each cart item (parallel)
- **After order placed**: payment screenshot URL input → `PATCH /orders/:id/payment-screenshot`

---

## 8. Key Design Decisions & Current State

| Topic | Current State |
|---|---|
| **OTP delivery** | Demo mode — OTP returned in API JSON and shown in UI. SMTP code exists but is disabled. |
| **OTP hashing** | Utility functions exist but plain text comparison is used in routes. |
| **JWT expiry** | 7 days — no refresh token mechanism yet |
| **Image uploads** | All images (logo, banner, product, payment proof) are **URL strings** only — no file upload/hosting |
| **Multi-product cart** | ✅ Customer can add multiple products; one order record per product |
| **Variants** | ✅ Seller defines label+options; customer picks before checkout |
| **Delivery charge** | Customer sets their own delivery charge at checkout (not controlled by seller) |
| **Payment** | UPI deep-link + QR code; seller manually confirms via dashboard status update |
| **Category sync** | When a product is created/updated with a category, it's auto-added to `seller.categories` |
| **CORS** | `origin: "*"` — wide open for development; restrict for production |
| **bcryptjs** | Listed in server dependencies but not used anywhere currently |

---

## 9. Environment Variables

### `server/.env`
```
MONGO_URI=mongodb://...
JWT_SECRET=your_secret
SMTP_HOST=smtp.gmail.com     # optional — for email OTP
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=yourpassword
```

### `client/.env`
```
VITE_API_BASE_URL=http://localhost:5000/api
```

---

## 10. Known Gaps / What's Missing

| Gap | Notes |
|---|---|
| No product editing UI | `PUT /products/:id` API exists but no edit form in Dashboard |
| No email/SMS OTP | SMTP wired but disabled; no SMS provider integrated |
| No image file upload | All images require external hosted URLs |
| No delivery charge control by seller | Charge is entered by the customer |
| No pagination | Orders/products fetch all records at once |
| No stock management | No inventory count on products |
| No customer accounts | Guest checkout only — customer data in order fields |
| No real-time updates | Dashboard requires manual refresh to see new orders |
| bcryptjs imported but unused | Likely leftover from planned password auth |
