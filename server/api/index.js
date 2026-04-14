const app = require("../src/app");
const connectDB = require("../src/config/db");

module.exports = async (req, res) => {
  try {
    await connectDB();
    return app(req, res);
  } catch (error) {
    console.error("Serverless API error:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};
