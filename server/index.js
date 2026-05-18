const express = require('express');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const rootEnvPath = path.resolve(__dirname, '../.env');
const serverEnvPath = path.resolve(__dirname, '.env');
const resolvedEnvPath = fs.existsSync(rootEnvPath) ? rootEnvPath : serverEnvPath;
require('dotenv').config({ path: resolvedEnvPath });

const app = express();
const server = http.createServer(app);
const clientDistPath = path.resolve(__dirname, '../client/dist');
const devOrigins = ['http://localhost:5173', 'http://localhost:5174'];
const configuredOrigins = [process.env.CLIENT_URL, process.env.CLIENT_ORIGIN, process.env.CORS_ORIGIN]
  .filter(Boolean)
  .flatMap((value) => value.split(','))
  .map((origin) => origin.trim())
  .filter(Boolean);
const inferredOrigins = [process.env.RENDER_EXTERNAL_URL, process.env.RENDER_PUBLIC_URL]
  .filter(Boolean)
  .map((origin) => origin.trim());
const explicitOrigins = [...new Set([...configuredOrigins, ...inferredOrigins])];
const allowedOrigins = [...new Set([
  ...(process.env.NODE_ENV === 'production' ? [] : devOrigins),
  ...explicitOrigins
])];
const hasExplicitOrigins = explicitOrigins.length > 0;
const isAllowedOrigin = (origin) => !origin || !hasExplicitOrigins || allowedOrigins.includes(origin);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ["GET", "POST"]
  }
});

// Middleware
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
app.use(express.json());

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

// Database Connection
if (!process.env.MONGO_URI) {
  console.error(`Missing MONGO_URI. Create ${resolvedEnvPath} or set the environment variable before starting the server.`);
  process.exit(1);
}

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/metrics', require('./routes/fitness')); // Disguised route
app.use('/api/sync-center', require('./routes/chat')); // Disguised route

// Socket.IO logic
require('./sockets/chat')(io);

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }

    return res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
