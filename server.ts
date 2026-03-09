import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-goldx-key";
const db = new Database("trading.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    balance REAL DEFAULT 1000.0
  );

  CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    lotSize REAL,
    direction TEXT, -- 'buy' or 'sell'
    entryPrice REAL,
    closePrice REAL,
    startTime INTEGER,
    closeTime INTEGER,
    status TEXT DEFAULT 'open', -- 'open', 'closed'
    pnl REAL DEFAULT 0,
    FOREIGN KEY(userId) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS candles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    open REAL,
    high REAL,
    low REAL,
    close REAL,
    timestamp INTEGER
  );
`);

// Seed initial candles if empty
const candleCount = db.prepare("SELECT COUNT(*) as count FROM candles").get() as any;
if (candleCount.count === 0) {
  let seedPrice = 2350.50;
  const now = Math.floor(Date.now() / 5000) * 5000;
  for (let i = 100; i > 0; i--) {
    const timestamp = now - (i * 5000);
    const open = seedPrice;
    const close = seedPrice + (Math.random() - 0.5) * 2;
    const high = Math.max(open, close) + Math.random();
    const low = Math.min(open, close) - Math.random();
    db.prepare("INSERT INTO candles (open, high, low, close, timestamp) VALUES (?, ?, ?, ?, ?)")
      .run(open, high, low, close, timestamp);
    seedPrice = close;
  }
}

const app = express();
app.use(express.json());
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

// Market Simulation State
const lastCandle = db.prepare("SELECT close FROM candles ORDER BY timestamp DESC LIMIT 1").get() as any;
let currentPrice = lastCandle ? lastCandle.close : 2350.50;
let currentCandle: { open: number; high: number; low: number; close: number; timestamp: number } | null = null;
const CANDLE_DURATION = 5000; // 5 second candles

function generateCandle() {
  const now = Math.floor(Date.now() / CANDLE_DURATION) * CANDLE_DURATION;
  
  if (!currentCandle || now > currentCandle.timestamp) {
    if (currentCandle) {
      db.prepare("INSERT INTO candles (open, high, low, close, timestamp) VALUES (?, ?, ?, ?, ?)")
        .run(currentCandle.open, currentCandle.high, currentCandle.low, currentCandle.close, currentCandle.timestamp);
    }
    currentCandle = {
      open: currentPrice,
      high: currentPrice,
      low: currentPrice,
      close: currentPrice,
      timestamp: now
    };
  }

  const volatility = 0.8;
  const change = (Math.random() - 0.5) * volatility;
  
  // Rigging Logic: Adjust price based on sentiment
  const activeTrades = db.prepare("SELECT lotSize, direction FROM trades WHERE status = 'open'").all() as any[];
  let buyVolume = 0;
  let sellVolume = 0;
  
  activeTrades.forEach(t => {
    if (t.direction === 'buy') buyVolume += t.lotSize;
    else sellVolume += t.lotSize;
  });

  let bias = 0;
  if (buyVolume + sellVolume > 0) {
    bias = (sellVolume - buyVolume) / (buyVolume + sellVolume) * 0.1;
  }

  currentPrice += change + bias;
  
  currentCandle.close = currentPrice;
  currentCandle.high = Math.max(currentCandle.high, currentPrice);
  currentCandle.low = Math.min(currentCandle.low, currentPrice);

  io.emit("price_update", { 
    price: currentPrice, 
    candle: currentCandle,
    timestamp: Date.now() 
  });
}

setInterval(generateCandle, 1000);

// API Routes
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = db.prepare("INSERT INTO users (username, password) VALUES (?, ?)").run(username, hashedPassword);
    const token = jwt.sign({ userId: result.lastInsertRowid }, JWT_SECRET);
    res.json({ token, user: { id: result.lastInsertRowid, username, balance: 1000 } });
  } catch (e) {
    res.status(400).json({ error: "Username already exists" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
  if (user && await bcrypt.compare(password, user.password)) {
    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    res.json({ token, user: { id: user.id, username: user.username, balance: user.balance } });
  } else {
    res.status(401).json({ error: "Invalid credentials" });
  }
});

app.get("/api/me", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const user = db.prepare("SELECT id, username, balance FROM users WHERE id = ?").get(decoded.userId) as any;
    res.json(user);
  } catch (e) {
    res.status(401).json({ error: "Invalid token" });
  }
});

app.post("/api/trade", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { lotSize, direction } = req.body;
    
    const user = db.prepare("SELECT balance FROM users WHERE id = ?").get(decoded.userId) as any;
    if (user.balance < 10) return res.status(400).json({ error: "Insufficient balance for margin" });
    
    const startTime = Date.now();
    const result = db.prepare("INSERT INTO trades (userId, lotSize, direction, entryPrice, startTime) VALUES (?, ?, ?, ?, ?)")
      .run(decoded.userId, lotSize, direction, currentPrice, startTime);
    
    res.json({ id: result.lastInsertRowid, entryPrice: currentPrice, startTime });
  } catch (e) {
    res.status(401).json({ error: "Invalid token" });
  }
});

app.post("/api/trade/close", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const { tradeId } = req.body;
    
    const trade = db.prepare("SELECT * FROM trades WHERE id = ? AND userId = ? AND status = 'open'").get(tradeId, decoded.userId) as any;
    if (!trade) return res.status(404).json({ error: "Trade not found" });
    
    const pnl = trade.direction === 'buy' 
      ? (currentPrice - trade.entryPrice) * trade.lotSize * 100 
      : (trade.entryPrice - currentPrice) * trade.lotSize * 100;
    
    db.prepare("UPDATE trades SET status = 'closed', closePrice = ?, closeTime = ?, pnl = ? WHERE id = ?")
      .run(currentPrice, Date.now(), pnl, tradeId);
    
    db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(pnl, decoded.userId);
    
    const user = db.prepare("SELECT balance FROM users WHERE id = ?").get(decoded.userId) as any;
    io.to(`user_${decoded.userId}`).emit("balance_update", { balance: user.balance });
    
    res.json({ tradeId, pnl, closePrice: currentPrice, balance: user.balance });
  } catch (e) {
    res.status(401).json({ error: "Invalid token" });
  }
});

app.get("/api/trades", (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const trades = db.prepare("SELECT * FROM trades WHERE userId = ? ORDER BY startTime DESC LIMIT 50").all(decoded.userId);
    res.json(trades);
  } catch (e) {
    res.status(401).json({ error: "Invalid token" });
  }
});

app.get("/api/candles", (req, res) => {
  const candles = db.prepare("SELECT * FROM candles ORDER BY timestamp DESC LIMIT 100").all();
  res.json(candles.reverse());
});

// Socket Auth
io.on("connection", (socket) => {
  socket.on("authenticate", (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      socket.join(`user_${decoded.userId}`);
      socket.emit("authenticated");
    } catch (e) {
      socket.emit("unauthorized");
    }
  });
});

// Vite Integration
if (process.env.NODE_ENV !== "production") {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(__dirname, "dist")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
  });
}

const PORT = 3000;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
