const winston = require('winston');

const transports = [
    new winston.transports.Console()
];

// Only add file transport if NOT in Vercel environment
if (!process.env.VERCEL) {
    transports.push(new winston.transports.File({ filename: 'logs/server.log' }));
}

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level.toUpperCase()}]: ${message}`;
        })
    ),
    transports: transports
});

module.exports = logger;
