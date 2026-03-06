const { Server } = require('socket.io');

// Singleton socket.io instance — attached to HTTP server in index.js
const io = new Server({
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

module.exports = io;
