const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const app = express();
const PORT = process.env.PORT || 5000;
require('dotenv').config();
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');
const travelRoutes = require('./routes/travelRoutes');
const walletRoutes = require('./routes/walletRoutes');
const productTypeRoutes = require('./routes/productTypeRoutes');
const sendReceiveRoutes = require('./routes/sendReceiveRoutes');
const bidRoutes = require('./routes/bidRoutes');
const chatRoutes = require('./routes/chatRoutes');
const kycRoutes = require('./routes/kycRoutes');
const tariffRoutes = require('./routes/tariffRoutes');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const { errorHandler } = require('./middleware/errorHandler');
const authMiddleware = require('./middleware/authMiddleware');

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please retry after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: true,
  skip: (req) => {
    return req.ip === '127.0.0.1' || req.ip === '::1';
  }
});
app.use(limiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes
app.use('/users', userRoutes);
app.use('/auth', authRoutes);
app.use('/travels', travelRoutes);
app.use('/wallet', walletRoutes);
app.use('/product-types', productTypeRoutes);
app.use('/send-receive', sendReceiveRoutes);
app.use('/bids', bidRoutes);
app.use('/chat', chatRoutes);
app.use('/kyc', kycRoutes);
app.use('/tariff', tariffRoutes);

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version
  });
});

// Greet endpoint
app.get('/greet', (req, res) => {
  res.json({ message: 'Hello from backend!' });
});

// Error handling
app.use(errorHandler);

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      // Validate message data
      if (!data.trip_id || !data.sender_id || !data.message) {
        console.error('Invalid message data:', data);
        return;
      }
      
      // Save message to database
      const pool = require('./db');
      const result = await pool.query(
        'INSERT INTO chat_messages (trip_id, sender_id, message) VALUES ($1, $2, $3) RETURNING *',
        [data.trip_id, data.sender_id, data.message]
      );
      
      // Add the saved message data to the broadcast
      const savedMessage = result.rows[0];
      const broadcastData = {
        ...data,
        id: savedMessage.id,
        created_at: savedMessage.created_at
      };
      
      // Broadcast message to all clients
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(broadcastData));
        }
      });
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {

  });
});

server.listen(PORT, () => {
  
});