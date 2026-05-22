const express = require("express");
const jwt = require("jsonwebtoken");
const Product = require("../models/Product");
const Seller = require("../models/Seller");
const auth = require("../middleware/auth");
const { getPolicyContent } = require("../utils/policyDefaults");
const { generateOtp, hashOtp, verifyOtp: verifyHashedOtp } = require("../utils/otp");
const { sendOtpEmail } = require("../utils/mailer");

const router = express.Router();
const PRODUCT_TITLE_MAX_LENGTH = 60;

function isAdminPreviewRequest(req) {
  if (String(req.query.preview || "") !== "admin") return false;

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    return payload?.role === "admin";
  } catch (_error) {
    return false;
  }
}

function withPolicyDefaults(sellerDoc) {
  if (!sellerDoc) return sellerDoc;

  const seller = sellerDoc.toObject ? sellerDoc.toObject() : sellerDoc;
  return {
    ...seller,
    ...getPolicyContent(seller),
  };
}

function normalizeVariantPrices(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return Object.entries(input).reduce((acc, [key, value]) => {
    const numericValue = Number(value);
    if (key && Number.isFinite(numericValue) && numericValue > 0) {
      acc[key] = numericValue;
    }
    return acc;
  }, {});
}

function normalizeVariantMrps(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return Object.entries(input).reduce((acc, [key, value]) => {
    const numericValue = Number(value);
    if (key && Number.isFinite(numericValue) && numericValue >= 0) {
      acc[key] = numericValue;
    }
    return acc;
  }, {});
}

function expandImageSource(value) {
  if (Array.isArray(value)) {
    return value.flatMap(expandImageSource);
  }

  const raw = String(value || "").trim();
  if (!raw) return [];

  if (raw.startsWith("[")) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.flatMap(expandImageSource);
      }
    } catch (_error) {
      // Fall through to string parsing below.
    }
  }

  if (raw.includes("\n")) {
    return raw
      .split(/\r?\n/)
      .flatMap((part) => expandImageSource(part));
  }

  if ((raw.match(/https?:\/\//gi) || []).length > 1) {
    return raw
      .split(/,(?=https?:\/\/)/i)
      .flatMap((part) => expandImageSource(part));
  }

  return [raw];
}

function normalizeVariantItems(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.reduce((acc, item, index) => {
    const variantId = String(item?.variantId || "").trim() || `variant-${index + 1}`;
    const title = String(item?.title || "").trim();
    const attributesInput =
      item?.attributes && typeof item.attributes === "object" && !Array.isArray(item.attributes)
        ? item.attributes
        : {};
    const attributes = Object.entries(attributesInput).reduce((next, [key, value]) => {
      const cleanKey = String(key || "").trim();
      const cleanValue = String(value || "").trim();
      if (cleanKey && cleanValue) {
        next[cleanKey] = cleanValue;
      }
      return next;
    }, {});
    const price = Number(item?.price);
    const mrp = Number(item?.mrp);
    if (!variantId || !Number.isFinite(price) || price < 0) {
      return acc;
    }

    acc.push({
      variantId,
      title,
      attributes,
      price,
      mrp: Number.isFinite(mrp) && mrp >= 0 ? mrp : 0,
      isActive: item?.isActive !== false,
    });
    return acc;
  }, []);
}

function deriveVariantItemsFromLegacy(variants, variantPrices, variantMrps) {
  const parsedVariants = Array.isArray(variants) ? variants : [];
  const items = [];

  for (const variant of parsedVariants) {
    const label = String(variant?.label || "").trim();
    for (const optionValue of variant?.options || []) {
      const option = String(optionValue || "").trim();
      if (!label || !option) continue;

      const key = `${label}::${option}`;
      const price = Number(variantPrices[key]);
      items.push({
        variantId: `legacy:${key}`,
        title: option,
        attributes: { [label]: option },
        price: Number.isFinite(price) && price >= 0 ? price : 0,
        mrp: Number(variantMrps[key]) || 0,
        isActive: true,
      });
    }
  }

  return items;
}

function normalizeImageUrls(imageUrls, fallbackImageUrl = "") {
  const list = Array.isArray(imageUrls) ? imageUrls : expandImageSource(imageUrls);
  const cleaned = list
    .flatMap((url) => expandImageSource(url))
    .map((url) => String(url || "").trim())
    .filter(Boolean);

  if (cleaned.length > 0) return cleaned;

  const fallback = expandImageSource(fallbackImageUrl).map((url) => String(url || "").trim()).filter(Boolean);
  return fallback;
}

function normalizeProductTitle(value = "") {
  return String(value || "").trim().slice(0, PRODUCT_TITLE_MAX_LENGTH);
}

function normalizeProductCategories({ category, categories } = {}) {
  const fromArray = Array.isArray(categories)
    ? categories.map((tag) => String(tag || "").trim()).filter(Boolean)
    : [];
  const fromLegacy = String(category || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const unique = [...new Set([...fromArray, ...fromLegacy])];

  return {
    categories: unique,
    category: unique.join(", "),
  };
}

async function syncSellerCategoryTags(seller, categoryTags = []) {
  if (!seller || !Array.isArray(categoryTags) || categoryTags.length === 0) {
    return;
  }

  let changed = false;
  for (const tag of categoryTags) {
    if (tag && !seller.categories.includes(tag)) {
      seller.categories.push(tag);
      changed = true;
    }
  }

  if (changed) {
    await seller.save();
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

// ─── POST /products — Create product (auth) ───────────────────────────────
router.post("/", auth, async (req, res) => {
  try {
    const {
      title,
      description,
      imageUrl,
      imageUrls,
      notes,
      packSize,
      uom,
      price,
      mrp,
      category,
      categories,
      variants,
      variantItems,
      variantPrices,
      variantMrps,
    } = req.body;

    const normalizedCategories = normalizeProductCategories({ category, categories });
    const parsedVariants = Array.isArray(variants) ? variants : [];
    const normalizedVariantPrices = normalizeVariantPrices(variantPrices);
    const normalizedVariantMrps = normalizeVariantMrps(variantMrps);
    const normalizedVariantItems = normalizeVariantItems(variantItems);
    const nextVariantItems =
      normalizedVariantItems.length > 0
        ? normalizedVariantItems
        : deriveVariantItemsFromLegacy(
            parsedVariants,
            normalizedVariantPrices,
            normalizedVariantMrps
          );
    const hasVariantOptions = parsedVariants.some(
      (variant) => Array.isArray(variant?.options) && variant.options.length > 0
    );
    const hasExplicitVariantItems = nextVariantItems.length > 0;
    const hasBasePrice = Number.isFinite(Number(price)) && Number(price) > 0;

    const normalizedTitle = normalizeProductTitle(title);
    if (!normalizedTitle) {
      return res.status(400).json({ message: "Title is required" });
    }

    const normalizedImageUrls = normalizeImageUrls(imageUrls, imageUrl);
    if (normalizedImageUrls.length === 0) {
      return res.status(400).json({ message: "At least one product image is required." });
    }

    if (!hasBasePrice && !hasVariantOptions && !hasExplicitVariantItems) {
      return res.status(400).json({
        message:
          "Provide a base selling price or add variant options with prices.",
      });
    }

    if (!hasBasePrice && Object.keys(normalizedVariantPrices).length === 0 && !hasExplicitVariantItems) {
      return res.status(400).json({
        message: "At least one variant selling price is required.",
      });
    }

    if (
      Number.isFinite(Number(mrp)) &&
      Number(mrp) > 0 &&
      hasBasePrice &&
      Number(price) >= Number(mrp)
    ) {
      return res.status(400).json({
        message: "Product selling price should be less than product MRP.",
      });
    }

    const invalidVariantMrp = Object.entries(normalizedVariantMrps).some(
      ([key, mrpValue]) =>
        Number.isFinite(Number(normalizedVariantPrices[key])) &&
        Number(normalizedVariantPrices[key]) >= Number(mrpValue)
    );
    if (invalidVariantMrp) {
      return res.status(400).json({
        message: "Each variant selling price should be less than its variant MRP.",
      });
    }

    const seller = await Seller.findById(req.sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    const product = await Product.create({
      seller: seller._id,
      title: normalizedTitle,
      description: description ? String(description).trim() : "",
      imageUrl: normalizedImageUrls[0],
      imageUrls: normalizedImageUrls,
      notes: notes ? String(notes).trim() : "",
      packSize: packSize ? String(packSize).trim() : "",
      uom: uom ? String(uom).trim() : "",
      price: hasBasePrice ? Number(price) : 0,
      mrp: mrp ? Number(mrp) : 0,
      category: normalizedCategories.category,
      categories: normalizedCategories.categories,
      variants: parsedVariants,
      variantItems: nextVariantItems,
      variantPrices: normalizedVariantPrices,
      variantMrps: normalizedVariantMrps,
    });

    await syncSellerCategoryTags(seller, normalizedCategories.categories);

    return res.status(201).json({ product });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Unable to create product" });
  }
});

// ─── GET /products/my — Seller's own products (auth) ─────────────────────
router.get("/my", auth, async (req, res) => {
  try {
    const products = await Product.find({ seller: req.sellerId }).sort({
      createdAt: -1,
    });

    return res.json({ products });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch products" });
  }
});

// ─── GET /products/public/:sellerSlug — Public store (no auth) ───────────
router.get("/public/:sellerSlug", async (req, res) => {
  try {
    const isAdminPreview = isAdminPreviewRequest(req);
    const seller = await Seller.findOne({ slug: req.params.sellerSlug }).select(
      "-otp -otpExpiry"
    );

    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (!isAdminPreview && (!seller.storePublished || seller.approvalStatus !== "approved")) {
      return res.status(404).json({ message: "Seller store unavailable" });
    }

    const products = await Product.find({
      seller: seller._id,
      ...(isAdminPreview ? {} : { isActive: true }),
    }).sort({ createdAt: -1 });

    return res.json({ seller: withPolicyDefaults(seller), products });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch seller store" });
  }
});

// ─── PATCH /products/:productId/toggle — Toggle isActive (auth) ──────────
router.patch("/:productId/toggle", auth, async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.productId,
      seller: req.sellerId,
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    product.isActive = !product.isActive;
    await product.save();

    return res.json({ product });
  } catch (error) {
    return res.status(500).json({ message: "Unable to toggle product" });
  }
});

// ─── PUT /products/:productId — Update product (auth) ────────────────────
router.put("/:productId", auth, async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.productId,
      seller: req.sellerId,
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const {
      title,
      description,
      imageUrl,
      imageUrls,
      notes,
      packSize,
      uom,
      price,
      mrp,
      category,
      categories,
      variants,
      variantItems,
      variantPrices,
      variantMrps,
    } =
      req.body;

    const nextPrice = price !== undefined ? Number(price) || 0 : Number(product.price) || 0;
    const nextMrp = mrp !== undefined ? Number(mrp) || 0 : Number(product.mrp) || 0;
    const nextVariantPrices =
      variantPrices !== undefined
        ? normalizeVariantPrices(variantPrices)
        : (product.variantPrices instanceof Map
          ? Object.fromEntries(product.variantPrices.entries())
          : product.variantPrices || {});
    const nextVariantMrps =
      variantMrps !== undefined
        ? normalizeVariantMrps(variantMrps)
        : (product.variantMrps instanceof Map
          ? Object.fromEntries(product.variantMrps.entries())
          : product.variantMrps || {});
    const nextVariantItems =
      variantItems !== undefined
        ? normalizeVariantItems(variantItems)
        : (Array.isArray(product.variantItems) ? product.variantItems : []);

    if (nextMrp > 0 && nextPrice > 0 && nextPrice >= nextMrp) {
      return res.status(400).json({
        message: "Product selling price should be less than product MRP.",
      });
    }

    const invalidUpdatedVariantMrp = Object.entries(nextVariantMrps).some(
      ([key, mrpValue]) =>
        Number.isFinite(Number(nextVariantPrices[key])) &&
        Number(nextVariantPrices[key]) >= Number(mrpValue)
    );
    if (invalidUpdatedVariantMrp) {
      return res.status(400).json({
        message: "Each variant selling price should be less than its variant MRP.",
      });
    }

    const normalizedImageUrls =
      imageUrls !== undefined || imageUrl !== undefined
        ? normalizeImageUrls(imageUrls, imageUrl)
        : normalizeImageUrls(product.imageUrls, product.imageUrl);

    if (normalizedImageUrls.length === 0) {
      return res.status(400).json({ message: "At least one product image is required." });
    }

    if (title !== undefined) {
      const normalizedTitle = normalizeProductTitle(title);
      if (!normalizedTitle) {
        return res.status(400).json({ message: "Title is required" });
      }
      product.title = normalizedTitle;
    }
    if (description !== undefined) product.description = String(description).trim();
    product.imageUrls = normalizedImageUrls;
    product.imageUrl = normalizedImageUrls[0];
    if (notes !== undefined) product.notes = String(notes).trim();
    if (packSize !== undefined) product.packSize = String(packSize).trim();
    if (uom !== undefined) product.uom = String(uom).trim();
    if (price !== undefined) product.price = Number(price) || 0;
    if (mrp !== undefined) product.mrp = Number(mrp);
    if (category !== undefined || categories !== undefined) {
      const normalizedCategories = normalizeProductCategories({
        category: category !== undefined ? category : product.category,
        categories: categories !== undefined ? categories : product.categories,
      });
      product.category = normalizedCategories.category;
      product.categories = normalizedCategories.categories;
    }
    if (Array.isArray(variants)) product.variants = variants;
    if (variantItems !== undefined) {
      product.variantItems =
        nextVariantItems.length > 0
          ? nextVariantItems
          : deriveVariantItemsFromLegacy(
              Array.isArray(variants) ? variants : product.variants,
              nextVariantPrices,
              nextVariantMrps
            );
    }
    if (variantPrices !== undefined) product.variantPrices = normalizeVariantPrices(variantPrices);
    if (variantMrps !== undefined) product.variantMrps = normalizeVariantMrps(variantMrps);

    if (variantItems === undefined && (variantPrices !== undefined || variantMrps !== undefined || Array.isArray(variants))) {
      product.variantItems = deriveVariantItemsFromLegacy(
        Array.isArray(variants) ? variants : product.variants,
        nextVariantPrices,
        nextVariantMrps
      );
    }

    await product.save();

    if (category !== undefined || categories !== undefined) {
      const seller = await Seller.findById(req.sellerId);
      await syncSellerCategoryTags(seller, product.categories);
    }

    return res.json({ product });
  } catch (error) {
    return res.status(500).json({ message: "Unable to update product" });
  }
});

// ─── DELETE /products/:productId — Delete product (auth) ─────────────────
router.delete("/:productId", auth, async (req, res) => {
  return res.status(400).json({
    message: "Product deletion now requires email OTP verification.",
  });
});

router.post("/:productId/request-delete-otp", auth, async (req, res) => {
  try {
    const product = await Product.findOne({
      _id: req.params.productId,
      seller: req.sellerId,
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const seller = await Seller.findById(req.sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (!seller.businessEmail || !isValidEmail(seller.businessEmail)) {
      return res.status(400).json({
        message: "Add a valid business email in your profile before deleting a product.",
      });
    }

    const otp = generateOtp();
    seller.otp = hashOtp(otp);
    seller.otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    seller.otpPurpose = "product_delete";
    seller.otpTargetId = product._id.toString();
    await seller.save();
    await sendOtpEmail(seller.businessEmail, otp, seller.businessName);

    return res.json({
      message: "A verification OTP has been sent to your business email.",
      email: seller.businessEmail,
      productTitle: product.title,
    });
  } catch (error) {
    console.error("[request-product-delete-otp error]", error);
    return res.status(500).json({ message: "Unable to send product deletion OTP" });
  }
});

router.post("/:productId/confirm-delete", auth, async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ message: "OTP is required" });
    }

    const product = await Product.findOne({
      _id: req.params.productId,
      seller: req.sellerId,
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const seller = await Seller.findById(req.sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (
      !seller.otp ||
      !seller.otpExpiry ||
      seller.otpPurpose !== "product_delete" ||
      seller.otpTargetId !== product._id.toString()
    ) {
      return res.status(400).json({ message: "Request a fresh deletion OTP to continue." });
    }

    if (seller.otpExpiry < new Date()) {
      return res.status(400).json({ message: "OTP expired. Please request a new one." });
    }

    if (!verifyHashedOtp(String(otp).trim(), seller.otp)) {
      return res.status(400).json({ message: "Invalid OTP." });
    }

    seller.otp = null;
    seller.otpExpiry = null;
    seller.otpPurpose = null;
    seller.otpTargetId = null;
    await seller.save();

    await product.deleteOne();
    return res.json({ message: "Product deleted successfully." });
  } catch (error) {
    console.error("[confirm-product-delete error]", error);
    return res.status(500).json({ message: "Unable to delete product" });
  }
});

module.exports = router;
