const express = require("express");
const jwt = require("jsonwebtoken");
const Seller = require("../models/Seller");

const router = express.Router();

function issueAdminToken(username) {
  return jwt.sign(
    { role: "admin", username },
    process.env.JWT_SECRET || "dev_secret",
    { expiresIn: "12h" }
  );
}

function adminAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    return res.status(401).json({ message: "Admin token missing" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev_secret");
    if (payload?.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    req.adminUsername = payload.username || "admin";
    return next();
  } catch (_error) {
    return res.status(401).json({ message: "Invalid or expired admin token" });
  }
}

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  const expectedUsername = process.env.ADMIN_USERNAME || "admin";
  const expectedPassword = process.env.ADMIN_PASSWORD || "admin123";

  if (username !== expectedUsername || password !== expectedPassword) {
    return res.status(401).json({ message: "Invalid admin credentials" });
  }

  const token = issueAdminToken(expectedUsername);
  return res.json({ token, username: expectedUsername });
});

router.get("/sellers", adminAuth, async (req, res) => {
  try {
    const status = String(req.query.status || "pending").trim();
    const query =
      status && ["pending", "approved", "rejected"].includes(status)
        ? { approvalStatus: status }
        : {};

    const sellers = await Seller.find(query)
      .select(
        "businessName businessEmail phone approvalStatus createdAt updatedAt slug upiId businessAddress businessGST businessLogo favicon whatsappNumber callNumber approvedAt approvedBy idProofUrl addressProofUrl storePublished publishRequestedAt"
      )
      .sort({ createdAt: -1 });
    return res.json({ sellers });
  } catch (_error) {
    return res.status(500).json({ message: "Unable to fetch sellers" });
  }
});

router.patch("/sellers/:sellerId/approval", adminAuth, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ message: "Invalid approval status" });
    }

    const seller = await Seller.findById(req.params.sellerId);
    if (!seller) {
      return res.status(404).json({ message: "Seller not found" });
    }

    seller.approvalStatus = status;
    if (status === "approved") {
      seller.storePublished = true;
      seller.publishRequestedAt = seller.publishRequestedAt || new Date();
      seller.approvedAt = new Date();
      seller.approvedBy = req.adminUsername || "admin";
    } else {
      seller.storePublished = false;
      if (status === "pending") {
        seller.publishRequestedAt = new Date();
      }
      seller.approvedAt = null;
      seller.approvedBy = "";
    }

    await seller.save();
    return res.json({
      seller: {
        _id: seller._id,
        businessName: seller.businessName,
        phone: seller.phone,
        approvalStatus: seller.approvalStatus,
        storePublished: seller.storePublished,
        approvedAt: seller.approvedAt,
      },
    });
  } catch (_error) {
    return res.status(500).json({ message: "Unable to update seller approval" });
  }
});

module.exports = router;
