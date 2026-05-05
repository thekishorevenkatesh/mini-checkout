import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { AppIcon } from "../components/ui/AppIcon";
import { useI18n } from "../context/I18nContext";
import { DEFAULT_POLICY_CONTENT } from "../constants/policyDefaults";
import { DEFAULT_VENDOR_POLICY_POINTS } from "../constants/vendorPolicyDefaults";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import {
  DEFAULT_COUNTRY_CODE,
  EMPTY_ADDRESS,
  formatAddress,
  formatPhone,
  type AddressParts,
  type PhoneParts,
} from "../utils/contactFields";

type Mode = "login" | "register";
type Step = "contact" | "otp" | "profile";

const BUSINESS_CATEGORY_OPTIONS = [
  "Fashion",
  "Groceries",
  "Food & Beverages",
  "Electronics",
  "Home & Kitchen",
  "Beauty & Personal Care",
  "Health & Wellness",
  "Books & Stationery",
  "Services",
  "Other",
] as const;

const IMGBB_KEY = import.meta.env.VITE_IMGBB_API_KEY as string | undefined;

function ImageUploadField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (url: string) => void;
  placeholder: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!IMGBB_KEY) {
      setUploadError("Add VITE_IMGBB_API_KEY in client/.env to enable uploads.");
      return;
    }

    setUploading(true);
    setUploadError("");
    try {
      const form = new FormData();
      form.append("image", file);
      const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_KEY}`, {
        method: "POST",
        body: form,
      });
      const data = await response.json() as { success: boolean; data?: { url: string } };
      if (data.success && data.data?.url) {
        onChange(data.data.url);
      } else {
        setUploadError("Upload failed. Check your ImgBB API key.");
      }
    } catch {
      setUploadError("Upload failed. Check your internet connection.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <label className={`inline-flex w-full cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 sm:w-auto ${uploading ? "pointer-events-none opacity-60" : ""}`}>
          {uploading ? "Uploading..." : "Upload"}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
        </label>
      </div>
      {value ? (
        <a href={value} target="_blank" rel="noreferrer">
          <img src={value} alt="Proof preview" className="h-24 w-full rounded-xl border border-slate-200 object-cover sm:h-28" />
        </a>
      ) : null}
      {uploadError ? <p className="text-xs text-rose-600">{uploadError}</p> : null}
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const { sendOtp, verifyOtp, register } = useAuth();
  const { t } = useI18n();

  const [mode, setMode] = useState<Mode>("login");
  const [step, setStep] = useState<Step>("contact");

  // Shared fields
  const [phone, setPhone] = useState<PhoneParts>({ countryCode: DEFAULT_COUNTRY_CODE, number: "" });
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState("");

  // Business / onboarding fields (Register mode Step 1 + Login mode Step 3)
  const [businessName, setBusinessName] = useState("");
  const [businessCategory, setBusinessCategory] = useState<(typeof BUSINESS_CATEGORY_OPTIONS)[number]>("Fashion");
  const [businessCategoryOther, setBusinessCategoryOther] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessAddress, setBusinessAddress] = useState<AddressParts>(EMPTY_ADDRESS);
  const [businessGST, setBusinessGST] = useState("");
  const [upiId, setUpiId] = useState("");
  const [businessLogo, setBusinessLogo] = useState("");
  const [idProofUrl, setIdProofUrl] = useState("");
  const [addressProofUrl, setAddressProofUrl] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState<PhoneParts>({ countryCode: DEFAULT_COUNTRY_CODE, number: "" });
  const [callNumber, setCallNumber] = useState<PhoneParts>({ countryCode: DEFAULT_COUNTRY_CODE, number: "" });
  const [policyChecks, setPolicyChecks] = useState<Record<string, boolean>>(
    () => Object.fromEntries(DEFAULT_VENDOR_POLICY_POINTS.map((_, index) => [String(index), false]))
  );
  const [showTermsModal, setShowTermsModal] = useState(false);
  const selectedBusinessCategory = businessCategory === "Other"
    ? businessCategoryOther.trim()
    : businessCategory;
  const allPoliciesAccepted = Object.values(policyChecks).every(Boolean);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const phoneDigits = phone.number.replace(/\D/g, "");
  const phoneError =
    phone.number.length > 0 && phoneDigits.length !== 10
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
    (mode !== "register" || (businessName.trim().length >= 3 && allPoliciesAccepted));
  const canVerifyOtp = otp.length === 6;
  const canCompleteProfile = businessName.trim().length >= 3 && allPoliciesAccepted;

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
    setBusinessCategory("Fashion");
    setBusinessCategoryOther("");
    setPolicyChecks(Object.fromEntries(DEFAULT_VENDOR_POLICY_POINTS.map((_, index) => [String(index), false])));
    setPhone({ countryCode: DEFAULT_COUNTRY_CODE, number: "" });
    setWhatsappNumber({ countryCode: DEFAULT_COUNTRY_CODE, number: "" });
    setCallNumber({ countryCode: DEFAULT_COUNTRY_CODE, number: "" });
    setBusinessAddress(EMPTY_ADDRESS);
  }

  // ── Step 1: Send OTP ─────────────────────────────────────────────────────
  async function handleSendOtp(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!phone.number.trim()) { setError("Phone number is required."); return; }
    if (phoneDigits.length !== 10) { setError("Enter a valid 10-digit phone number."); return; }
    if (emailError) { setError(emailError); return; }
    if (mode === "register" && !businessName.trim()) {
      setError("Business name is required.");
      return;
    }
    if (mode === "register" && !selectedBusinessCategory) {
      setError("Please select business category.");
      return;
    }
    if (mode === "register" && !allPoliciesAccepted) {
      setError("Please accept all vendor policy checklist items to continue.");
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
          businessCategory: selectedBusinessCategory || undefined,
          termsAccepted: allPoliciesAccepted,
          businessEmail: businessEmail.trim() || undefined,
          businessAddress: formatAddress(businessAddress) || undefined,
          businessGST: businessGST.trim() || undefined,
          upiId: upiId.trim() || undefined,
          businessLogo: businessLogo.trim() || undefined,
          idProofUrl: idProofUrl.trim() || undefined,
          addressProofUrl: addressProofUrl.trim() || undefined,
          whatsappNumber: formatPhone(whatsappNumber) || undefined,
          callNumber: formatPhone(callNumber) || undefined,
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
    if (!selectedBusinessCategory) { setError("Please select business category."); return; }
    if (!allPoliciesAccepted) { setError("Please accept all vendor policy checklist items to continue."); return; }
    setSubmitting(true);
    try {
      await register({
        businessName: businessName.trim(),
        businessCategory: selectedBusinessCategory || undefined,
        termsAccepted: allPoliciesAccepted,
        businessEmail: businessEmail.trim() || undefined,
        businessAddress: formatAddress(businessAddress) || undefined,
        businessGST: businessGST.trim() || undefined,
        upiId: upiId.trim() || undefined,
        businessLogo: businessLogo.trim() || undefined,
        idProofUrl: idProofUrl.trim() || undefined,
        addressProofUrl: addressProofUrl.trim() || undefined,
        whatsappNumber: formatPhone(whatsappNumber) || undefined,
        callNumber: formatPhone(callNumber) || undefined,
      });
      navigate("/dashboard", { replace: true });
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
    <main className="mx-auto grid min-h-[calc(100vh-52px)] w-full max-w-6xl items-start gap-5 px-3 py-4 sm:px-4 sm:py-5 lg:grid-cols-2 lg:items-center lg:gap-8">

      {/* ── Left: Hero ─────────────────────────────────────────────── */}
      <section className="order-2 space-y-5 text-center lg:order-1 lg:space-y-6 lg:text-left">
        <p className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-teal-700">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-teal-600">
            <AppIcon name="brand" className="text-[10px]" />
          </span>
          MyDukan
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
        <div className="flex flex-wrap items-start justify-center gap-2 lg:justify-start">
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
                  {i < currentStepIndex ? <AppIcon name="check" className="text-[10px]" /> : String(i + 1)}
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
      <section className="order-1 mx-auto w-full max-w-xl rounded-3xl border border-white/80 bg-white/90 p-4 shadow-card backdrop-blur sm:p-6 lg:order-2">

        {/* Mode Toggle Tabs */}
        <div className="mb-6 flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
          {(["login", "register"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-center text-sm font-semibold transition-all duration-200 ${
                mode === m
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {m === "login"
                ? <><AppIcon name="login" className="text-[10px]" /> {t("auth.login", "Login")}</>
                : <><AppIcon name="register" className="text-[10px]" /> {t("auth.register", "Register")}</>}
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
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[96px_minmax(0,1fr)]">
                  <input
                    className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
                    value={phone.countryCode}
                    onChange={(e) => setPhone((prev) => ({ ...prev, countryCode: e.target.value }))}
                    placeholder="+91"
                    required
                  />
                  <input
                    className="min-w-0 rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50 sm:text-sm"
                    placeholder="9876543210"
                    value={phone.number}
                    onChange={(e) => setPhone((prev) => ({ ...prev, number: e.target.value.replace(/\D/g, "").slice(0, 15) }))}
                    required
                  />
                </div>
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
                  <label className="block space-y-1 sm:col-span-2">
                    <span className="text-sm font-semibold text-slate-700">Business category *</span>
                    <select
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
                      value={businessCategory}
                      onChange={(e) => setBusinessCategory(e.target.value as (typeof BUSINESS_CATEGORY_OPTIONS)[number])}
                      required
                    >
                      {BUSINESS_CATEGORY_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  {businessCategory === "Other" && (
                    <label className="block space-y-1 sm:col-span-2">
                      <span className="text-sm font-semibold text-slate-700">Enter business category *</span>
                      <input
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
                        value={businessCategoryOther}
                        onChange={(e) => setBusinessCategoryOther(e.target.value)}
                        placeholder="Type your business category"
                        required
                      />
                    </label>
                  )}

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
                  <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
                    <label className="block space-y-1">
                      <span className="text-sm font-semibold text-slate-700">Address line 1</span>
                      <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50" value={businessAddress.line1} onChange={(e) => setBusinessAddress((prev) => ({ ...prev, line1: e.target.value }))} />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-sm font-semibold text-slate-700">Address line 2</span>
                      <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50" value={businessAddress.line2} onChange={(e) => setBusinessAddress((prev) => ({ ...prev, line2: e.target.value }))} />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-sm font-semibold text-slate-700">City</span>
                      <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50" value={businessAddress.city} onChange={(e) => setBusinessAddress((prev) => ({ ...prev, city: e.target.value }))} />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-sm font-semibold text-slate-700">State</span>
                      <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50" value={businessAddress.state} onChange={(e) => setBusinessAddress((prev) => ({ ...prev, state: e.target.value }))} />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-sm font-semibold text-slate-700">Country</span>
                      <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50" value={businessAddress.country} onChange={(e) => setBusinessAddress((prev) => ({ ...prev, country: e.target.value }))} />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-sm font-semibold text-slate-700">Landmark</span>
                      <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50" value={businessAddress.landmark} onChange={(e) => setBusinessAddress((prev) => ({ ...prev, landmark: e.target.value }))} />
                    </label>
                  </div>

                  {/* WhatsApp */}
                  <label className="block space-y-1">
                    <span className="text-sm font-semibold text-slate-700">WhatsApp number</span>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[96px_minmax(0,1fr)]">
                      <input className="min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50" value={whatsappNumber.countryCode} onChange={(e) => setWhatsappNumber((prev) => ({ ...prev, countryCode: e.target.value }))} placeholder="+91" />
                      <input className="min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50" placeholder="9876543210" value={whatsappNumber.number} onChange={(e) => setWhatsappNumber((prev) => ({ ...prev, number: e.target.value.replace(/\D/g, "").slice(0, 15) }))} />
                    </div>
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
                  {/* KYC Documents */}
                  <div className="sm:col-span-2 flex items-center gap-3 pt-1">
                    <div className="h-px flex-1 bg-slate-200" />
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">KYC Documents</span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>
                  <label className="block space-y-1 sm:col-span-2">
                    <span className="text-sm font-semibold text-slate-700">ID Proof <span className="text-rose-500">*</span></span>
                    <p className="text-xs text-slate-400">Aadhaar, PAN, Passport, Voter ID, Driving Licence</p>
                    <ImageUploadField
                      value={idProofUrl}
                      onChange={setIdProofUrl}
                      placeholder="Paste image URL of your ID proof..."
                    />
                  </label>
                  <label className="block space-y-1 sm:col-span-2">
                    <span className="text-sm font-semibold text-slate-700">Address Proof <span className="text-rose-500">*</span></span>
                    <p className="text-xs text-slate-400">Utility bill, Bank statement, Rental agreement (up to 3 months old)</p>
                    <ImageUploadField
                      value={addressProofUrl}
                      onChange={setAddressProofUrl}
                      placeholder="Paste image URL of your address proof..."
                    />
                  </label>
                </>
              )}
              {mode === "register" && (
                <div className="sm:col-span-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-700">Vendor policy checklist (required)</p>
                  {DEFAULT_VENDOR_POLICY_POINTS.map((item, index) => (
                    <label key={index} className="flex items-start gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={Boolean(policyChecks[String(index)])}
                        onChange={(e) => setPolicyChecks((prev) => ({ ...prev, [String(index)]: e.target.checked }))}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                      />
                      <span>{item}</span>
                    </label>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowTermsModal(true)}
                    className="text-left text-sm font-semibold text-teal-700 underline underline-offset-2"
                  >
                    View full Terms & Conditions
                  </button>
                </div>
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
              <span className="font-semibold text-slate-700">{formatPhone(phone)}</span>.
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
                  <p className="inline-flex items-center gap-2 text-xs font-bold text-amber-800"><span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-500"><AppIcon name="brand" className="text-[9px]" /></span>MyDukan - Demo Mode</p>
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
                  ? <><AppIcon name="check" className="text-[10px]" /> Verify & Create Store</>
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
                <AppIcon name="chevronLeft" className="text-[10px]" /> Back
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
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-sm font-semibold text-slate-700">Business category *</span>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
                  value={businessCategory}
                  onChange={(e) => setBusinessCategory(e.target.value as (typeof BUSINESS_CATEGORY_OPTIONS)[number])}
                  required
                >
                  {BUSINESS_CATEGORY_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              {businessCategory === "Other" && (
                <label className="block space-y-1 sm:col-span-2">
                  <span className="text-sm font-semibold text-slate-700">Enter business category *</span>
                  <input
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50"
                    value={businessCategoryOther}
                    onChange={(e) => setBusinessCategoryOther(e.target.value)}
                    placeholder="Type your business category"
                    required
                  />
                </label>
              )}
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
              <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Address line 1</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50" value={businessAddress.line1} onChange={(e) => setBusinessAddress((prev) => ({ ...prev, line1: e.target.value }))} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Address line 2</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50" value={businessAddress.line2} onChange={(e) => setBusinessAddress((prev) => ({ ...prev, line2: e.target.value }))} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">City</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50" value={businessAddress.city} onChange={(e) => setBusinessAddress((prev) => ({ ...prev, city: e.target.value }))} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">State</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50" value={businessAddress.state} onChange={(e) => setBusinessAddress((prev) => ({ ...prev, state: e.target.value }))} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Country</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50" value={businessAddress.country} onChange={(e) => setBusinessAddress((prev) => ({ ...prev, country: e.target.value }))} />
                </label>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-700">Landmark</span>
                  <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50" value={businessAddress.landmark} onChange={(e) => setBusinessAddress((prev) => ({ ...prev, landmark: e.target.value }))} />
                </label>
              </div>
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
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[96px_minmax(0,1fr)]">
                  <input className="min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50" value={whatsappNumber.countryCode} onChange={(e) => setWhatsappNumber((prev) => ({ ...prev, countryCode: e.target.value }))} placeholder="+91" />
                  <input className="min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50" placeholder="9876543210" value={whatsappNumber.number} onChange={(e) => setWhatsappNumber((prev) => ({ ...prev, number: e.target.value.replace(/\D/g, "").slice(0, 15) }))} />
                </div>
              </label>
              {/* Call number */}
              <label className="block space-y-1">
                <span className="text-sm font-semibold text-slate-700">Call number</span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[96px_minmax(0,1fr)]">
                  <input className="min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50" value={callNumber.countryCode} onChange={(e) => setCallNumber((prev) => ({ ...prev, countryCode: e.target.value }))} placeholder="+91" />
                  <input className="min-w-0 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-50" placeholder="9876543210" value={callNumber.number} onChange={(e) => setCallNumber((prev) => ({ ...prev, number: e.target.value.replace(/\D/g, "").slice(0, 15) }))} />
                </div>
              </label>
              <div className="sm:col-span-2 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-700">Vendor policy checklist (required)</p>
                {DEFAULT_VENDOR_POLICY_POINTS.map((item, index) => (
                  <label key={index} className="flex items-start gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean(policyChecks[String(index)])}
                      onChange={(e) => setPolicyChecks((prev) => ({ ...prev, [String(index)]: e.target.checked }))}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span>{item}</span>
                  </label>
                ))}
                <button
                  type="button"
                  onClick={() => setShowTermsModal(true)}
                  className="text-left text-sm font-semibold text-teal-700 underline underline-offset-2"
                >
                  View full Terms & Conditions
                </button>
              </div>

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
                <AppIcon name="register" className="text-[10px]" /> Complete Setup & Go to Dashboard
              </Button>
            </form>
          </>
        )}
      </section>
    </main>
    <footer className="px-3 pb-2 text-center text-xs text-slate-400 sm:px-4">
      <span className="inline-flex items-center gap-1 font-semibold text-slate-500"><span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900"><AppIcon name="brand" className="text-[9px]" /></span>MyDukan</span> - Your Store. Your Link. Your Sales.
    </footer>
    {showTermsModal && (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 px-3 py-3 backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-6">
        <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-white/70 bg-white shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-4 sm:px-5">
            <h3 className="font-heading text-xl font-bold text-slate-900">Terms & Conditions</h3>
            <button
              type="button"
              onClick={() => setShowTermsModal(false)}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
          <div className="max-h-[calc(90vh-88px)] overflow-y-auto px-4 py-4 sm:px-5">
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Vendor Policy Checklist</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-700">
                  {DEFAULT_VENDOR_POLICY_POINTS.map((point, index) => (
                    <li key={index}>{point}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">General Terms & Conditions</p>
                <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">
                  {DEFAULT_POLICY_CONTENT.termsAndConditions}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
