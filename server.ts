// src/server.ts
import app from './app';
import config from './src/config';
import rateLimiter from './src/utils/rateLimiter';

const PORT = config.server.port || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  

  console.log('Starting rate limiter monitoring...');
  rateLimiter.startMonitoring(30000); // Log stats every 30 seconds

});