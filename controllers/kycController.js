const pool = require('../db');

/**
 * Submit KYC verification with Aadhaar number
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.submitKYC = async (req, res) => {
  const { aadhaarNumber } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  if (!aadhaarNumber) {
    return res.status(400).json({ error: 'Aadhaar number is required' });
  }

  // Validate Aadhaar number format (12 digits)
  const aadhaarRegex = /^\d{12}$/;
  if (!aadhaarRegex.test(aadhaarNumber)) {
    return res.status(400).json({ error: 'Aadhaar number must be exactly 12 digits' });
  }

  try {
    // Ensure KYC fields exist
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(50) DEFAULT \'pending\'');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_number VARCHAR(12)');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMP');

    // Check if user exists and KYC status
    const existingUser = await pool.query(
      'SELECT kyc_status FROM users WHERE id = $1',
      [userId]
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (existingUser.rows[0].kyc_status === 'verified') {
      return res.status(400).json({ error: 'User is already KYC verified' });
    }

    // Simulate KYC verification process
    // In a real implementation, this would call an external KYC verification service
    const isVerificationSuccessful = await simulateKYCVerification(aadhaarNumber);

    if (isVerificationSuccessful) {
      // Update user KYC status to verified
      await pool.query(
        `UPDATE users 
         SET kyc_status = 'verified', 
             aadhaar_number = $1, 
             kyc_verified_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [aadhaarNumber, userId]
      );

      res.json({
        success: true,
        message: 'KYC verification successful',
        kyc_status: 'verified'
      });
    } else {
      // Update user KYC status to failed
      await pool.query(
        `UPDATE users 
         SET kyc_status = 'failed', 
             aadhaar_number = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [aadhaarNumber, userId]
      );

      res.status(400).json({
        success: false,
        message: 'KYC verification failed. Please check your Aadhaar number and try again.',
        kyc_status: 'failed'
      });
    }
  } catch (error) {
    console.error('KYC verification error:', error);
    res.status(500).json({ error: 'Internal server error during KYC verification' });
  }
};

/**
 * Get user's KYC status
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
exports.getKYCStatus = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  try {
    // Ensure KYC fields exist
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(50) DEFAULT \'pending\'');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_number VARCHAR(12)');
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMP');

    const result = await pool.query(
      'SELECT kyc_status, aadhaar_number, kyc_verified_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      success: true,
      kyc_status: user.kyc_status || 'pending',
      aadhaar_number: user.aadhaar_number ? user.aadhaar_number.substring(0, 4) + '****' + user.aadhaar_number.substring(8) : null,
      kyc_verified_at: user.kyc_verified_at
    });
  } catch (error) {
    console.error('Get KYC status error:', error);
    res.status(500).json({ error: 'Internal server error while fetching KYC status' });
  }
};

/**
 * Simulate KYC verification process
 * In a real implementation, this would call an external KYC verification service
 * @param {string} aadhaarNumber - The Aadhaar number to verify
 * @returns {Promise<boolean>} - Whether verification was successful
 */
async function simulateKYCVerification(aadhaarNumber) {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // For demo purposes, consider verification successful if Aadhaar number is valid format
  // In real implementation, this would validate against government databases
  const isValidFormat = /^\d{12}$/.test(aadhaarNumber);
  
  // Simulate 90% success rate for demo purposes
  const randomSuccess = Math.random() < 0.9;
  
  return isValidFormat && randomSuccess;
} 