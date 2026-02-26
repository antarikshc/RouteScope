require('dotenv').config();
const { createApp } = require('./server/app');
const { startPoller } = require('./poller');

const PORT = process.env.PORT || 3000;

const app = createApp();
app.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
  console.log(`Poll interval: ${(parseInt(process.env.POLL_INTERVAL_MS) || 900000) / 1000}s`);
});

startPoller();
