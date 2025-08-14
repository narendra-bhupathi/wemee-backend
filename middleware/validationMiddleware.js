const Joi = require('joi');
const createError = require('./utils/createError');

const validationSchemas = {
  travel: Joi.object({
    user_id: Joi.number().required(),
    pickup_location: Joi.string().required(),
    pickup_country: Joi.string().required(),
    departure_airport: Joi.string().required(),
    arrival_airport: Joi.string().required(),
    flight_departure_datetime: Joi.date().required(),
    flight_arrival_datetime: Joi.date().required(),
    travelling_location: Joi.string().required(),
    travelling_country: Joi.string().required(),
    airplane_name: Joi.string().required(),
    flight_number: Joi.string().required(),
    baggage_space_available: Joi.string().optional()
  }),
  
  sendReceive: Joi.object({
    user_id: Joi.number().required(),
    product_type_id: Joi.number().required(),
    product_name: Joi.string().required(),
    weight: Joi.number().positive().required(),
    preferred_date: Joi.date().required(),
    pickup_location: Joi.string().required(),
    pickup_country: Joi.string().required(),
    delivery_location: Joi.string().required(),
    delivery_country: Joi.string().required(),
    product_image: Joi.string().optional()
  }),
  
  user: Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    contact: Joi.string().pattern(new RegExp('^[0-9]{10}$')).required()
  }),
  
  productType: Joi.object({
    name: Joi.string().min(2).max(50).required(),
    measurement_unit: Joi.string().min(2).max(20).required(),
    requires_weight: Joi.boolean().required()
  })
};

const validate = (schema, data) => {
  const { error } = schema.validate(data);
  if (error) {
    throw createError(400, error.details[0].message);
  };
};

module.exports = { validationSchemas, validate };
