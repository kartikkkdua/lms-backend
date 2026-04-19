const cron = require('node-cron');
const reminderService = require('../services/reminderService');
const logger = require('../utils/logger');

function startReminderJobs() {
  // Send 24-hour reminders every hour
  cron.schedule('0 * * * *', async () => {
    try {
      logger.info('Running 24-hour reminder job...');
      const result = await reminderService.send24HourReminders();
      logger.info(`24-hour reminder job completed. Sent: ${result.sent}`);
    } catch (error) {
      logger.error('24-hour reminder job failed:', error);
    }
  });

  // Send 1-hour reminders every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    try {
      logger.info('Running 1-hour reminder job...');
      const result = await reminderService.send1HourReminders();
      logger.info(`1-hour reminder job completed. Sent: ${result.sent}`);
    } catch (error) {
      logger.error('1-hour reminder job failed:', error);
    }
  });

  logger.info('Reminder jobs started');
}

module.exports = { startReminderJobs };
