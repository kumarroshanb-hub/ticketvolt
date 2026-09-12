const winston = require('winston');

// Create a pino-compatible logger for Baileys
const createLogger = () => {
    const logger = winston.createLogger({
        level: 'info',
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        ),
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.simple()
                )
            }),
            new winston.transports.File({ 
                filename: 'logs/error.log', 
                level: 'error' 
            }),
            new winston.transports.File({ 
                filename: 'logs/combined.log' 
            })
        ]
    });

    // Add trace method for Baileys compatibility
    logger.trace = logger.debug;
    logger.child = () => logger;

    return logger;
};

const logger = createLogger();

module.exports = logger;
