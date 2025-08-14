const express = require('express');
const router = express.Router();
const travelController = require('../controllers/travelController');

router.use(travelController.authMiddleware);

// Create new trip
router.post('/', travelController.createTravel);

// Get user's trips
router.get('/my', travelController.getMyTravels);

// Get all trips (for search/listings - only KYC verified and active)
router.get('/all', travelController.getAllTravels);

// Get trips by user ID
router.get('/', travelController.getTravelsByUser);

// Weekly stats
router.get('/stats/week', travelController.getWeeklyVerifiedActiveCount);

// Get specific trip by ID
router.get('/:id', travelController.getTravelById);

// Update trip
router.put('/:id', travelController.updateTravel);

// Cancel trip
router.post('/:id/cancel', travelController.cancelTrip);

module.exports = router;