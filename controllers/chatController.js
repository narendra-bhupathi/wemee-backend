const pool = require('../db');
const createError = require('../utils/createError');

// Get chat messages for a trip
exports.getChatMessages = async (req, res, next) => {
  try {
    const trip_id = parseInt(req.params.tripId, 10);
    if (!trip_id) return next(new createError(400, 'tripId required'));
    
    const { rows } = await pool.query(
      'SELECT * FROM chat_messages WHERE trip_id = $1 ORDER BY created_at ASC',
      [trip_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(new createError(500, err.message));
  }
};

// Send a chat message
exports.sendMessage = async (req, res, next) => {
  try {
    const { trip_id, sender_id, message } = req.body;
    if (!trip_id || !sender_id || !message) {
      return next(new createError(400, 'trip_id, sender_id, and message are required'));
    }
    
    const result = await pool.query(
      'INSERT INTO chat_messages (trip_id, sender_id, message) VALUES ($1, $2, $3) RETURNING *',
      [trip_id, sender_id, message]
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    next(new createError(500, err.message));
  }
};

// Get accepted bid for a trip (for chat participants)
exports.getAcceptedBid = async (req, res, next) => {
  try {
    const trip_id = parseInt(req.params.tripId, 10);
    if (!trip_id) return next(new createError(400, 'tripId required'));
    
    const { rows } = await pool.query(
      'SELECT b.*, u.username FROM bids b JOIN users u ON b.sender_id = u.id WHERE b.trip_id = $1 AND b.status = $2',
      [trip_id, 'accepted']
    );
    
    if (rows.length === 0) {
      return next(new createError(404, 'No accepted bid found for this trip'));
    }
    
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(new createError(500, err.message));
  }
};

module.exports = exports; 