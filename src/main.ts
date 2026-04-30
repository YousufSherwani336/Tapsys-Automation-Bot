import pino from 'pino';
import { bootstrap } from './core/bootstrap/bootstrap.js';

const logger = pino({ name: 'main' });

bootstrap()
  .then((running) => {
    const handle = async (sig: NodeJS.Signals) => {
      logger.info({ sig }, 'shutting down');
      await running.shutdown();
      process.exit(0);
    };
    process.once('SIGINT', handle);
    process.once('SIGTERM', handle);
  })
  .catch((err: unknown) => {
    logger.fatal({ err }, 'bootstrap failed');
    process.exit(1);
  });
