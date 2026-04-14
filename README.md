# Vendor Link Checkout MVP

Vendor-first demo app for small service providers and home businesses.

The MVP flow:
- Seller logs in with phone number
- Seller adds multiple products and gets one store link
- Customer opens store link, selects product, pays via UPI, and submits order
- Seller tracks orders and manually updates payment status

## Stack

- Frontend: React + Tailwind + Vite + TypeScript
- Backend: Node.js + Express + MongoDB (Mongoose)

## Project Structure

- `client` - responsive seller dashboard and public checkout page
- `server` - auth, products, orders API

## Run Locally

1. Install dependencies
```bash
cd client && npm install
cd ../server && npm install
```

2. Configure backend environment
```bash
cd server
copy .env.example .env
```

3. Start MongoDB locally
- Example URI in `.env`: `mongodb://127.0.0.1:27017/vendor_mvp`

4. Run backend
```bash
cd server
npm run dev
```

5. Configure frontend environment
```bash
cd client
copy .env.example .env
```

6. Run frontend
```bash
cd client
npm run dev
```

## Deploy on Vercel (Frontend + Backend)

Deploy as two Vercel projects from the same repo:

### 1) Backend Project (Vercel Serverless)

- In Vercel, create a new project and set **Root Directory** to `server`.
- Framework preset: `Other`.
- Build command: leave default.
- Output directory: leave empty.
- Add environment variables:
  - `MONGO_URI` = your MongoDB Atlas connection string
  - `JWT_SECRET` = strong secret string
- Deploy.

Backend uses:
- `server/api/index.js` as the serverless entry.
- `server/vercel.json` to route all paths to the API handler.

After deploy, backend base URL will be like:
- `https://<your-backend-project>.vercel.app`

API examples:
- `https://<your-backend-project>.vercel.app/api/health`
- `https://<your-backend-project>.vercel.app/api/auth/login`

### 2) Frontend Project (Vite SPA)

- Create another Vercel project and set **Root Directory** to `client`.
- Framework preset: `Vite`.
- Add environment variable:
  - `VITE_API_BASE_URL` = `https://<your-backend-project>.vercel.app/api`
- Deploy.

Frontend routing for React Router is handled by:
- `client/vercel.json`

### 3) Important

- If you redeploy backend with a new URL, update `VITE_API_BASE_URL` in frontend project env and redeploy frontend.
- For production, use MongoDB Atlas (not local MongoDB URI).

## Demo URLs

- Seller login: `http://localhost:5173/login`
- Dashboard: `http://localhost:5173/dashboard`
- Public store: generated as `http://localhost:5173/store/<seller-slug>`
