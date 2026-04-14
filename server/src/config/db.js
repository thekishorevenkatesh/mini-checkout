const mongoose = require("mongoose");

let isConnected = false;

async function connectDB() {
  if (isConnected || mongoose.connection.readyState === 1) {
    return;
  }

  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI is not configured");
  }

  await mongoose.connect(mongoUri);
  isConnected = true;
  console.log("MongoDB connected");
}

module.exports = connectDB;
