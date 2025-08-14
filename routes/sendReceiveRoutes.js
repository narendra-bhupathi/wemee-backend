const express = require('express');
const router = express.Router();
const sendReceiveController = require('../controllers/sendReceiveController');
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

router.post('/', upload.single('product_image'), sendReceiveController.createSendReceiveEntry);
router.put('/:id', upload.single('product_image'), sendReceiveController.updateSendReceiveEntry);
router.post('/match', sendReceiveController.matchTravellers);
router.get('/', sendReceiveController.getSendReceiveEntries);
router.get('/by-username', sendReceiveController.getSendReceiveEntriesByUsername);
router.get('/stats/week', sendReceiveController.getWeeklySendersCount);

module.exports = router; 