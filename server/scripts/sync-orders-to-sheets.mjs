// Compatibility CLI: drain durable events only, never reconstruct old/manual orders.
import {runWorker} from './sheet-sync-worker.mjs';
await runWorker();
