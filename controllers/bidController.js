const pool = require('../db');
const Joi = require('joi');
const createError = require('../utils/createError');

// Place or update a bid
exports.placeOrUpdateBid = async (req, res, next) => {
  try {
    const schema = Joi.object({
      trip_id: Joi.number().integer().positive().required(),
      amount: Joi.number().integer().positive().required(),
      sender_id: Joi.number().integer().positive().required()
    });
    const { error, value } = schema.validate(req.body);
    if (error) return next(new createError(400, error.details[0].message));
    const { trip_id, amount, sender_id } = value;

  

    // Check if trip exists and get status and capacity
    const { rows: tripRows } = await pool.query('SELECT status, baggage_space_available FROM travels WHERE id = $1', [trip_id]);
    if (!tripRows[0]) return next(new createError(404, 'Trip not found'));
    if (tripRows[0].status === 'completed') return next(new createError(400, 'This trip has already been completed with an accepted bid'));
    const rawCapacity = tripRows[0].baggage_space_available;
    const totalCapacityKg = Number(rawCapacity);
    if (!Number.isFinite(totalCapacityKg) || totalCapacityKg <= 0) {
      return next(new createError(400, 'Invalid or missing trip capacity'));
    }

    // Get sender's package weight (latest entry)
    const { rows: pkgRows } = await pool.query(
      'SELECT weight FROM send_receive_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [sender_id]
    );
    if (!pkgRows[0]) return next(new createError(400, 'Sender has no package entry with weight'));
    const rawWeight = pkgRows[0].weight;
    const packageWeightKg = Number(rawWeight);
    if (!Number.isFinite(packageWeightKg) || packageWeightKg <= 0) return next(new createError(400, 'Invalid package weight'));


    // Ensure package weight does not exceed total capacity for the trip
    if (packageWeightKg > totalCapacityKg) {
      return next(new createError(400, `Package exceeds trip capacity. Package: ${packageWeightKg} kg, Capacity: ${totalCapacityKg} kg`));
    }

    // Calculate remaining capacity after already accepted bids (use latest package weight per sender)
    const { rows: sumRows } = await pool.query(
      `SELECT COALESCE(SUM(latest.weight), 0)::float AS accepted_total
       FROM bids b
       JOIN (
         SELECT DISTINCT ON (user_id) user_id, weight
         FROM send_receive_entries
         ORDER BY user_id, created_at DESC
       ) AS latest ON latest.user_id = b.sender_id
       WHERE b.trip_id = $1 AND b.status = 'accepted'`,
      [trip_id]
    );
    const acceptedTotalKg = Number(sumRows[0]?.accepted_total || 0);
    const remainingCapacityKg = Math.max(0, totalCapacityKg - acceptedTotalKg);

    // Placement is allowed regardless of current remaining capacity; acceptance will enforce remaining capacity

    // Multiple accepted bids are allowed up to capacity; do not block on existing accepted bids

    // Get current highest active bid for this trip
    const { rows: activeBids } = await pool.query(
      'SELECT * FROM bids WHERE trip_id = $1 AND status = $2 ORDER BY amount DESC',
      [trip_id, 'active']
    );
    const highestBid = activeBids[0]?.amount || 0;
    

    // Check if sender already has an active bid
    const { rows: myBids } = await pool.query(
      'SELECT * FROM bids WHERE trip_id = $1 AND sender_id = $2 AND status = $3',
      [trip_id, sender_id, 'active']
    );
    const myBid = myBids[0];

    // First bid must be 100 connects
    if (activeBids.length === 0 && amount !== 100) {
      return next(new createError(400, 'First bid must be 100 connects'));
    }
    // If there are active bids, new bid must be higher than current max
    if (activeBids.length > 0 && amount <= highestBid) {
      return next(new createError(400, 'Bid must be higher than current highest bid'));
    }
    // If sender already has a bid, allow update (but not below current max)
    if (myBid) {
      if (amount <= highestBid && amount !== myBid.amount) {
        return next(new createError(400, 'Updated bid must be at least current highest bid'));
      }
      // Refund previous bid amount
      
      await pool.query('UPDATE users SET connects = connects + $1 WHERE id = $2', [myBid.amount, sender_id]);
      // Update bid
      await pool.query('UPDATE bids SET amount = $1, updated_at = NOW() WHERE id = $2', [amount, myBid.id]);
      
    } else {
      // New bid: check wallet balance and deduct connects
      const { rows: userRows } = await pool.query('SELECT connects FROM users WHERE id = $1', [sender_id]);
      if (!userRows[0]) return next(new createError(404, 'User not found'));
      
      const currentBalance = userRows[0].connects || 0;
      
      
      if (currentBalance < amount) {
        return next(new createError(400, `Insufficient connects in wallet. Current balance: ${currentBalance}, required: ${amount}`));
      }
      
      // Deduct connects and create bid
      await pool.query('UPDATE users SET connects = connects - $1 WHERE id = $2', [amount, sender_id]);
      await pool.query('INSERT INTO bids (trip_id, sender_id, amount) VALUES ($1, $2, $3)', [trip_id, sender_id, amount]);
      
      // Get updated balance
      const { rows: updatedUser } = await pool.query('SELECT connects FROM users WHERE id = $1', [sender_id]);
      
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error in placeOrUpdateBid:', err);
    next(new createError(500, err.message));
  }
};

// Get all bids for a trip
exports.getBidsForTrip = async (req, res, next) => {
  try {
    const trip_id = parseInt(req.params.tripId, 10);
    if (!trip_id) return next(new createError(400, 'tripId required'));
    const { rows } = await pool.query(
      'SELECT b.*, u.username FROM bids b JOIN users u ON b.sender_id = u.id WHERE b.trip_id = $1 ORDER BY b.amount DESC',
      [trip_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(new createError(500, err.message));
  }
};

// Traveller accepts a bid (transactional with auto-rejection of overweight active bids)
exports.acceptBid = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const bid_id = parseInt(req.params.bidId, 10);
    if (!bid_id) return next(new createError(400, 'bidId required'));

    await client.query('BEGIN');

    // Get bid and related package/trip data
    const { rows: bidRows } = await client.query('SELECT * FROM bids WHERE id = $1 FOR UPDATE', [bid_id]);
    if (!bidRows[0]) {
      await client.query('ROLLBACK');
      return next(new createError(404, 'Bid not found'));
    }
    const trip_id = bidRows[0].trip_id;
    const sender_id = bidRows[0].sender_id;

    // Lock all accepted bids for this trip to compute remaining capacity safely
    await client.query('SELECT id FROM bids WHERE trip_id = $1 AND status = $2 FOR UPDATE', [trip_id, 'accepted']);

    const { rows: tripRows } = await client.query('SELECT baggage_space_available FROM travels WHERE id = $1', [trip_id]);
    if (!tripRows[0]) {
      await client.query('ROLLBACK');
      return next(new createError(404, 'Trip not found'));
    }
    const rawCapacity = tripRows[0].baggage_space_available;
    const totalCapacityKg = Number(rawCapacity);
    if (!Number.isFinite(totalCapacityKg) || totalCapacityKg <= 0) {
      await client.query('ROLLBACK');
      return next(new createError(400, 'Invalid or missing trip capacity'));
    }

    const { rows: pkgRows } = await client.query(
      'SELECT weight FROM send_receive_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [sender_id]
    );
    if (!pkgRows[0]) {
      await client.query('ROLLBACK');
      return next(new createError(400, 'Sender has no package entry with weight'));
    }
    const rawWeight = pkgRows[0].weight;
    const packageWeightKg = Number(rawWeight);
    if (!Number.isFinite(packageWeightKg) || packageWeightKg <= 0) {
      await client.query('ROLLBACK');
      return next(new createError(400, 'Invalid package weight'));
    }

    // Sum already accepted weights for this trip
    const { rows: sumRows } = await client.query(
      `SELECT COALESCE(SUM(latest.weight), 0)::float AS accepted_total
       FROM bids b
       JOIN (
         SELECT DISTINCT ON (user_id) user_id, weight
         FROM send_receive_entries
         ORDER BY user_id, created_at DESC
       ) AS latest ON latest.user_id = b.sender_id
       WHERE b.trip_id = $1 AND b.status = 'accepted'`,
      [trip_id]
    );
    const acceptedTotalKg = Number(sumRows[0]?.accepted_total || 0);
    const remainingCapacityKg = Math.max(0, totalCapacityKg - acceptedTotalKg);
    if (packageWeightKg > remainingCapacityKg) {
      await client.query('ROLLBACK');
      return next(new createError(400, `Insufficient remaining capacity to accept this package. Remaining: ${remainingCapacityKg} kg, Package: ${packageWeightKg} kg`));
    }

    // Accept the bid
    await client.query('UPDATE bids SET status = $1 WHERE id = $2', ['accepted', bid_id]);

    // Recalculate remaining capacity after acceptance
    const newRemaining = remainingCapacityKg - packageWeightKg;

    // Auto-reject active bids that exceed new remaining capacity and refund connects
    const { rows: overweightBids } = await client.query(
      `SELECT b.id, b.sender_id, b.amount, latest.weight
       FROM bids b
       JOIN (
         SELECT DISTINCT ON (user_id) user_id, weight
         FROM send_receive_entries
         ORDER BY user_id, created_at DESC
       ) AS latest ON latest.user_id = b.sender_id
       WHERE b.trip_id = $1 AND b.status = 'active' AND latest.weight > $2`,
      [trip_id, newRemaining]
    );

    for (const row of overweightBids) {
      await client.query('UPDATE bids SET status = $1 WHERE id = $2', ['rejected', row.id]);
      await client.query('UPDATE users SET connects = connects + $1 WHERE id = $2', [row.amount, row.sender_id]);
    }

    await client.query('COMMIT');
    res.json({ success: true, rejectedCount: overweightBids.length, remainingCapacity: newRemaining });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    next(new createError(500, err.message));
  } finally {
    try { client.release(); } catch (_) {}
  }
};

// Traveller rejects a bid
exports.rejectBid = async (req, res, next) => {
  try {
    const bid_id = parseInt(req.params.bidId, 10);
    if (!bid_id) return next(new createError(400, 'bidId required'));
    // Refund the bid
    const { rows } = await pool.query('SELECT * FROM bids WHERE id = $1', [bid_id]);
    if (!rows[0]) return next(new createError(404, 'Bid not found'));
    await pool.query('UPDATE users SET connects = connects + $1 WHERE id = $2', [rows[0].amount, rows[0].sender_id]);
    await pool.query('UPDATE bids SET status = $1 WHERE id = $2', ['rejected', bid_id]);
    res.json({ success: true });
  } catch (err) {
    next(new createError(500, err.message));
  }
};

// Get all bids for a user
exports.getUserBids = async (req, res, next) => {
  try {
    const user_id = req.user.id;
    const { rows } = await pool.query(
      'SELECT b.*, t.departure_airport, t.arrival_airport FROM bids b JOIN travels t ON b.trip_id = t.id WHERE b.sender_id = $1 ORDER BY b.created_at DESC',
      [user_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(new createError(500, err.message));
  }
};

// Get current user's wallet balance
exports.getUserBalance = async (req, res, next) => {
  try {
    const user_id = req.user.id;
    const { rows } = await pool.query('SELECT connects FROM users WHERE id = $1', [user_id]);
    if (!rows[0]) return next(new createError(404, 'User not found'));
    res.json({ success: true, balance: rows[0].connects || 0 });
  } catch (err) {
    next(new createError(500, err.message));
  }
};