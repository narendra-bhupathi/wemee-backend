const pool = require('../db');

exports.getBalance = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    
    const balanceResult = await pool.query(
      'SELECT connects FROM users WHERE id = $1',
      [req.user.id]
    );
    
    const balance = balanceResult.rows[0]?.connects || 0;
    res.json({ connects: balance });
  } catch (err) {
    console.error('Error fetching balance:', err);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    
    const result = await pool.query(
      'SELECT id, description, amount, type, created_at FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );
    
    const transactions = result.rows.map(row => ({
      id: row.id,
      description: row.description,
      amount: row.amount,
      type: row.type, // 'credit' or 'debit'
      created_at: row.created_at
    }));
    
    res.json(transactions);
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
};

exports.addConnects = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    
    const amount = parseInt(req.body.amount, 10);
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive integer' });
    }
    
    const result = await pool.query(
      'UPDATE users SET connects = COALESCE(connects,0) + $1 WHERE id = $2 RETURNING connects',
      [amount, req.user.id]
    );
    
    await pool.query(
      'INSERT INTO transactions (user_id, description, amount, type) VALUES ($1, $2, $3, $4)',
      [req.user.id, `Purchased ${amount} Connects`, amount, 'credit']
    );
    
    res.json({ connects: result.rows[0].connects });
  } catch (err) {
    console.error('Error adding connects:', err);
    res.status(500).json({ error: 'Failed to add connects' });
  }
};

exports.useConnects = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    
    const { amount, description } = req.body;
    const connectAmount = parseInt(amount, 10);
    
    if (!connectAmount || connectAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive integer' });
    }
    
    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }
    
    const userResult = await pool.query(
      'SELECT connects FROM users WHERE id = $1',
      [req.user.id]
    );
    
    const currentBalance = userResult.rows[0]?.connects || 0;
    if (currentBalance < connectAmount) {
      return res.status(400).json({ error: 'Insufficient connects balance' });
    }
    
    const result = await pool.query(
      'UPDATE users SET connects = connects - $1 WHERE id = $2 RETURNING connects',
      [connectAmount, req.user.id]
    );
    
    await pool.query(
      'INSERT INTO transactions (user_id, description, amount, type) VALUES ($1, $2, $3, $4)',
      [req.user.id, description, connectAmount, 'debit']
    );
    
    res.json({ connects: result.rows[0].connects });
  } catch (err) {
    console.error('Error using connects:', err);
    res.status(500).json({ error: 'Failed to use connects' });
  }
};

exports.earnConnects = async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    
    const { amount, description } = req.body;
    const connectAmount = parseInt(amount, 10);
    
    if (!connectAmount || connectAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive integer' });
    }
    
    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }
    
    const result = await pool.query(
      'UPDATE users SET connects = COALESCE(connects,0) + $1 WHERE id = $2 RETURNING connects',
      [connectAmount, req.user.id]
    );
    
    await pool.query(
      'INSERT INTO transactions (user_id, description, amount, type) VALUES ($1, $2, $3, $4)',
      [req.user.id, description, connectAmount, 'credit']
    );
    
    res.json({ connects: result.rows[0].connects });
  } catch (err) {
    console.error('Error earning connects:', err);
    res.status(500).json({ error: 'Failed to earn connects' });
  }
};
