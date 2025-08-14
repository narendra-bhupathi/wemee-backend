const pool = require('../db');
const path = require('path');
const Joi = require('joi');
const createError = require('../utils/createError');

exports.createSendReceiveEntry = async (req, res, next) => {
  try {
    const schema = Joi.object({
      user_id: Joi.number().integer().positive().required(),
      product_type_id: Joi.number().integer().positive().required(),
      product_name: Joi.string().min(2).max(100).required(),
      weight: Joi.number().positive().precision(2).required(),
      preferred_date: Joi.date().required(),
      pickup_location: Joi.string().min(2).max(100).required(),
      pickup_country: Joi.string().min(2).max(50).required(),
      delivery_location: Joi.string().min(2).max(100).required(),
      delivery_country: Joi.string().min(2).max(50).required(),
      product_image: Joi.string().optional()
    });
    
    const { error, value } = schema.validate({
      ...req.body,
      product_image: req.file?.filename
    });

    if (error) {
      return next(new createError(400, error.details[0].message));
    }

    const {
      user_id, product_type_id, product_name, weight, preferred_date,
      pickup_location, pickup_country, delivery_location, delivery_country
    } = value;

    const product_image = req.file?.filename || null;

    const result = await pool.query(
      `INSERT INTO send_receive_entries (user_id, product_type_id, product_name, weight, product_image, preferred_date, pickup_location, pickup_country, delivery_location, delivery_country)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [user_id, product_type_id, product_name, weight, product_image, preferred_date, pickup_location, pickup_country, delivery_location, delivery_country]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    next(new createError(500, err.message));
  }
};

// Update an existing send/receive entry
exports.updateSendReceiveEntry = async (req, res, next) => {
  try {
    const idSchema = Joi.object({ id: Joi.number().integer().positive().required() });
    const { error: idError, value: idValue } = idSchema.validate({ id: req.params.id });
    if (idError) {
      return next(new createError(400, idError.details[0].message));
    }
    const { id } = idValue;

    const schema = Joi.object({
      user_id: Joi.number().integer().positive().required(),
      product_type_id: Joi.number().integer().positive().required(),
      product_name: Joi.string().min(2).max(100).required(),
      weight: Joi.number().positive().precision(2).required(),
      preferred_date: Joi.date().required(),
      pickup_location: Joi.string().min(2).max(100).required(),
      pickup_country: Joi.string().min(2).max(50).required(),
      delivery_location: Joi.string().min(2).max(100).required(),
      delivery_country: Joi.string().min(2).max(50).required(),
      product_image: Joi.string().optional()
    });

    const { error, value } = schema.validate({
      ...req.body,
      product_image: req.file?.filename
    });

    if (error) {
      return next(new createError(400, error.details[0].message));
    }

    const {
      user_id, product_type_id, product_name, weight, preferred_date,
      pickup_location, pickup_country, delivery_location, delivery_country
    } = value;

    // Ensure the entry exists and belongs to the user
    const existingRes = await pool.query(
      'SELECT product_image FROM send_receive_entries WHERE id = $1 AND user_id = $2',
      [id, user_id]
    );
    if (existingRes.rows.length === 0) {
      return next(new createError(404, 'Entry not found'));
    }

    const existingImage = existingRes.rows[0].product_image || null;
    const product_image = req.file?.filename || existingImage;

    const updateRes = await pool.query(
      `UPDATE send_receive_entries
       SET product_type_id = $1,
           product_name = $2,
           weight = $3,
           product_image = $4,
           preferred_date = $5,
           pickup_location = $6,
           pickup_country = $7,
           delivery_location = $8,
           delivery_country = $9
       WHERE id = $10 AND user_id = $11
       RETURNING *`,
      [
        product_type_id, product_name, weight, product_image, preferred_date,
        pickup_location, pickup_country, delivery_location, delivery_country,
        id, user_id
      ]
    );

    res.status(200).json({
      success: true,
      data: updateRes.rows[0]
    });
  } catch (err) {
    next(new createError(500, err.message));
  }
};

// Get all send/receive entries with filtering
exports.getAllSendReceiveEntries = async (req, res, next) => {
  try {
    const {
      search = '',
      country = '',
      date = '',
      username = ''
    } = req.query;

    // Validate search parameters
    const searchSchema = Joi.object({
      search: Joi.string().min(0).max(100).optional(),
      country: Joi.string().min(0).max(50).optional(),
      date: Joi.date().optional().allow(''),
      username: Joi.string().min(0).max(100).optional()
    });

    const { error: searchError } = searchSchema.validate({
      search, country, date, username
    });

    if (searchError) {
      return res.status(400).json({
        success: false,
        message: searchError.details[0].message
      });
    }

    let query = `
      SELECT 
        sre.id,
        sre.user_id,
        sre.product_type_id,
        sre.product_name,
        sre.weight,
        sre.product_image,
        sre.preferred_date,
        sre.pickup_location,
        sre.pickup_country,
        sre.delivery_location,
        sre.delivery_country,
        sre.created_at,
        u.username,
        pt.name as product_type_name
      FROM send_receive_entries sre
      LEFT JOIN users u ON sre.user_id = u.id
      LEFT JOIN product_types pt ON sre.product_type_id = pt.id
    `;

    const filters = [];
    const params = [];

    if (search) {
      filters.push(`LOWER(sre.product_name) LIKE LOWER($${params.length + 1})`);
      params.push(`%${search}%`);
    }

    if (country) {
      filters.push(`LOWER(sre.delivery_country) LIKE LOWER($${params.length + 1})`);
      params.push(`%${country}%`);
    }

    if (date) {
      filters.push(`sre.preferred_date >= $${params.length + 1}`);
      params.push(date);
    }

    if (username) {
      filters.push(`LOWER(u.username) = LOWER($${params.length + 1})`);
      params.push(username);
    }

    if (filters.length > 0) {
      query += ` WHERE ${filters.join(' AND ')}`;
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, params);

    res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

// Delete a send/receive entry by ID
exports.deleteSendReceiveEntry = async (req, res, next) => {
  try {
    const schema = Joi.object({ id: Joi.number().integer().positive().required() });
    const { error, value } = schema.validate({ id: req.params.id });
    if (error) {
      return next(new createError(400, error.details[0].message));
    }
    const { id } = value;
    const result = await pool.query('DELETE FROM send_receive_entries WHERE id = $1 RETURNING id', [id]);
    if (result.rowCount === 0) {
      return next(new createError(404, 'Entry not found'));
    }
    res.status(200).json({ success: true, message: 'Entry deleted successfully' });
  } catch (err) {
    next(new createError(500, err.message));
  }
};

// Match travellers with enhanced filtering (respect package weight vs remaining capacity)
exports.matchTravellers = async (req, res, next) => {
  try {
    const schema = Joi.object({
      delivery_country: Joi.string().min(2).max(50).required(),
      user_id: Joi.number().integer().positive().required(), // Add user_id to request
      date: Joi.date().optional()
    }).unknown(true);

    const { error, value } = schema.validate(req.body);

    if (error) {
      return next(new createError(400, error.details[0].message));
    }

    const { delivery_country, user_id } = value;

    // Get latest package weight for the sender
    const { rows: pkgRows } = await pool.query(
      'SELECT weight FROM send_receive_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [user_id]
    );
    const senderWeight = Number(pkgRows[0]?.weight || 0);

    const query = `
      WITH accepted_weights AS (
        SELECT b.trip_id, SUM(latest.weight)::float AS sum_weight
        FROM bids b
        JOIN (
          SELECT DISTINCT ON (user_id) user_id, weight
          FROM send_receive_entries
          ORDER BY user_id, created_at DESC
        ) AS latest ON latest.user_id = b.sender_id
        WHERE b.status = 'accepted'
        GROUP BY b.trip_id
      ),
      trips_with_remaining AS (
        SELECT 
          t.*, 
          GREATEST(
            0,
            COALESCE(NULLIF(t.baggage_space_available, '')::float, 0) - COALESCE(aw.sum_weight, 0)
          )::float AS remaining_capacity
        FROM travels t
        LEFT JOIN accepted_weights aw ON aw.trip_id = t.id
      )
      SELECT twr.*, u.username, u.contact,
             (SELECT json_build_object('id', b.id, 'amount', b.amount, 'status', b.status, 'sender_id', b.sender_id)
              FROM bids b 
              WHERE b.trip_id = twr.id AND b.status = 'accepted' 
              LIMIT 1) as accepted_bid
      FROM trips_with_remaining twr
      JOIN users u ON twr.user_id = u.id
      WHERE twr.travelling_country = $1
        AND twr.user_id <> $2
        AND twr.flight_departure_datetime > NOW()
        AND ($3::float <= 0 OR twr.remaining_capacity >= $3::float)
      ORDER BY twr.created_at DESC
    `;

    const params = [delivery_country, user_id, senderWeight];

    const result = await pool.query(query, params);
    res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (err) {
    next(new createError(500, err.message));
  }
};

// Get all send/receive entries for a user
exports.getSendReceiveEntries = async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });
  try {
    const result = await pool.query(
      'SELECT * FROM send_receive_entries WHERE user_id = $1 ORDER BY created_at DESC',
      [user_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}; 

// Get all send/receive entries by username
exports.getSendReceiveEntriesByUsername = async (req, res) => {

  const { username } = req.query;
  if (!username) {
    
    return res.status(400).json({ error: 'username required' });
  }
  try {

    const userRes = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (userRes.rows.length === 0) {
      
      return res.status(404).json({ error: 'User not found' });
    }
          const user_id = userRes.rows[0].id;
    const result = await pool.query(
      `SELECT sre.*, 
              b.id as bid_id, b.amount as bid_amount, b.status as bid_status, b.trip_id
       FROM send_receive_entries sre 
       LEFT JOIN (
         SELECT DISTINCT ON (sender_id) id, sender_id, amount, status, trip_id
         FROM bids 
         WHERE status = 'accepted'
         ORDER BY sender_id, created_at DESC
       ) b ON b.sender_id = sre.user_id
       WHERE sre.user_id = $1 
       ORDER BY sre.created_at DESC`,
      [user_id]
    );
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error in getSendReceiveEntriesByUsername:', err);
    res.status(500).json({ error: err.message });
  }
}; 

// Weekly stats: count of send/receive entries created in last 7 days
exports.getWeeklySendersCount = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM send_receive_entries
       WHERE created_at >= NOW() - INTERVAL '7 days'`
    );
    const count = result.rows[0]?.count || 0;
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};