import sys
sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)

f = open('client/src/pages/PublicStorePage.tsx', 'r', encoding='utf-8')
src = f.read()
lines = f.readlines() if False else src.splitlines(keepends=True)
f.close()

def replace_once(s, old, new, label=''):
    if old not in s:
        print(f'WARN: not found: {label or old[:60]}')
        return s
    return s.replace(old, new, 1)

# 1. Add new state vars after variantErrorProductId
src = replace_once(src,
    "  const [variantErrorProductId, setVariantErrorProductId] = useState<string | null>(null);",
    """  const [variantErrorProductId, setVariantErrorProductId] = useState<string | null>(null);
  const [showCart, setShowCart] = useState(false);
  const [variantPopupProductId, setVariantPopupProductId] = useState<string | null>(null);
  const [popupVariants, setPopupVariants] = useState<Record<string, string>>({});
  const [popupVariantError, setPopupVariantError] = useState("");""", "state1")

# 2. Add screenshotFile state
src = replace_once(src,
    '  const [screenshotUrl, setScreenshotUrl] = useState("");',
    """  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState("");""", "state2")

# 3. Add cartCount after grandTotal
src = replace_once(src,
    "  const grandTotal = itemsTotal + deliveryCharge;",
    """  const grandTotal = itemsTotal + deliveryCharge;
  const cartCount = Object.values(cart).reduce((s, i) => s + i.quantity, 0);""", "cartCount")

# 4. Modify handleProofSubmit + add new functions
old_proof = """  // \u2500\u2500 Submit payment proof
  async function handleProofSubmit() {
    if (!screenshotUrl.trim() || placedOrderIds.length === 0) return;
    setUploadingProof(true);
    try {
      await Promise.all(placedOrderIds.map(id =>
        api.patch(`/orders/${id}/payment-screenshot`, { paymentScreenshotUrl: screenshotUrl.trim() })
      ));
      setProofSuccess("Payment proof submitted! The seller will confirm your order shortly.");
      setScreenshotUrl("");
    } catch { setError("Could not submit proof."); }
    finally { setUploadingProof(false); }
  }"""
new_proof = """  // \u2500\u2500 Submit payment proof
  async function handleProofSubmit() {
    if (placedOrderIds.length === 0) return;
    let proofUrl = screenshotUrl.trim();
    if (screenshotFile) {
      proofUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(screenshotFile);
      });
    }
    if (!proofUrl) return;
    setUploadingProof(true);
    try {
      await Promise.all(placedOrderIds.map(id =>
        api.patch(`/orders/${id}/payment-screenshot`, { paymentScreenshotUrl: proofUrl })
      ));
      setProofSuccess("Payment proof submitted! The seller will confirm your order shortly.");
      setScreenshotUrl(""); setScreenshotFile(null); setScreenshotPreview("");
    } catch { setError("Could not submit proof."); }
    finally { setUploadingProof(false); }
  }

  function openVariantPopup(productId: string) {
    const product = products.find(p => p._id === productId);
    if (!product) return;
    setPopupVariants(withAutoSelectedSingleVariants(product, cart[productId]?.variants || {}));
    setPopupVariantError("");
    setVariantPopupProductId(productId);
  }

  function handlePopupAddToCart() {
    if (!variantPopupProductId) return;
    const product = products.find(p => p._id === variantPopupProductId);
    if (!product) return;
    if (!hasCompleteVariantSelection(product, popupVariants)) { setPopupVariantError("Please select all options."); return; }
    setCart(prev => ({ ...prev, [variantPopupProductId]: { quantity: 1, variants: popupVariants } }));
    setCartFeedback(`${product.title} added to cart`);
    window.setTimeout(() => setCartFeedback(""), 1800);
    setVariantPopupProductId(null);
  }"""
src = replace_once(src, old_proof, new_proof, "proofSubmit")

# 5. Layout: grid -> single column
src = replace_once(src,
    '<main className="mx-auto grid min-h-screen w-full max-w-7xl gap-7 px-3 py-6 sm:px-5 sm:py-10 lg:grid-cols-3 lg:gap-8">',
    '<main className="mx-auto min-h-screen w-full max-w-7xl px-3 py-6 sm:px-5 sm:py-10">', "layout")

src = replace_once(src, 'className="space-y-6 lg:col-span-2">', 'className="space-y-6">', "section")

# 6. Cart button in header — find closing of social links div and insert before it
# Target: the line with social links closing + outer div closing
old_social_end = '''              {seller.socialLinks?.filter((s) => String(s.url || "").trim()).map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer"
                  title={s.platform} aria-label={s.platform}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-base text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                  {SOCIAL_ICONS[s.platform] || "\U0001f517"}
                </a>
              ))}
            </div>'''
new_social_end = '''              {seller.socialLinks?.filter((s) => String(s.url || "").trim()).map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer"
                  title={s.platform} aria-label={s.platform}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-base text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200">
                  {SOCIAL_ICONS[s.platform] || "\U0001f517"}
                </a>
              ))}
              {/* Cart button */}
              <button type="button" onClick={() => setShowCart(true)} aria-label="Open cart"
                className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-base text-white shadow-sm transition hover:bg-emerald-500">
                \U0001f6d2
                {cartCount > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white leading-none">
                    {cartCount > 9 ? "9+" : cartCount}
                  </span>
                )}
              </button>
            </div>'''
src = replace_once(src, old_social_end, new_social_end, "cartBtn")

# 7. Remove inline variants from card + update ADD button
old_variants = """                  {/* Variants */}
                  {normalizedVariants.length > 0 && (
                    <div className={`space-y-1.5 rounded-lg p-1.5 ${variantErrorProductId === product._id ? "border border-rose-300 bg-rose-50/60" : "bg-slate-50 dark:bg-slate-800/60"}`}>
                      {normalizedVariants.map(v => (
                        <div key={v.label}>
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Select {v.label}</p>
                          <div className="flex flex-wrap gap-1">
                            {v.options.map(opt => {
                              const optPrice = product.variantPrices?.[getVariantPriceKey(v.label, opt)];
                              const optQty = product.variantQuantities?.[getVariantPriceKey(v.label, opt)];
                              const optOut = optQty !== undefined && optQty <= 0;
                              return (
                                <button key={opt} type="button" disabled={optOut}
                                  onClick={() => setVariant(product._id, v.label, opt)}
                                  className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${item.variants[v.label] === opt ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"}`}>
                                  {opt}{optPrice ? ` \u20b9${optPrice}` : ""}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}"""
src = replace_once(src, old_variants, "", "variants")

old_effectiveVariants = """            const effectiveVariants = withAutoSelectedSingleVariants(product, item.variants);
            const requiresVariantSelection = normalizedVariants.some(v => (v.options || []).length > 0);
            const hasVariantSelection = hasCompleteVariantSelection(product, effectiveVariants);"""
src = replace_once(src, old_effectiveVariants, "            const requiresVariantSelection = normalizedVariants.some(v => (v.options || []).length > 0);", "effectiveVariants")

old_add_btn = """                    {!isSelected ? (
                      <button type="button" onClick={() => addProduct(product._id)}
                        disabled={isOutOfStock || (requiresVariantSelection && !hasVariantSelection)}
                        className="w-full rounded-xl border-2 border-emerald-500 bg-white py-1.5 text-sm font-bold text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-40 dark:bg-slate-900">
                        {isOutOfStock ? "Out of stock" : requiresVariantSelection && !hasVariantSelection ? "Choose variant" : "ADD"}
                      </button>"""
new_add_btn = """                    {!isSelected ? (
                      <button type="button" disabled={isOutOfStock}
                        onClick={() => { if (requiresVariantSelection) { openVariantPopup(product._id); } else { addProduct(product._id); } }}
                        className="w-full rounded-xl border-2 border-emerald-500 bg-white py-1 text-sm font-bold text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-40 dark:bg-slate-900">
                        {isOutOfStock ? "Out of stock" : (
                          <span className="flex flex-col items-center leading-tight">
                            <span>ADD</span>
                            {requiresVariantSelection && <span className="text-[9px] font-medium text-emerald-500">{normalizedVariants.reduce((s,v)=>s+v.options.length,0)} options</span>}
                          </span>
                        )}
                      </button>"""
src = replace_once(src, old_add_btn, new_add_btn, "addBtn")

# 8. Replace checkout section using line numbers
# Find line index of checkout section start
src_lines = src.split('\n')
checkout_start_idx = None
main_close_idx = None
for i, line in enumerate(src_lines):
    if 'RIGHT: Checkout' in line:
        checkout_start_idx = i - 1  # include blank line before
        break

for i in range(len(src_lines)-1, -1, -1):
    if '</main>' in src_lines[i]:
        main_close_idx = i
        break

if checkout_start_idx is None or main_close_idx is None:
    print(f"ERROR: checkout={checkout_start_idx}, main_close={main_close_idx}")
else:
    print(f"Checkout section: lines {checkout_start_idx}-{main_close_idx}")
    # Extract the checkout body (inside the <section> tags)
    checkout_section_lines = src_lines[checkout_start_idx:main_close_idx+1]
    checkout_section = '\n'.join(checkout_section_lines)

    # Find content between <section ...> and </section>
    sec_open_end = checkout_section.index('>', checkout_section.index('<section')) + 1
    sec_close = checkout_section.rfind('</section>')
    checkout_inner = checkout_section[sec_open_end:sec_close].strip()

    # Update proof section inside checkout inner
    old_proof_ui = """        {/* Payment proof upload \u2014 shown after order placed */}
        {isPrepaidCheckout && placedOrderIds.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-amber-800">\U0001f4f8 Share Payment Screenshot</p>
            <p className="text-xs text-amber-700">Paste the URL of your payment screenshot so the seller can confirm your order.</p>
            <input className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-400"
              placeholder="https://drive.google.com/..." value={screenshotUrl} onChange={e => setScreenshotUrl(e.target.value)} />
            {proofSuccess && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">{proofSuccess}</p>}
            <button type="button" onClick={handleProofSubmit} disabled={uploadingProof || !screenshotUrl.trim()}
              className="w-full rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:bg-amber-300 transition">
              {uploadingProof ? "Submitting..." : "Submit Payment Proof"}
            </button>
          </div>
        )}"""
    new_proof_ui = """        {/* Payment proof \u2014 upload or URL */}
        {isPrepaidCheckout && placedOrderIds.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
            <p className="text-sm font-semibold text-amber-800">\U0001f4f8 Share Payment Screenshot</p>
            <p className="text-xs text-amber-700">Upload your screenshot or paste its URL so the seller can confirm your order.</p>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-amber-300 bg-white px-4 py-3 text-center hover:border-amber-400 transition">
              <span className="text-2xl">\U0001f4c1</span>
              <span className="text-xs font-semibold text-amber-700">{screenshotFile ? screenshotFile.name : "Tap to upload image"}</span>
              <input type="file" accept="image/*" className="sr-only" onChange={e => { const f = e.target.files?.[0] ?? null; setScreenshotFile(f); if (f) { setScreenshotPreview(URL.createObjectURL(f)); setScreenshotUrl(""); } }} />
            </label>
            {screenshotPreview && <img src={screenshotPreview} alt="Preview" className="h-24 w-full rounded-xl object-cover border border-amber-200" />}
            <div className="flex items-center gap-2"><div className="flex-1 h-px bg-amber-200" /><span className="text-[10px] font-semibold text-amber-500 uppercase">or paste URL</span><div className="flex-1 h-px bg-amber-200" /></div>
            <input className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-amber-400"
              placeholder="https://drive.google.com/..." value={screenshotUrl}
              onChange={e => { setScreenshotUrl(e.target.value); if (e.target.value) { setScreenshotFile(null); setScreenshotPreview(""); } }} />
            {proofSuccess && <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">{proofSuccess}</p>}
            <button type="button" onClick={handleProofSubmit} disabled={uploadingProof || (!screenshotUrl.trim() && !screenshotFile)}
              className="w-full rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:bg-amber-300 transition">
              {uploadingProof ? "Submitting..." : "Submit Payment Proof"}
            </button>
          </div>
        )}"""
    if old_proof_ui in checkout_inner:
        checkout_inner = checkout_inner.replace(old_proof_ui, new_proof_ui)
        print("Proof UI updated")
    else:
        print("WARN: old proof UI not found in checkout inner")

    # Build drawer
    drawer_html = """    </main>

    {/* Backdrop */}
    {showCart && <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" onClick={() => setShowCart(false)} />}

    {/* Cart Drawer \u2014 bottom on mobile/tablet, right on desktop */}
    <div className={`fixed z-50 overflow-y-auto bg-white dark:bg-slate-900 transition-transform duration-300 ease-in-out bottom-0 left-0 right-0 max-h-[88vh] rounded-t-3xl shadow-2xl lg:bottom-0 lg:left-auto lg:top-0 lg:h-screen lg:w-[460px] lg:rounded-none lg:rounded-l-3xl ${showCart ? "translate-y-0 lg:translate-x-0 lg:translate-y-0" : "translate-y-full lg:translate-x-full lg:translate-y-0"}`}>
      <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-600 lg:hidden" />
      <div className="sticky top-0 z-10 flex items-center justify-between bg-white dark:bg-slate-900 px-5 py-4 border-b border-slate-200 dark:border-slate-700">
        <div>
          <h2 className="font-heading text-xl font-bold text-slate-900 dark:text-slate-100">{t("store.checkout", "Checkout")}</h2>
          {selectedItems.length > 0 && <p className="text-xs text-slate-500 dark:text-slate-400">{cartCount} item{cartCount !== 1 ? "s" : ""} \u00b7 \u20b9{grandTotal}</p>}
        </div>
        <button type="button" onClick={() => setShowCart(false)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800">\u2715</button>
      </div>
      <div className="space-y-5 p-5">
""" + checkout_inner + """
      </div>
    </div>

    {/* Variant Selection Popup */}
    {variantPopupProductId && (() => {
      const product = products.find(p => p._id === variantPopupProductId);
      if (!product) return null;
      const vgs = getNormalizedVariantGroups(product);
      return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center bg-black/50 backdrop-blur-[2px] px-4 pb-4 sm:p-4">
          <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-slate-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-wider text-teal-600">Select Options</p>
                <h3 className="mt-0.5 font-heading text-base font-bold text-slate-900 dark:text-slate-100 line-clamp-2">{product.title}</h3></div>
              <button type="button" onClick={() => setVariantPopupProductId(null)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50">\u2715</button>
            </div>
            <div className="space-y-3">
              {vgs.map(v => (
                <div key={v.label}>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">{v.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {v.options.map(opt => {
                      const optPrice = product.variantPrices?.[getVariantPriceKey(v.label, opt)];
                      const optQty = product.variantQuantities?.[getVariantPriceKey(v.label, opt)];
                      const optOut = optQty !== undefined && optQty <= 0;
                      return (<button key={opt} type="button" disabled={optOut}
                        onClick={() => { setPopupVariants(prev => ({ ...prev, [v.label]: opt })); setPopupVariantError(""); }}
                        className={`rounded-xl border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-40 ${popupVariants[v.label] === opt ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"}`}>
                        {opt}{optPrice ? ` \u00b7 \u20b9${optPrice}` : ""}
                      </button>);
                    })}
                  </div>
                </div>
              ))}
            </div>
            {popupVariantError && <p className="mt-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-2.5 py-1.5">{popupVariantError}</p>}
            <button type="button" onClick={handlePopupAddToCart} className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-500 transition">Add to Cart</button>
          </div>
        </div>
      );
    })()}"""

    # Rebuild file
    before_checkout = '\n'.join(src_lines[:checkout_start_idx])
    after_main = '\n'.join(src_lines[main_close_idx+1:])
    src = before_checkout + '\n      </section>\n' + drawer_html + '\n' + after_main

open('client/src/pages/PublicStorePage.tsx', 'w', encoding='utf-8').write(src)
print(f"Done. Lines: {src.count(chr(10))}")
