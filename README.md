# MyDukan 🛍️

> **Your Store. Your Link. Your Sales.**

MyDukan is a free platform for small sellers and home businesses to create their own online store in minutes — no technical knowledge needed. Share your store link on WhatsApp, accept UPI payments, and manage orders from a clean dashboard.

---

## ✨ What MyDukan Does

| For Sellers | For Customers |
|---|---|
| Register with phone number | Browse products on a public store link |
| Add products with images, variants, MRP & price | Add to cart, select variants, pay via UPI |
| Get a shareable store link (e.g. `/store/my-shop`) | Submit payment screenshot as proof |
| Manage orders — track status, view payment proof | — |
| Customise store: banners, social links, delivery charge | — |
| View sales reports & export CSV | — |

---

## 🛠️ Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + TypeScript + Tailwind CSS + Vite |
| Backend | Node.js + Express 5 + MongoDB (Mongoose) |
| Auth | Phone OTP (demo mode) → JWT (7-day) |
| Payments | UPI deep-link + QR code |
| Images | ImgBB free API (optional) |
| Deploy | Vercel (two projects — client SPA + server serverless) |

---

## 📁 Project Structure

```
mydukan/
├── client/    ← Vite + React SPA
│   └── src/
│       ├── pages/LoginPage.tsx         ← OTP login + registration
│       ├── pages/DashboardPage.tsx     ← Seller dashboard (6 tabs)
│       └── pages/PublicStorePage.tsx   ← Customer store + checkout
└── server/    ← Express API
    └── src/
        ├── models/   Seller, Product, Order
        ├── routes/   auth, products, orders, store
        └── utils/    otp, slug, mailer
```

---

## 🚀 Run Locally

### 1. Install dependencies
```bash
cd client && npm install
cd ../server && npm install
```

### 2. Configure server
```bash
cd server
copy .env.example .env
# Edit .env — set MONGO_URI and JWT_SECRET
```

### 3. Configure client
```bash
cd client
copy .env.example .env
# Optional: add VITE_IMGBB_API_KEY for image uploads
```

### 4. Start
```bash
# Terminal 1 — API server
cd server && npm run dev

# Terminal 2 — React app
cd client && npm run dev
```

### Demo URLs
| Page | URL |
|---|---|
| Seller Login / Register | `http://localhost:5173/login` |
| Seller Dashboard | `http://localhost:5173/dashboard` |
| Public Store | `http://localhost:5173/store/<seller-slug>` |

---

## 🔑 Environment Variables

### `server/.env`
```env
PORT=5000
MONGO_URI=mongodb://...          # MongoDB Atlas or local
JWT_SECRET=your_strong_secret

# Optional — enable email OTP (currently in demo mode)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx   # Gmail App Password
```

### `client/.env`
```env
VITE_API_BASE_URL=/api           # Dev (uses Vite proxy)
# VITE_API_BASE_URL=https://your-backend.vercel.app/api  ← Production

# Optional — free image hosting (get key at https://api.imgbb.com)
VITE_IMGBB_API_KEY=your_key_here
```

---

## ☁️ Deploy on Vercel

MyDukan deploys as **two separate Vercel projects** from the same repo.

### Backend (Node.js Serverless)
1. New Vercel project → Root Directory: `server`
2. Framework preset: **Other**
3. Environment variables: `MONGO_URI`, `JWT_SECRET`
4. Deploy → note your backend URL

### Frontend (Vite SPA)
1. New Vercel project → Root Directory: `client`
2. Framework preset: **Vite**
3. Environment variable: `VITE_API_BASE_URL=https://your-backend.vercel.app/api`
4. Deploy

---

## 📦 Features at a Glance

- ✅ Phone OTP login & new seller registration
- ✅ Product management — add, edit, toggle active, delete
- ✅ Product variants (Size, Color, etc.)
- ✅ MRP + Selling price with discount badge
- ✅ Product categories with filter tabs on store
- ✅ Store customisation — logo, favicon, banners (carousel), social links
- ✅ Seller-controlled delivery charge (fixed for customers)
- ✅ UPI QR code + deep-link payment
- ✅ Customer submits payment screenshot URL
- ✅ Seller updates order status (pending → paid → confirmed → cancelled)
- ✅ Real-time order refresh (auto-polls every 30s on Orders tab)
- ✅ Sales report — 7d / 30d, top products, revenue
- ✅ CSV order export
- ✅ Image upload via ImgBB (free)
- ✅ Fully responsive (mobile + desktop)

---

*MyDukan — Apni Dukan, Online.* 🛍️
