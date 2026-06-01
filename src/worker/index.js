import { Worker } from 'bullmq';
import { prisma } from '../db.js';

const connection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
};

export const worker = new Worker(
  'orders',
  (job) => {
    const { orderId } = job.data;

    console.log(`Job id: ${job.id} and orderId: ${orderId}`);

    /**
     * If payment is integrated, the charge would be attempted here
     * before the order is marked as completed.
     */
  },
  { connection },
);

worker.on('completed', async (job) => {
  console.log(`Job ${job.id} completed — order ${job.data.orderId} processed`);
  await prisma.order.updateMany({
    where: { id: job.data.orderId },
    data: { status: 'COMPLETED' },
  });
});

worker.on('failed', async (job, err) => {
  const attempts = job?.opts?.attempts ?? 1;
  console.error(
    `Job ${job?.id} failed (attempt ${job?.attemptsMade}/${attempts}):`,
    err.message,
  );

  if (job && job.attemptsMade >= attempts) {
    try {
      await prisma.order.updateMany({
        where: { id: job.data.orderId, status: { not: 'COMPLETED' } },
        data: { status: 'ERROR' },
      });
    } catch (updateErr) {
      console.error(
        `Failed to mark order ${job.data.orderId} as ERROR:`,
        updateErr.message,
      );
    }
  }
});

async function shutdown(signal) {
  console.log(`\nWorker ${signal} received, shutting down...`);
  try {
    await worker.close();
    await prisma.$disconnect();
    console.log('Worker shutdown complete');
    process.exit(0);
  } catch (err) {
    console.error(`Worker shutdown error: ${err}`);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log('Worker started, listening on queue "orders"');
