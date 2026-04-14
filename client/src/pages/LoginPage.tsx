import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const navigate = useNavigate();
  const { seller, login, loading } = useAuth();
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [upiId, setUpiId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && seller) {
      navigate("/dashboard", { replace: true });
    }
  }, [loading, navigate, seller]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!phone.trim()) {
      setError("Phone number is required.");
      return;
    }

    setSubmitting(true);

    try {
      await login({
        businessName: businessName.trim(),
        phone: phone.trim(),
        upiId: upiId.trim(),
      });

      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.response?.data?.message) {
          setError(String(err.response.data.message));
        } else if (err.request) {
          setError(
            "Unable to reach server. Check frontend VITE_API_BASE_URL and backend deployment."
          );
        } else {
          setError("Could not sign in. Please check details and retry.");
        }
      } else {
        setError("Could not sign in. Please check details and retry.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-4 py-8 sm:py-10 lg:grid-cols-2">
      <section className="space-y-5 text-center lg:space-y-6 lg:text-left">
        <p className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-teal-700">
          Vendor First MVP
        </p>
        <h1 className="font-heading text-3xl font-bold leading-tight text-slate-900 sm:text-4xl lg:text-5xl">
          Build your mini store and stop chasing orders manually.
        </h1>
        <p className="mx-auto max-w-xl text-base text-slate-600 sm:text-lg lg:mx-0">
          Sign in with your phone number, add your UPI ID, list products, and
          share one store link on WhatsApp in minutes.
        </p>
      </section>

      <section className="mx-auto w-full max-w-xl rounded-3xl border border-white/80 bg-white/90 p-5 shadow-card backdrop-blur sm:p-8">
        <h2 className="font-heading text-2xl font-bold text-slate-900">
          Seller Login
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Existing sellers can enter only phone number. New sellers add business
          name.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-1">
            <span className="text-sm font-semibold text-slate-700">
              Business name
            </span>
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-400 sm:text-sm"
              placeholder="Star Astro Academy"
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-semibold text-slate-700">
              Phone number
            </span>
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-400 sm:text-sm"
              placeholder="9876543210"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm font-semibold text-slate-700">
              UPI ID
            </span>
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-slate-400 sm:text-sm"
              placeholder="seller@okaxis"
              value={upiId}
              onChange={(event) => setUpiId(event.target.value)}
            />
          </label>

          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {submitting ? "Signing in..." : "Enter Dashboard"}
          </button>
        </form>
      </section>
    </main>
  );
}
