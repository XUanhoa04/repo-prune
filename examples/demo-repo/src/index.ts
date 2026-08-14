import express from 'express';
import { configuration } from './config.js';

const app = express();
const databaseUrl = process.env.DATABASE_URL;

// TODO: replace temporary health check after launch
app.get('/health', (_request, response) => response.json({ configuration, databaseUrl }));
app.listen(3000);
