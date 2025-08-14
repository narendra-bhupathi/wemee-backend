const pool = require('../db');
const { verifyToken } = require('../utils/authUtils');
const tariffController = require('./tariffController');

// Middleware to authenticate and attach userId
exports.authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Auth required' });
  try {
    const decoded = verifyToken(token);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Check if user can edit/cancel trip
const canEditTrip = async (tripId, userId) => {
  try {
    // Check if trip has accepted bids
    const bidsResult = await pool.query(
      'SELECT COUNT(*) FROM bids WHERE trip_id = $1 AND status = $2',
      [tripId, 'accepted']
    );
    const hasAcceptedBids = parseInt(bidsResult.rows[0].count) > 0;

    // Get trip details
    const tripResult = await pool.query(
      'SELECT * FROM travels WHERE id = $1 AND user_id = $2',
      [tripId, userId]
    );

    if (tripResult.rows.length === 0) {
      return { canEdit: false, reason: 'Trip not found or not owned by user' };
    }

    const trip = tripResult.rows[0];
    const now = new Date();
    const departureDate = new Date(trip.flight_departure_datetime);

    // Check if travel date has passed
    if (departureDate <= now) {
      return { canEdit: false, reason: 'Travel date has already passed' };
    }

    // Check if trip has accepted bids
    if (hasAcceptedBids) {
      return { canEdit: false, reason: 'Trip has accepted bids and cannot be edited' };
    }

    return { canEdit: true };
  } catch (error) {
    console.error('Error checking trip editability:', error);
    return { canEdit: false, reason: 'Error checking trip status' };
  }
};

// Check if trip can be cancelled
const canCancelTrip = async (tripId, userId) => {
  try {
    const tripResult = await pool.query(
      'SELECT * FROM travels WHERE id = $1 AND user_id = $2',
      [tripId, userId]
    );

    if (tripResult.rows.length === 0) {
      return { canCancel: false, reason: 'Trip not found or not owned by user' };
    }

    const trip = tripResult.rows[0];
    const now = new Date();
    const departureDate = new Date(trip.flight_departure_datetime);

    // Can cancel until travel start date
    if (departureDate <= now) {
      return { canCancel: false, reason: 'Travel date has already passed' };
    }

    // Cannot cancel if any bid has been accepted
    const bidsResult = await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM bids WHERE trip_id = $1 AND status = $2',
      [tripId, 'accepted']
    );
    if ((bidsResult.rows[0]?.cnt || 0) > 0) {
      return { canCancel: false, reason: "Trips has accepted bids you can't cancel the trip" };
    }

    return { canCancel: true };
  } catch (error) {
    console.error('Error checking trip cancellation:', error);
    return { canCancel: false, reason: 'Error checking trip status' };
  }
};

// Auto-complete trips that have passed their arrival date
const autoCompleteTrips = async () => {
  try {
    const result = await pool.query(
      `UPDATE travels 
       SET status = 'completed', completed_at = CURRENT_TIMESTAMP 
       WHERE status IN ('upcoming','active')
       AND (flight_arrival_datetime::date) < CURRENT_DATE`
    );
    return result.rowCount;
  } catch (error) {
    console.error('Error auto-completing trips:', error);
    return 0;
  }
};

// GET /travels/my - list travels for logged-in user
exports.getMyTravels = async (req, res) => {
  try {
    // Auto-complete trips first
    await autoCompleteTrips();

    // Join users to derive up-to-date KYC status
    const result = await pool.query(
      `SELECT t.*, (u.kyc_status = 'verified')::boolean AS kyc_verified,
              EXISTS (
                SELECT 1 FROM bids b 
                WHERE b.trip_id = t.id AND b.status = 'accepted'
              ) AS has_accepted_bids
       FROM travels t
       JOIN users u ON t.user_id = u.id
       WHERE t.user_id = $1
       ORDER BY t.flight_departure_datetime DESC`,
      [req.userId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Create new travel with enhanced validation
exports.createTravel = async (req, res) => {
  const {
    current_location,
    current_country,
    departure_airport,
    layover_airport,
    arrival_airport,
    flight_departure_datetime,
    flight_arrival_datetime,
    travelling_location,
    travelling_country,
    airplane_name,
    flight_number,
    baggage_space_available
  } = req.body;

  const user_id = req.userId; // Get user ID from authenticated user

  if (!current_location || !current_country || !departure_airport || !arrival_airport || !flight_departure_datetime || !flight_arrival_datetime || !travelling_location || !travelling_country || !airplane_name || !flight_number) {
    return res.status(400).json({ error: 'All required fields must be provided' });
  }

  try {
    console.log('Creating travel for user_id:', user_id);
    
    // Check if user exists
    const userResult = await pool.query(
      'SELECT id, kyc_status FROM users WHERE id = $1',
      [user_id]
    );

    if (userResult.rows.length === 0) {
      console.log('User not found:', user_id);
      return res.status(404).json({ error: 'User not found' });
    }

    const kycStatus = userResult.rows[0].kyc_status;
    console.log('KYC status for user:', kycStatus);

    // Get minimum connects required
    const minConnects = await tariffController.getMinConnectsForTrip();
    console.log('Minimum connects required:', minConnects);

    // Check user's connects balance
    const connectsResult = await pool.query(
      'SELECT connects FROM users WHERE id = $1',
      [user_id]
    );

    const userConnects = connectsResult.rows[0]?.connects || 0;
    console.log('User connects balance:', userConnects);
    
    if (userConnects < minConnects) {
      console.log('Insufficient connects');
      return res.status(400).json({ 
        error: 'Insufficient connects', 
        message: `You need at least ${minConnects} connects to create a trip. Current balance: ${userConnects}`,
        required: minConnects,
        current: userConnects
      });
    }

    // Deduct connects and create trip
    await pool.query('BEGIN');

    // Deduct connects from user
    await pool.query(
      'UPDATE users SET connects = connects - $1 WHERE id = $2',
      [minConnects, user_id]
    );

    // Create the trip
    const result = await pool.query(
      `INSERT INTO travels (
        user_id, current_location, current_country, departure_airport, layover_airport, 
        arrival_airport, flight_departure_datetime, flight_arrival_datetime, 
        travelling_location, travelling_country, airplane_name, flight_number, 
        baggage_space_available, status, connects_deducted, kyc_verified
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
      [
        user_id, current_location, current_country, departure_airport, layover_airport,
        arrival_airport, flight_departure_datetime, flight_arrival_datetime,
        travelling_location, travelling_country, airplane_name, flight_number,
        baggage_space_available, 'upcoming', minConnects, kycStatus === 'verified'
      ]
    );

    // Log wallet transaction for trip creation (debit)
    await pool.query(
      'INSERT INTO transactions (user_id, description, amount, type) VALUES ($1, $2, $3, $4)',
      [
        user_id,
        `Used ${minConnects} Connects for Travel`,
        minConnects,
        'debit'
      ]
    );

    await pool.query('COMMIT');

    console.log('Trip created successfully');
    res.status(201).json({
      ...result.rows[0],
      connects_deducted: minConnects,
      message: `Trip created successfully. ${minConnects} connects deducted.`
    });
  } catch (err) {
    console.error('Error creating travel:', err);
    await pool.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
};

// Update travel with validation
exports.updateTravel = async (req, res) => {
  const tripId = req.params.id;
  const userId = req.userId;

  try {
    // Check if trip can be edited
    const editCheck = await canEditTrip(tripId, userId);
    if (!editCheck.canEdit) {
      return res.status(400).json({ error: editCheck.reason });
    }

    const updateData = req.body;
    const allowedFields = [
      'current_location', 'current_country', 'departure_airport', 'layover_airport',
      'arrival_airport', 'flight_departure_datetime', 'flight_arrival_datetime',
      'travelling_location', 'travelling_country', 'airplane_name', 'flight_number',
      'baggage_space_available'
    ];

    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        updateFields.push(`${field} = $${paramCount}`);
        updateValues.push(updateData[field]);
        paramCount++;
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(tripId);

    const result = await pool.query(
      `UPDATE travels SET ${updateFields.join(', ')} WHERE id = $${paramCount} AND user_id = $${paramCount + 1} RETURNING *`,
      [...updateValues, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found or not owned by user' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Cancel trip
exports.cancelTrip = async (req, res) => {
  const tripId = req.params.id;
  const userId = req.userId;

  try {
    // Check if trip can be cancelled
    const cancelCheck = await canCancelTrip(tripId, userId);
    if (!cancelCheck.canCancel) {
      return res.status(400).json({ error: cancelCheck.reason });
    }

    // Get trip details for refund
    const tripResult = await pool.query(
      'SELECT connects_deducted FROM travels WHERE id = $1 AND user_id = $2',
      [tripId, userId]
    );

    if (tripResult.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found or not owned by user' });
    }

    const connectsDeducted = tripResult.rows[0].connects_deducted;

    await pool.query('BEGIN');

    // Cancel the trip
    await pool.query(
      'UPDATE travels SET status = $1, cancelled_at = CURRENT_TIMESTAMP WHERE id = $2',
      ['cancelled', tripId]
    );

    // Refund connects if any were deducted
    if (connectsDeducted > 0) {
      await pool.query(
        'UPDATE users SET connects = connects + $1 WHERE id = $2',
        [connectsDeducted, userId]
      );

      // Log wallet transaction for trip cancellation refund (credit)
      await pool.query(
        'INSERT INTO transactions (user_id, description, amount, type) VALUES ($1, $2, $3, $4)',
        [
          userId,
          `Refunded ${connectsDeducted} Connects for Cancelled Travel`,
          connectsDeducted,
          'credit'
        ]
      );
    }

    await pool.query('COMMIT');

    res.json({ 
      success: true, 
      message: `Trip cancelled successfully. ${connectsDeducted} connects refunded.` 
    });
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
};

// Get all travels (only KYC verified and upcoming)
exports.getAllTravels = async (req, res) => {
  try {
    // Auto-complete trips first
    await autoCompleteTrips();

    // Use user's current KYC status instead of stored trip flag
    const result = await pool.query(`
      SELECT t.*, u.username, u.contact, (u.kyc_status = 'verified')::boolean AS kyc_verified
      FROM travels t
      JOIN users u ON t.user_id = u.id
      WHERE t.status IN ('upcoming','active') 
      AND u.kyc_status = 'verified'
      ORDER BY t.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get travel by ID
exports.getTravelById = async (req, res) => {
  const tripId = req.params.id;

  try {
    const result = await pool.query(`
      SELECT t.*, u.username, u.contact
      FROM travels t
      JOIN users u ON t.user_id = u.id
      WHERE t.id = $1
    `, [tripId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get all travel entries for a user
exports.getTravelsByUser = async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  
  try {
    const result = await pool.query(
      'SELECT t.*, u.username, u.contact FROM travels t JOIN users u ON t.user_id = u.id WHERE t.user_id = $1 ORDER BY t.created_at DESC',
      [user_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}; 

// Weekly stats: count of upcoming (next 7 days) upcoming trips with KYC verified
exports.getWeeklyVerifiedActiveCount = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM travels
       WHERE status IN ('upcoming','active')
         AND kyc_verified = true
         AND flight_departure_datetime BETWEEN NOW() AND NOW() + INTERVAL '7 days'`
    );
    const count = result.rows[0]?.count || 0;
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};