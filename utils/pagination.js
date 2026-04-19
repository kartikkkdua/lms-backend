// Pagination helper utility

/**
 * Get pagination parameters from request query
 * @param {Object} query - Express request query object
 * @param {Number} defaultLimit - Default limit if not specified
 * @param {Number} maxLimit - Maximum allowed limit
 * @returns {Object} - { page, limit, skip }
 */
const getPaginationParams = (query, defaultLimit = 10, maxLimit = 100) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(
    Math.max(1, parseInt(query.limit) || defaultLimit),
    maxLimit
  );
  const skip = (page - 1) * limit;
  
  return { page, limit, skip };
};

/**
 * Create pagination metadata
 * @param {Number} total - Total number of items
 * @param {Number} page - Current page
 * @param {Number} limit - Items per page
 * @returns {Object} - Pagination metadata
 */
const getPaginationMeta = (total, page, limit) => {
  const totalPages = Math.ceil(total / limit);
  
  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1
  };
};

module.exports = {
  getPaginationParams,
  getPaginationMeta
};
