const express = require("express");
const jwt = require("jsonwebtoken");
const Seller = require("../models/Seller");
const auth = require("../middleware/auth");
const { slugify } = require("../utils/slug");

const router = express.Router();

function issueToken(sellerId) {
  return jwt.sign({ sellerId }, process.env.JWT_SECRET || "dev_secret", {
    expiresIn: "7d",
  });
}

async function createUniqueSellerSlug(businessName, ignoreSellerId = null) {
  const base = slugify(businessName) || "seller";
  let candidate = base;
  let counter = 1;

  while (true) {
    const existing = await Seller.findOne({ slug: candidate }).select("_id");
    const isCurrentSeller =
      existing && ignoreSellerId && existing._id.toString() === ignoreSellerId;

    if (!existing || isCurrentSeller) {
      return candidate;
    }

    candidate = `${base}-${counter}`;
    counter += 1;
  }
}

router.post("/login", async (req, res) => {
  try {
    const { businessName, phone, upiId } = req.body;

    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    let seller = await Seller.findOne({ phone: String(phone).trim() });

    if (!seller) {
      if (!businessName) {
        return res
          .status(400)
          .json({ message: "Business name is required for new seller" });
      }

      seller = await Seller.create({
        slug: await createUniqueSellerSlug(String(businessName).trim()),
        businessName: String(businessName).trim(),
        phone: String(phone).trim(),
        upiId: upiId ? String(upiId).trim() : "",
      });
    } else {
      if (businessName) {
        seller.businessName = String(businessName).trim();
      }

      if (typeof upiId === "string") {
        seller.upiId = upiId.trim();
      }

      if (!seller.slug) {
        seller.slug = await createUniqueSellerSlug(
          seller.businessName,
          seller._id.toString()
        );
      }

      await seller.save();
    }

    const token = issueToken(seller._id.toString());
    return res.json({
      token,
      seller,
    });
  } catch (error) {
    return res.status(500).json({ message: "Unable to login seller" });
  }
});

router.get("/me", auth, async (req, res) => {
  try {
    const seller = await Seller.findById(req.sellerId);

    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (!seller.slug) {
      seller.slug = await createUniqueSellerSlug(
        seller.businessName,
        seller._id.toString()
      );
      await seller.save();
    }

    return res.json({ seller });
  } catch (error) {
    return res.status(500).json({ message: "Unable to fetch profile" });
  }
});

router.put("/me", auth, async (req, res) => {
  try {
    const { businessName, upiId, profileImageUrl } = req.body;
    const seller = await Seller.findById(req.sellerId);

    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    if (businessName) {
      seller.businessName = String(businessName).trim();
    }

    if (typeof upiId === "string") {
      seller.upiId = upiId.trim();
    }

    if (typeof profileImageUrl === "string") {
      seller.profileImageUrl = profileImageUrl.trim();
    }

    if (!seller.slug) {
      seller.slug = await createUniqueSellerSlug(
        seller.businessName,
        seller._id.toString()
      );
    }

    await seller.save();
    return res.json({ seller });
  } catch (error) {
    return res.status(500).json({ message: "Unable to update profile" });
  }
});

module.exports = router;
