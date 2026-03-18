import app from './app.js';

const PORT = process.env.PORT || 3001;

export default app;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT);
}
