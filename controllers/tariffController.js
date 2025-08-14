const pool = require('../db');

// Get tariff value by type
exports.getTariffValue = async (tariffType) => {
  try {
    const result = await pool.query(
      'SELECT value FROM tariff WHERE tariff_type = $1',
      [tariffType]
    );
    return result.rows[0]?.value || null;
  } catch (error) {
    console.error('Error getting tariff value:', error);
    return null;
  }
};

// Get all tariff settings
exports.getAllTariffs = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tariff ORDER BY tariff_type');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching tariffs:', error);
    res.status(500).json({ error: 'Failed to fetch tariff settings' });
  }
};

// Update tariff value
exports.updateTariff = async (req, res) => {
  try {
    const { tariff_type, value, description } = req.body;
    
    if (!tariff_type || value === undefined) {
      return res.status(400).json({ error: 'tariff_type and value are required' });
    }

    const result = await pool.query(
      `UPDATE tariff 
       SET value = $1, description = $2, updated_at = CURRENT_TIMESTAMP 
       WHERE tariff_type = $3 
       RETURNING *`,
      [value, description, tariff_type]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tariff type not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating tariff:', error);
    res.status(500).json({ error: 'Failed to update tariff setting' });
  }
};

// Get minimum connects required for trip creation with safe fallback to default (20)
exports.getMinConnectsForTrip = async () => {
  const value = await exports.getTariffValue('min_connects_for_trip');
  const parsed = Number(value);
  if (value === null || Number.isNaN(parsed) || parsed <= 0) {
    return 20; // default minimum connects
  }
  return parsed;
};
