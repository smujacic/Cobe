import { prisma } from '../db.js';
import { getPagination } from '../utils/pagination.js';
import {
  handlePrismaError,
  sendDeleted,
  throwIfOrderNotPending,
} from '../utils/responses.js';
import { getOrderQueue } from '../queue.js';

const orderProperties = {
  id: { type: 'integer' },
  customerId: { type: 'integer' },
  note: { type: 'string' },
  status: { type: 'string' },
  createdAt: { type: 'string' },
  updatedAt: { type: 'string' },
};

const orderCreateProperties = {
  customerId: { type: 'integer' },
  note: { type: 'string' },
};

const customerProperties = {
  id: { type: 'integer' },
  email: { type: 'string' },
  name: { type: 'string' },
  address: { type: 'string' },
  city: { type: 'string' },
  country: { type: 'string' },
  phone: { type: 'string' },
};

const orderItemsProperties = {
  id: { type: 'integer' },
  orderId: { type: 'integer' },
  productId: { type: 'integer' },
  quantity: { type: 'integer' },
  price: { type: 'number' },
};

export default async function orderRoutes(app) {
  // Get orders by page and filter
  app.get('/', {
    schema: {
      tags: ['Orders'],
      summary: 'Get all orders',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 20 },
          status: { type: 'string' },
          customerId: { type: 'integer' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: { type: 'object', properties: orderProperties },
            },
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
          },
        },
      },
    },
    handler: async (req) => {
      const { status, customerId } = req.query;
      const { page, limit, skip } = getPagination(req.query);

      const where = {
        ...(status && { status }),
        ...(customerId && { customerId }),
      };

      const [data, total] = await prisma.$transaction([
        prisma.order.findMany({ where, skip, take: limit }),
        prisma.order.count({ where }),
      ]);

      return { data, total, page, limit };
    },
  });

  // Get order by id
  app.get('/:id', {
    schema: {
      tags: ['Orders'],
      summary: 'Get order by id',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'integer' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            ...orderProperties,
            total: { type: 'number' },
            customer: {
              type: 'object',
              properties: customerProperties,
            },
            orderItems: {
              type: 'array',
              items: {
                type: 'object',
                properties: orderItemsProperties,
              },
            },
          },
        },
      },
    },
    handler: async (req) => {
      const { id } = req.params;

      try {
        const order = await prisma.order.findUniqueOrThrow({
          where: { id },
          include: { orderItems: true, customer: true },
        });

        const total = order.orderItems.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0,
        );
        return { ...order, total };
      } catch (err) {
        handlePrismaError(err);
      }
    },
  });

  // Create order
  app.post('/', {
    schema: {
      tags: ['Orders'],
      summary: 'Create a new order',
      body: {
        type: 'object',
        required: ['customerId'],
        properties: orderCreateProperties,
      },
      response: {
        200: { type: 'object', properties: orderProperties },
      },
    },
    handler: async (req) => {
      try {
        return await prisma.order.create({ data: req.body });
      } catch (err) {
        handlePrismaError(err);
      }
    },
  });

  // Add item to order
  app.post('/:id/items', {
    schema: {
      tags: ['Orders'],
      summary: 'Add item to order',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'integer' } },
      },
      body: {
        type: 'object',
        required: ['productId', 'quantity'],
        properties: {
          productId: { type: 'integer' },
          quantity: { type: 'integer', minimum: 1 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: orderItemsProperties,
        },
      },
    },
    handler: async (req) => {
      const { id } = req.params;
      const { productId, quantity } = req.body;

      try {
        const order = await prisma.order.findUniqueOrThrow({ where: { id } });
        throwIfOrderNotPending(order);

        const product = await prisma.product.findUniqueOrThrow({
          where: { id: productId },
        });

        return await prisma.orderItem.create({
          data: { orderId: id, productId, quantity, price: product.price },
        });
      } catch (err) {
        handlePrismaError(err);
      }
    },
  });

  // Delete item from order
  app.delete('/:id/items/:itemId', {
    schema: {
      tags: ['Orders'],
      summary: 'Delete item from order',
      params: {
        type: 'object',
        required: ['id', 'itemId'],
        properties: {
          id: { type: 'integer' },
          itemId: { type: 'integer' },
        },
      },
    },
    handler: async (req, reply) => {
      const { id, itemId } = req.params;

      try {
        const order = await prisma.order.findUniqueOrThrow({ where: { id } });
        throwIfOrderNotPending(order);

        const { count } = await prisma.orderItem.deleteMany({
          where: { id: itemId, orderId: id },
        });

        if (count === 0) {
          const error = new Error('Order item not found');
          error.statusCode = 404;
          throw error;
        }

        return sendDeleted(reply);
      } catch (err) {
        handlePrismaError(err);
      }
    },
  });

  // Checkout order
  app.post('/:id/checkout', {
    schema: {
      tags: ['Orders'],
      summary: 'Checkout order (sets status to IN_PROGRESS)',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'integer' } },
      },
      response: {
        200: { type: 'object', properties: orderProperties },
      },
    },
    handler: async (req) => {
      const { id } = req.params;

      try {
        let order = await prisma.order.findUniqueOrThrow({ where: { id } });
        throwIfOrderNotPending(order);

        order = await prisma.order.update({
          where: { id },
          data: { status: 'IN_PROGRESS' },
        });

        /**
         * This can fail if Redis is down. In that case, a cron job could be introduced to
         * detect stuck IN_PROGRESS orders and re-enqueue them for processing.
         */
        await getOrderQueue().add(
          'processOrder',
          { orderId: id },
          { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
        );

        return order;
      } catch (err) {
        handlePrismaError(err);
      }
    },
  });

  // Update order note
  app.put('/:id', {
    schema: {
      tags: ['Orders'],
      summary: 'Update order note',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'integer' } },
      },
      body: {
        type: 'object',
        properties: {
          note: { type: 'string', maxLength: 500 },
        },
      },
      response: {
        200: { type: 'object', properties: orderProperties },
      },
    },
    handler: async (req) => {
      const { id } = req.params;

      try {
        return await prisma.order.update({
          where: { id },
          data: { note: req.body.note },
        });
      } catch (err) {
        handlePrismaError(err);
      }
    },
  });

  // Cancel order
  app.post('/:id/cancel', {
    schema: {
      tags: ['Orders'],
      summary: 'Cancel order',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'integer' } },
      },
      response: {
        200: { type: 'object', properties: orderProperties },
      },
    },
    handler: async (req) => {
      const { id } = req.params;

      try {
        const existing = await prisma.order.findUniqueOrThrow({
          where: { id },
        });
        throwIfOrderNotPending(existing);

        return await prisma.order.update({
          where: { id },
          data: { status: 'CANCELLED' },
        });
      } catch (err) {
        handlePrismaError(err);
      }
    },
  });
}
