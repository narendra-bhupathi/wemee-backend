const express = require('express');
const router = express.Router();
const bidController = require('../controllers/bidController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// Place or update a bid
router.post('/', bidController.placeOrUpdateBid);
// More specific routes must come before parameterized routes
// Get all bids for current user
router.get('/user/balance', bidController.getUserBalance);
router.get('/user', bidController.getUserBids);
// Accept a bid
router.post('/:bidId/accept', bidController.acceptBid);
// Reject a bid
router.post('/:bidId/reject', bidController.rejectBid);
// Get all bids for a trip (keep last to avoid capturing '/user')
router.get('/:tripId', bidController.getBidsForTrip);

module.exports = router;