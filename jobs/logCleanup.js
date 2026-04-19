const fs = require('fs').promises;
const path = require('path');

/**
 * Log Cleanup Job
 * Automatically cleans old log files based on age and size
 */

const LOG_DIR = path.join(__dirname, '..', 'logs');
const MAX_LOG_AGE_DAYS = 7; // Delete logs older than 7 days
const MAX_TOTAL_SIZE_MB = 100; // Maximum total log size in MB

/**
 * Get file stats including size and age
 */
async function getFileStats(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return {
      path: filePath,
      size: stats.size,
      age: Date.now() - stats.mtime.getTime(),
      mtime: stats.mtime
    };
  } catch (error) {
    return null;
  }
}

/**
 * Delete old log files based on age
 */
async function deleteOldLogs() {
  try {
    const files = await fs.readdir(LOG_DIR);
    const maxAge = MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000; // Convert days to milliseconds
    
    let deletedCount = 0;
    let deletedSize = 0;

    for (const file of files) {
      // Skip .gitkeep
      if (file === '.gitkeep') continue;
      
      const filePath = path.join(LOG_DIR, file);
      const stats = await getFileStats(filePath);
      
      if (stats && stats.age > maxAge) {
        await fs.unlink(filePath);
        deletedCount++;
        deletedSize += stats.size;
      }
    }

    if (deletedCount > 0) {
      console.log(` Deleted ${deletedCount} old log files (${(deletedSize / 1024 / 1024).toFixed(2)} MB)`);
    }

    return { deletedCount, deletedSize };
  } catch (error) {
    console.error(' Error deleting old logs:', error.message);
    return { deletedCount: 0, deletedSize: 0 };
  }
}

/**
 * Delete logs if total size exceeds limit
 */
async function cleanupBySize() {
  try {
    const files = await fs.readdir(LOG_DIR);
    const fileStats = [];
    
    // Get stats for all log files
    for (const file of files) {
      if (file === '.gitkeep') continue;
      
      const filePath = path.join(LOG_DIR, file);
      const stats = await getFileStats(filePath);
      if (stats) {
        fileStats.push(stats);
      }
    }

    // Calculate total size
    const totalSize = fileStats.reduce((sum, file) => sum + file.size, 0);
    const totalSizeMB = totalSize / 1024 / 1024;

    if (totalSizeMB > MAX_TOTAL_SIZE_MB) {
      // Sort by age (oldest first)
      fileStats.sort((a, b) => b.age - a.age);
      
      let currentSize = totalSize;
      let deletedCount = 0;

      // Delete oldest files until we're under the limit
      for (const file of fileStats) {
        if (currentSize / 1024 / 1024 <= MAX_TOTAL_SIZE_MB) break;
        
        await fs.unlink(file.path);
        currentSize -= file.size;
        deletedCount++;
      }

      if (deletedCount > 0) {
        console.log(` Deleted ${deletedCount} log files to stay under ${MAX_TOTAL_SIZE_MB}MB limit`);
      }

      return deletedCount;
    }

    return 0;
  } catch (error) {
    console.error(' Error cleaning logs by size:', error.message);
    return 0;
  }
}

/**
 * Get current log statistics
 */
async function getLogStats() {
  try {
    const files = await fs.readdir(LOG_DIR);
    let totalSize = 0;
    let fileCount = 0;

    for (const file of files) {
      if (file === '.gitkeep') continue;
      
      const filePath = path.join(LOG_DIR, file);
      const stats = await getFileStats(filePath);
      if (stats) {
        totalSize += stats.size;
        fileCount++;
      }
    }

    return {
      fileCount,
      totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2)
    };
  } catch (error) {
    return { fileCount: 0, totalSize: 0, totalSizeMB: '0.00' };
  }
}

/**
 * Run complete log cleanup
 */
async function runLogCleanup() {
  try {
    // Get stats before cleanup
    const statsBefore = await getLogStats();
    
    // Delete old logs
    await deleteOldLogs();
    
    // Clean by size if needed
    await cleanupBySize();
    
    // Get stats after cleanup
    const statsAfter = await getLogStats();
    
    if (statsBefore.totalSize !== statsAfter.totalSize) {
      const savedMB = ((statsBefore.totalSize - statsAfter.totalSize) / 1024 / 1024).toFixed(2);
      console.log(` Log cleanup complete: ${statsAfter.fileCount} files, ${statsAfter.totalSizeMB} MB (saved ${savedMB} MB)`);
    }
  } catch (error) {
    console.error(' Log cleanup failed:', error.message);
  }
}

/**
 * Start automatic log cleanup job
 */
function startLogCleanup() {
  // Run cleanup every 24 hours
  setInterval(runLogCleanup, 24 * 60 * 60 * 1000);
  
  // Run immediately on startup
  setTimeout(runLogCleanup, 5000); // Wait 5 seconds after startup
  
  console.log(' Log cleanup job started (runs every 24 hours)');
}

module.exports = {
  startLogCleanup,
  runLogCleanup,
  deleteOldLogs,
  cleanupBySize,
  getLogStats
};
