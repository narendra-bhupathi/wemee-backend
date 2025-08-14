const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../db');
const logger = require('./logger');

const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '24h',
    algorithm: 'HS256'
  });
};

const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

const hashPassword = (password) => {
  return bcrypt.hash(password, 12);
};

const comparePassword = (password, hashedPassword) => {
  return bcrypt.compare(password, hashedPassword);
};

const authenticateUser = async (username, password) => {
  try {
    const userQuery = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userQuery.rows.length === 0) {
      throw new Error('User not found');
    }
    
    const user = userQuery.rows[0];
    const isValid = await comparePassword(password, user.password);
    
    if (!isValid) {
      throw new Error('Invalid credentials');
    }
    
    return user;
  } catch (error) {
    logger.error('Authentication error:', error.message);
    throw error;
  }
};

module.exports = {
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
  authenticateUser
};
