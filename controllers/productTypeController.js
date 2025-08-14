const pool = require('../db');

exports.getAllProductTypes = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM product_types ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createProductType = async (req, res) => {
  const { name, measurement_unit, requires_weight } = req.body;
  if (!name || !measurement_unit) {
    return res.status(400).json({ error: 'Name and measurement unit are required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO product_types (name, measurement_unit, requires_weight) VALUES ($1, $2, $3) RETURNING *',
      [name, measurement_unit, requires_weight !== false]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateProductType = async (req, res) => {
  const { id } = req.params;
  const { name, measurement_unit, requires_weight } = req.body;
  try {
    const result = await pool.query(
      'UPDATE product_types SET name=$1, measurement_unit=$2, requires_weight=$3 WHERE id=$4 RETURNING *',
      [name, measurement_unit, requires_weight, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteProductType = async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM product_types WHERE id=$1', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}; 