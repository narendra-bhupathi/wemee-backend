const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Get chat messages for a trip
router.get('/:tripId/messages', chatController.getChatMessages);

// Send a chat message
router.post('/send', chatController.sendMessage);

// Get accepted bid for a trip
router.get('/:tripId/accepted-bid', chatController.getAcceptedBid);

module.exports = router; 