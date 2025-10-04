// src/server.ts
import app from './app';
import config from './src/config';

const PORT = config.server.port || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});