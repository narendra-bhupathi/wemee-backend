const pool = require('../db');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
  const { username, otp } = req.body;
  if (!username || !otp || otp.length !== 6) {
    return res.status(400).json({ error: 'Invalid username or OTP' });
  }
  // Dummy validation: check if user exists and OTP is '123456'
  try {
    const userResult = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (otp !== '123456') {
      return res.status(401).json({ error: 'Invalid OTP' });
    }
    const token = jwt.sign({ 
      userId: userResult.rows[0].id,
      username: userResult.rows[0].username 
    }, process.env.JWT_SECRET, { expiresIn: '2h' });
    
    const refreshToken = jwt.sign({ 
      userId: userResult.rows[0].id,
      username: userResult.rows[0].username 
    }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    // Do not initialize sample wallet transactions automatically
    
    res.json({ 
      success: true, 
      token, 
      refreshToken,
      user: userResult.rows[0] 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.refreshToken = async (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' });
  }
  
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    const newToken = jwt.sign({ 
      userId: userResult.rows[0].id,
      username: userResult.rows[0].username 
    }, process.env.JWT_SECRET, { expiresIn: '2h' });
    
    const newRefreshToken = jwt.sign({ 
      userId: userResult.rows[0].id,
      username: userResult.rows[0].username 
    }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ 
      success: true, 
      token: newToken, 
      refreshToken: newRefreshToken,
      user: userResult.rows[0] 
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
};

exports.validateToken = async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.userId]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    res.json({ 
      success: true, 
      user: userResult.rows[0] 
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

exports.logout = async (req, res) => {
  // In a more sophisticated system, you might want to blacklist the token
  // For now, we'll just return success as the client will clear the token
  res.json({ success: true, message: 'Logged out successfully' });
}; 