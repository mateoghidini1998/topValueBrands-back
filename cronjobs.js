var cron = require('node-cron');

cron.schedule('*/1 * * * *', () => {
  console.log('running a task every two minutes');
});