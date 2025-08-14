const express = require('express');
const router = express.Router();
const tariffController = require('../controllers/tariffController');
const authMiddleware = require('../middleware/authMiddleware');

// Apply auth middleware to all routes
router.use(authMiddleware);

// GET /tariff - Get all tariff settings
router.get('/', tariffController.getAllTariffs);

// PUT /tariff - Update tariff setting
router.put('/', tariffController.updateTariff);

module.exports = router;
