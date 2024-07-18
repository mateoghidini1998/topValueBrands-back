const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const { combine, timestamp, printf } = winston.format;

// Definir un formato personalizado
const myFormat = printf(({ level, message, timestamp, service }) => {
  return `${timestamp} [${service}] ${level}: ${message}`;
});

const logger = winston.createLogger({
  level: 'info',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), // Agregar timestamp con formato personalizado
    myFormat // Usar el formato personalizado
  ),
  // Agregar etiquetas de servicio
  defaultMeta: { service: 'user-service', env: 'development', version: '1.0.0' },
  // Agregar transportes
  transports: [
    new DailyRotateFile({
      dirname: path.join(__dirname, 'logs/error'),
      filename: '%DATE%-error.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      zippedArchive: true, // Opcional: comprime los archivos de log antiguos
      maxFiles: '7d' // Opcional: elimina archivos de log más antiguos que 14 días
    }),
    new DailyRotateFile({
      dirname: path.join(__dirname, 'logs/info'),
      filename: '%DATE%-info.log',
      datePattern: 'YYYY-MM-DD',
      level: 'info',
      zippedArchive: true,
      maxFiles: '7d'
    }),
    new DailyRotateFile({
      dirname: path.join(__dirname, 'logs/debug'),
      filename: '%DATE%-debug.log',
      datePattern: 'YYYY-MM-DD',
      level: 'debug',
      zippedArchive: true,
      maxFiles: '7d'
    }),
    new DailyRotateFile({
      dirname: path.join(__dirname, 'logs/warn'),
      filename: '%DATE%-warn.log',
      datePattern: 'YYYY-MM-DD',
      level: 'warn',
      zippedArchive: true,
      maxFiles: '7d'
    }),
    new DailyRotateFile({
      dirname: path.join(__dirname, 'logs/combined'),
      filename: '%DATE%-combined.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxFiles: '7d'
    }),
    new winston.transports.Console() // Agregar transporte de consola para ver los logs en la terminal
  ],
  exitOnError: false,
});

module.exports = logger;
