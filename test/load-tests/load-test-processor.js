/**
 * Artillery Load Test Processor
 * Custom functions for load testing
 */

module.exports = {
  /**
   * Generate random number for unique emails
   */
  generateRandomNumber: (context, events, done) => {
    context.vars.randomNumber = Math.floor(Math.random() * 1000000);
    return done();
  },

  /**
   * Log response for debugging
   */
  logResponse: (requestParams, response, context, ee, next) => {
    console.log('Response status:', response.statusCode);
    if (response.statusCode >= 400) {
      console.log('Error response:', response.body);
    }
    return next();
  },

  /**
   * Set custom headers
   */
  setCustomHeaders: (requestParams, context, ee, next) => {
    requestParams.headers = requestParams.headers || {};
    requestParams.headers['User-Agent'] = 'Artillery Load Test';
    return next();
  }
};
