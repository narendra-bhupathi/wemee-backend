const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const logger = require('../utils/logger');
const createError = require('./utils/createError');

const securityMiddleware = [
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:', 'http:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: 'cross-origin',
    crossOriginOpenerPolicy: 'same-origin',
    crossOriginResourcePolicy: 'cross-origin',
    dnsPrefetchControl: false,
    expectCt: {
      maxAge: 86400,
      report: false
    },
    frameOptions: 'DENY',
    hidePoweredBy: true,
    noSniff: true,
    permittedCrossDomainPolicies: false,
    referrerPolicy: 'no-referrer',
    xssProtection: true
  }),
  compression(),
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
      success: false,
      error: 'Too many requests from this IP, please retry after 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      return req.ip === '127.0.0.1' || req.ip === 'localhost';
    },
    handler: (req, res, next) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
      next(new createError(429, 'Too many requests from this IP, please retry after 15 minutes.'));
    }
  })
];

module.exports = securityMiddleware;
