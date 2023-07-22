import {format} from 'logform'
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

const {createLogger, transports} = winston

const LOG_LEVEL = process.env.LOG_LEVEL ? process.env.LOG_LEVEL.toLowerCase() : 'debug'
const LOG_DIR = process.env.LOG_DIR || 'log'
const NODE_ENV = process.env.NODE_ENV ? process.env.NODE_ENV.toLowerCase() : null;

let logDir = LOG_DIR
if(!logDir.endsWith('/')) {
    logDir += '/'
}

/**
 * Create a winston logger with console logging in dev and console and file logging in prod
 * @type {winston.Logger}
 */
const logger = createLogger({
    format: format.combine(
        format.timestamp({
            format: 'HH:mm:ss:SSS',
        }),
        format.errors({stack: true}),
        format.printf(
            (info) =>
                `${info.timestamp} [${info.level}] ${typeof info.message === 'string' ? info.message : JSON.stringify(info.message)}`
        )
    ),
    transports: NODE_ENV !== 'production' ?
        [new transports.Console({level: LOG_LEVEL})]
        :
        [
            new transports.Console(),
            new DailyRotateFile({
                filename: logDir + 'error.log',
                datePattern: 'YYYY-MM-DD',
                maxFiles: '31d',
                level: 'error'
            }),
            new DailyRotateFile({
                filename: logDir + 'combined.log',
                datePattern: 'YYYY-MM-DD',
                maxFiles: '31d',
                level: LOG_LEVEL
            }),
        ]
})
export default logger
