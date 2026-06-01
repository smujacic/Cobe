import { Queue } from 'bullmq';

let orderQueue;

export function getOrderQueue() {
  if (!orderQueue) {
    orderQueue = new Queue('orders', {
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: Number(process.env.REDIS_PORT ?? 6379),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    });
  }
  return orderQueue;
}
