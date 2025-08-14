class createError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'createError';
  }
}

module.exports = createError;
