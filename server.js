import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5001;
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const requestsByIp = new Map();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;

app.disable("x-powered-by");
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin is not allowed by CORS"));
    },
    methods: ["GET", "POST"],
  }),
);
app.use(express.json({ limit: "1mb" }));

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip;
  const recentRequests = (requestsByIp.get(key) || []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );

  if (recentRequests.length >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({ error: "Too many requests. Please try again in a minute." });
  }

  recentRequests.push(now);
  requestsByIp.set(key, recentRequests);
  return next();
}

function buildContents(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) {
    throw new Error("Send between 1 and 40 chat messages.");
  }

  return messages.map((message) => {
    if (
      !message ||
      !["user", "model"].includes(message.role) ||
      typeof message.text !== "string" ||
      !message.text.trim() ||
      message.text.length > 12_000
    ) {
      throw new Error("Each message needs a role and up to 12,000 characters of text.");
    }

    return {
      role: message.role,
      parts: [{ text: message.text.trim() }],
    };
  });
}

app.get("/health", (_req, res) => {
  res.status(ai ? 200 : 503).json({ status: ai ? "ok" : "misconfigured" });
});

app.post("/api/chat/stream", rateLimit, async (req, res) => {
  if (!ai) return res.status(503).json({ error: "The server is missing GEMINI_API_KEY." });

  let contents;
  try {
    contents = buildContents(req.body?.messages);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  try {
    const stream = await ai.models.generateContentStream({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      contents,
    });

    for await (const chunk of stream) {
      if (!res.writableEnded) res.write(chunk.text || "");
    }
    res.end();
  } catch (error) {
    console.error("Gemini request failed:", error.message);
    if (!res.writableEnded) res.end();
  }
});

app.use((error, _req, res, _next) => {
  if (error.message === "Origin is not allowed by CORS") {
    return res.status(403).json({ error: error.message });
  }
  console.error("Unexpected server error:", error.message);
  return res.status(500).json({ error: "Unexpected server error." });
});

app.listen(PORT, () => {
  console.log(`Gemini backend running on port ${PORT}`);
});
