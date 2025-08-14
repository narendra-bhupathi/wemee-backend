const express = require('express');
const router = express.Router();
const kycController = require('../controllers/kycController');
const authMiddleware = require('../middleware/authMiddleware');

// Apply authentication middleware to all KYC routes
router.use(authMiddleware);

// Submit KYC verification
router.post('/submit', kycController.submitKYC);

// Get KYC status
router.get('/status', kycController.getKYCStatus);

module.exports = router; 