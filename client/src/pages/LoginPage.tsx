import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";

type Mode = "login" | "register";
type Step = "contact" | "otp" | "profile";

export function LoginPage() {
  const navigate = useNavigate();
  const { sendOtp, verifyOtp, register, logout } = useAuth();
  const { t } = useI18n();

  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<Step>("contact");

  // Shared fields
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState("");

  // Business / onboarding fields (Register mode Step 1 + Login mode Step 3)
  const [businessName, setBusinessName] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessGST, setBusinessGST] = useState("");
  const [upiId, setUpiId] = useState("");
  const [businessLogo, setBusinessLogo] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [callNumber, setCallNumber] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const phoneDigits = phone.replace(/\D/g, "");
  const phoneError =
    phone.length > 0 && phoneDigits.length !== 10
      ? "Enter a valid 10-digit phone number."
      : "";
  const emailError =
    email.trim().length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ? "Enter a valid email address."
      : "";
  const businessNameError =
    (mode === "register" || step === "profile") && businessName.length > 0 && businessName.trim().length < 3
      ? "Business name should be at least 3 characters."
      : "";
  const otpError =
    otp.length > 0 && otp.length < 6 ? "OTP must be 6 digits." : "";

  const canSendOtp =
    phoneDigits.length === 10 &&
    !emailError &&
    (mode !== "register" || businessName.trim().length >= 3);
  const canVerifyOtp = otp.length === 6;
  const canCompleteProfile = businessName.trim().length >= 3;

  function errMsg(err: unknown, fallback: string) {
    if (axios.isAxiosError(err)) {
      const data = err.response?.data;
      const msg = data?.message || fallback;
      const detail = data?.detail ? ` → ${data.detail}` : "";
      return msg + detail;
    }
    return fallback;
  }

  function switchMode(newMode: Mode) {
    setMode(newMode);
    setStep("contact");
    setError("");
    setInfo("");
    setOtp("");
    setDevOtp("");
  }

  // ── Step 1: Send OTP ─────────────────────────────────────────────────────
  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!phone.trim()) { setError("Phone number is required."); return; }
    if (phoneDigits.length !== 10) { setError("Enter a valid 10-digit phone number."); return; }
    if (emailError) { setError(emailError); return; }
    if (mode === "register" && !businessName.trim()) {
      setError("Business name is required.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await sendOtp({
        phone: phoneDigits,
        email: email.trim() || undefined,
      });
      if (result.otp) setDevOtp(result.otp);
      setInfo("OTP generated. Enter it below to continue.");
      setStep("otp");
    } catch (err) {
      setError(errMsg(err, "Could not send OTP. Check your details."));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Step 2: Verify OTP ───────────────────────────────────────────────────
  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!otp.trim()) { setError("Please enter the OTP."); return; }
    if (otp.trim().length !== 6) { setError("OTP must be 6 digits."); return; }
    setSubmitting(true);
    try {
      const { isProfileComplete } = await verifyOtp({
        phone: phoneDigits || undefined,
        email: email.trim() || undefined,
        otp: otp.trim(),
      });

      if (mode === "register") {
        // Auto-complete registration with pre-filled data from Step 1
        await register({
          businessName: businessName.trim(),
          businessEmail: businessEmail.trim() || undefined,
          businessAddress: businessAddress.trim() || undefined,
          businessGST: businessGST.trim() || undefined,
          upiId: upiId.trim() || undefined,
          businessLogo: businessLogo.trim() || undefined,
          whatsappNumber: whatsappNumber.trim() || undefined,
          callNumber: callNumber.trim() || undefined,
        });
        navigate("/dashboard", { replace: true });
      } else {
        // Login mode
        if (isProfileComplete) {
          navigate("/dashboard", { replace: true });
        } else {
          setStep("profile");
          setInfo("Welcome! Please complete your business profile.");
        }
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setError(err.response.data?.message || "Your account is pending admin approval.");
        setStep("contact");
        return;
      }
      setError(errMsg(err, "Invalid or expired OTP. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  // ── Step 3 (Login mode only): Complete profile for new accounts ──────────
  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!businessName.trim()) { setError("Business name is required."); return; }
    if (businessName.trim().length < 3) { setError("Business name should be at least 3 characters."); return; }
    setSubmitting(true);
    try {
      await register({
        businessName: businessName.trim(),
        businessEmail: businessEmail.trim() || undefined,
        businessAddress: businessAddress.trim() || undefined,
        businessGST: businessGST.trim() || undefined,
        upiId: upiId.trim() || undefined,
        businessLogo: businessLogo.trim() || undefined,
        whatsappNumber: whatsappNumber.trim() || undefined,
        callNumber: callNumber.trim() || undefined,
      });
      logout();
      setMode("login");
      setStep("contact");
      setInfo("Registration submitted. Wait for admin approval before logging in.");
      setError("");
    } catch (err) {
      setError(errMsg(err, "Could not complete registration. Try again."));
    } finally {
      setSubmitting(false);
    }
  }

  // Step indicator config
  const loginSteps: { key: Step; label: string }[] = [
    { key: "contact", label: "Phone" },
    { key: "otp", label: "OTP" },
    { key: "profile", label: "Profile" },
  ];
  const registerSteps: { key: Step; label: string }[] = [
    { key: "contact", label: "Details" },
    { key: "otp", label: "Verify" },
  ];
  const activeSteps = mode === "login" ? loginSteps : registerSteps;
  const currentStepIndex = activeSteps.findIndex((s) => s.key === step);

  return (
    <>
    <main className="mx-auto grid min-h-[calc(100vh-52px)] w-full max-w-6xl items-center gap-6 px-4 py-4 sm:py-5 lg:grid-cols-2 lg:gap-8">

      {/* ── Left: Hero ─────────────────────────────────────────────── */}
      <section className="space-y-5 text-center lg:space-y-6 lg:text-left">
        <p className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-teal-700">
          🛍️ MyDukan
        </p>
        <h1 className="font-heading text-3xl font-bold leading-tight text-slate-900 sm:text-4xl lg:text-5xl">
          {mode === "login"
            ? "Welcome back to MyDukan."
            : "Open your Dukan and start selling today."}
        </h1>
        <p className="mx-auto max-w-xl text-base text-slate-600 sm:text-lg lg:mx-0">
          {mode === "login"
            ? "Enter your registered phone, verify with OTP, and jump straight into your Dukan dashboard."
            : "Register your phone, fill in your business details, verify with OTP, and share your MyDukan link on WhatsApp — all in under 2 minutes."}
        </p>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-2 lg:justify-start">
          {activeSteps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition-all duration-300 ${
                    i < currentStepIndex
                      ? "bg-teal-600 text-white"
                      : i === currentStepIndex
                      ? "bg-teal-600 text-white ring-4 ring-teal-100"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {i < currentStepIndex ? "✓" : String(i + 1)}
                </div>
                <span
                  className={`text-[10px] font-semibold tracking-wide ${
                    i === currentStepIndex ? "text-teal-700" : "text-slate-400"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < activeSteps.length - 1 && (
                <div
                  className={`mb-4 h-0.5 w-8 rounded transition-all duration-300 ${
                    i < currentStepIndex ? "bg-teal-400" : "bg-slate-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Right: Form Card ───────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-xl rounded-3xl border border-white/80 bg-white/90 p-5 shadow-card backdrop-blur sm:p-6">

        {/* Mode Toggle Tabs */}
        <div className="mb-6 flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
          {(["login", "register"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all duration-200 ${
                mode === m
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {m === "login" ? `🔑 ${t("auth.login", "Login")}` : `🚀 ${t("auth.register", "Register")}`}
            </button>
          ))}
        </div>

        {/* ── Step 1: Contact (Login) or Details (Register) ── */}
        {step === "contact" && (
          <>
            <h2 className="font-heading text-2xl font-bold text-slate-900">
              {mode === "login" ? "Sign In to Your Dukan" : "Create Your Dukan"}
            </h2>
            <p className="mt-1.5 text-sm text-slate-500">
              {mode === "login"
                ? "Enter your phone number. We'll send a one-time password."
                : "Fill in your business details and verify your phone with OTP."}
            </p>

            <form
              className={`mt-5 ${mode === "register" ? "grid gap-3 sm:grid-cols-2" : "space-y-4"}`}
              onSubmit={handleSendOtp}
            >
              {/* Phone */}
              <label className={`block space-y-1 ${mode === "register" ? "" : ""}`}>
                <span className="text-sm font-semibold text-slate-700">Phone number *</span>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50 sm:text-sm"
                  placeholder="9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                  required
                />
                {phoneError && <span className="text-xs text-rose-600">{phoneError}</span>}
              </label>

              {/* Email */}
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">
                  {mode === "login" ? "Email (optional, for OTP)" : "Personal email (optional)"}
                </span>
                <input
                  type="email"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50 sm:text-sm"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                {emailError && <span className="text-xs text-rose-600">{emailError}</span>}
              </label>

              {/* ── Register Mode: Extra Business Fields ── */}
              {mode === "register" && (
                <>
                  {/* Divider */}
                  <div className="sm:col-span-2 flex items-center gap-3 pt-1">
                    <div className="h-px flex-1 bg-slate-200" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Business Info
                    </span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>

                  {/* Business Name */}
                  <label className="block space-y-1 sm:col-span-2">
                    <span className="text-sm font-semibold text-slate-700">Business name *</span>
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
                      placeholder="Star Astro Academy"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      required
                    />
                    {businessNameError && <span className="text-xs text-rose-600">{businessNameError}</span>}
                  </label>

                  {/* Business Email */}
                  <label className="block space-y-1">
                    <span className="text-sm font-semibold text-slate-700">Business email</span>
                    <input
                      type="email"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
                      placeholder="shop@example.com"
                      value={businessEmail}
                      onChange={(e) => setBusinessEmail(e.target.value)}
                    />
                  </label>

                  {/* UPI ID */}
                  <label className="block space-y-1">
                    <span className="text-sm font-semibold text-slate-700">UPI ID</span>
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
                      placeholder="seller@okaxis"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                    />
                  </label>

                  {/* Business Address */}
                  <label className="block space-y-1 sm:col-span-2">
                    <span className="text-sm font-semibold text-slate-700">Business address</span>
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
                      placeholder="123 Main St, Chennai"
                      value={businessAddress}
                      onChange={(e) => setBusinessAddress(e.target.value)}
                    />
                  </label>

                  {/* WhatsApp */}
                  <label className="block space-y-1">
                    <span className="text-sm font-semibold text-slate-700">WhatsApp number</span>
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
                      placeholder="9876543210"
                      value={whatsappNumber}
                      onChange={(e) => setWhatsappNumber(e.target.value)}
                    />
                  </label>

                  {/* GST */}
                  <label className="block space-y-1">
                    <span className="text-sm font-semibold text-slate-700">GST number (optional)</span>
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
                      placeholder="22AAAAA0000A1Z5"
                      value={businessGST}
                      onChange={(e) => setBusinessGST(e.target.value)}
                    />
                  </label>
                </>
              )}

              {error && (
                <Alert tone="error" className={mode === "register" ? "sm:col-span-2" : ""}>
                  {error}
                </Alert>
              )}

              <Button
                type="submit"
                disabled={submitting || !canSendOtp}
                loading={submitting}
                fullWidth
                className={`${
                  mode === "register" ? "sm:col-span-2" : ""
                }`}
              >
                Send OTP →
              </Button>
            </form>
          </>
        )}

        {/* ── Step 2: OTP Verification ── */}
        {step === "otp" && (
          <>
            <h2 className="font-heading text-2xl font-bold text-slate-900">Verify OTP</h2>
            <p className="mt-1.5 text-sm text-slate-500">
              Enter the 6-digit code sent to{" "}
              <span className="font-semibold text-slate-700">{phone}</span>.
            </p>
            {info && (
              <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700">
                {info}
              </p>
            )}
            <form className="mt-5 space-y-4" onSubmit={handleVerifyOtp}>
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">6-digit OTP *</span>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-2xl font-bold tracking-[0.3em] text-slate-900 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
                  placeholder="------"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  required
                  autoFocus
                />
                {otpError && <span className="text-xs text-rose-600">{otpError}</span>}
              </label>

              {devOtp && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 space-y-1">
                  <p className="text-xs font-bold text-amber-800">🛍️ MyDukan — Demo Mode</p>
                  <p className="text-xs text-amber-700">
                    Your OTP:{" "}
                    <strong className="text-lg tracking-widest">{devOtp}</strong>
                  </p>
                  <p className="text-xs text-amber-600">
                    Enable SMTP in server/.env to send OTP via email.
                  </p>
                </div>
              )}

              {error && <Alert tone="error">{error}</Alert>}

              <Button
                type="submit"
                disabled={submitting || !canVerifyOtp}
                loading={submitting}
                variant="success"
                fullWidth
              >
                {mode === "register"
                  ? "Verify & Create Store 🎉"
                  : "Verify OTP"}
              </Button>

              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => {
                  setStep("contact");
                  setError("");
                  setInfo("");
                  setOtp("");
                }}
              >
                ← Back
              </Button>
            </form>
          </>
        )}

        {/* ── Step 3 (Login mode only): Complete Profile for new users ── */}
        {step === "profile" && (
          <>
            <h2 className="font-heading text-2xl font-bold text-slate-900">
              Complete Your Profile
            </h2>
            {info && (
              <p className="mt-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700">
                {info}
              </p>
            )}
            <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={handleRegister}>
              {/* Business name */}
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-sm font-semibold text-slate-700">Business name *</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
                  placeholder="Star Astro Academy"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                />
              </label>
              {/* Business Email */}
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">Business email</span>
                <input
                  type="email"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
                  placeholder="shop@example.com"
                  value={businessEmail}
                  onChange={(e) => setBusinessEmail(e.target.value)}
                />
              </label>
              {/* UPI ID */}
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">UPI ID</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
                  placeholder="seller@okaxis"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                />
              </label>
              {/* Business Address */}
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-sm font-semibold text-slate-700">Business address</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
                  placeholder="123 Main St, Chennai"
                  value={businessAddress}
                  onChange={(e) => setBusinessAddress(e.target.value)}
                />
              </label>
              {/* GST */}
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">GST number (optional)</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
                  placeholder="22AAAAA0000A1Z5"
                  value={businessGST}
                  onChange={(e) => setBusinessGST(e.target.value)}
                />
              </label>
              {/* Business Logo */}
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">Business logo URL</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
                  placeholder="https://..."
                  value={businessLogo}
                  onChange={(e) => setBusinessLogo(e.target.value)}
                />
              </label>
              {/* WhatsApp */}
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">WhatsApp number</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
                  placeholder="9876543210"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                />
              </label>
              {/* Call number */}
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">Call number</span>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
                  placeholder="9876543210"
                  value={callNumber}
                  onChange={(e) => setCallNumber(e.target.value)}
                />
              </label>

              {businessNameError && <span className="text-xs text-rose-600 sm:col-span-2">{businessNameError}</span>}
              {error && (
                <Alert tone="error" className="sm:col-span-2">
                  {error}
                </Alert>
              )}
              <Button
                type="submit"
                disabled={submitting || !canCompleteProfile}
                loading={submitting}
                variant="success"
                fullWidth
                className="sm:col-span-2"
              >
                Complete Setup & Go to Dashboard 🚀
              </Button>
            </form>
          </>
        )}
      </section>
    </main>
    <footer className="pb-2 text-center text-xs text-slate-400">
      <span className="font-semibold text-slate-500">🛍️ MyDukan</span> — Your Store. Your Link. Your Sales.
    </footer>
    </>
  );
}
