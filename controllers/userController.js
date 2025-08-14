const pool = require('../db');

exports.getAllUsers = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createUser = async (req, res) => {
  const { username, contact } = req.body;
  if (!username || !contact) {
    return res.status(400).json({ error: 'Username and contact required' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO users (username, contact) VALUES ($1, $2) RETURNING *',
      [username, contact]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}; 