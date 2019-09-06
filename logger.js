const winston = require('winston');

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.json()
  ),
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`),
    })
  );
}

module.exports = logger;
