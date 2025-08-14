const express = require('express');
const router = express.Router();
const walletController = require('../controllers/walletController');
const authMiddleware = require('../middleware/authMiddleware');

// All wallet routes require authentication
router.use(authMiddleware);

// GET /wallet -> current balance
router.get('/', walletController.getBalance);

// GET /wallet/transactions -> get transaction history
router.get('/transactions', walletController.getTransactions);

// POST /wallet/add -> add connects { amount }
router.post('/add', walletController.addConnects);

// POST /wallet/use -> use connects for services { amount, description }
router.post('/use', walletController.useConnects);

// POST /wallet/earn -> earn connects for services { amount, description }
router.post('/earn', walletController.earnConnects);

module.exports = router;
