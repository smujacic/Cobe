import { Prisma } from '@prisma/client';

export function handlePrismaError(err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      const error = new Error('Record not found');
      error.statusCode = 404;
      throw error;
    }

    if (err.code === 'P2002') {
      const error = new Error('A record with this value already exists');
      error.statusCode = 409;
      throw error;
    }

    if (err.code === 'P2003') {
      const error = new Error(
        'Cannot delete record because it is referenced by other records',
      );
      error.statusCode = 409;
      throw error;
    }
  }
  throw err;
}

export function sendDeleted(reply) {
  return reply.status(204).send();
}

export function softDeleteFilter() {
  return { deletedAt: null };
}

export function throwIfOrderNotPending(order) {
  if (order.status !== 'PENDING') {
    const error = new Error('Order items can only be modified while order is in PENDING status');
    error.statusCode = 409;
    throw error;
  }
}
