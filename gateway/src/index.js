require('dotenv').config();
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const auth = require('./middlewares/auth');

const app = express();
app.use('/auth', express.json());

// Logger centralizado
const logger = winston.createLogger({
  transports: [new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message }) =>
        `[${timestamp}] ${level}: ${message}`)
    )
  })]
});

// Rate Limiting: max 100 peticiones por minuto
app.use(rateLimit({
  windowMs: 60_000, max: 100,
  message: { error: 'Demasiadas peticiones, intenta en 1 minuto.' }
}));

// Logging de todas las peticiones entrantes
app.use((req, _, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// Ruta publica: login (NO requiere JWT)
app.use('/auth/login', require('./routes/auth'));

// Rutas protegidas: redirigen al servicio correspondiente
// EMPLEADOS
app.use('/api/empleados',
  auth,
  createProxyMiddleware({
    target: process.env.EMPLEADOS_URL || 'http://localhost:3001',
    changeOrigin: true,
    pathRewrite: { '^/api/empleados': '/empleados' }
  })
);

// NOMINA
app.use('/api/nomina',
  auth,
  createProxyMiddleware({
    target: process.env.NOMINA_URL || 'http://localhost:3002',
    changeOrigin: true,
    pathRewrite: { '^/api/nomina': '/nomina' }
  })
);

// RECLUTAMIENTO
app.use('/api/reclutamiento',
  auth,
  createProxyMiddleware({
    target: process.env.RECLUTAMIENTO_URL || 'http://localhost:3003',
    changeOrigin: true,
    pathRewrite: { '^/api/reclutamiento': '/reclutamiento' }
  })
);

// Health check: verifica que el gateway esta vivo
app.get('/health', (_, res) => res.json({
  status: 'ok',
  servicios: {
    empleados: process.env.EMPLEADOS_URL || 'http://localhost:3001',
    nomina: process.env.NOMINA_URL || 'http://localhost:3002',
    reclutamiento: process.env.RECLUTAMIENTO_URL || 'http://localhost:3003',
  }
}));

// Manejo de rutas no encontradas
app.use((req, res) =>
  res.status(404).json({ error: `Ruta ${req.url} no encontrada` })
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  logger.info(`Gateway corriendo en http://localhost:${PORT}`)
);
