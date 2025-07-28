// socket-session-server/index.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['https://qr-mirror-photo-git-main-idealink.vercel.app/', 'https://qr-mirror-photo.vercel.app/'],
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://cankocoglu:gwGiKF9QPZYjn9xN@alterna-mirror.g7s6b0y.mongodb.net/';


// Connect to MongoDB
mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
  status: { type: String, default: 'active' },
  photoUrl: { type: String }
});

const Session = mongoose.model('Session', sessionSchema);

// Create new session (called from /start page)
app.post('/api/session', async (req, res) => {
  const sessionId = uuidv4();
  try {
    await Session.create({ sessionId });
    io.emit('new-session', { sessionId, mirrorId: 'MIRROR_001' })
    res.json({ sessionId, url: `https://qr-mirror-photo-git-main-idealink.vercel.app/capture/${sessionId}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// Socket.IO logic
io.on('connection', (socket) => {
  console.log('🔌 New socket connection:', socket.id);

  socket.on('join-session', async (sessionId) => {
    const session = await Session.findOne({ sessionId });
    if (!session) {
      socket.emit('session-error', 'Invalid session');
      return;
    }
    socket.join(`session-${sessionId}`);
    console.log(`🧩 Socket ${socket.id} joined session-${sessionId}`);
  });

  socket.on('trigger-capture', async (sessionId) => {
    console.log(`📸 Capture requested for session-${sessionId}`);
    io.to(`session-${sessionId}`).emit('capture-now');
  });

  socket.on('photo-ready', async ({ sessionId, photoUrl }) => {
    console.log(`✅ Photo ready for session-${sessionId}: ${photoUrl}`);
    await Session.findOneAndUpdate({ sessionId }, { photoUrl });
    io.to(`session-${sessionId}`).emit('photo-ready', { url: photoUrl });
  });

  socket.on('end-session', async (sessionId) => {
    await Session.findOneAndDelete({ sessionId });
    io.to(`session-${sessionId}`).emit('session-ended');
    console.log(`🧹 Session ${sessionId} cleaned up`);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
