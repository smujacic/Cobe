import { prisma } from '../db.js';
import { getPagination } from '../utils/pagination.js';
import {
  handlePrismaError,
  sendDeleted,
  softDeleteFilter,
} from '../utils/responses.js';

const productProperties = {
  id: { type: 'integer' },
  name: { type: 'string' },
  description: { type: 'string' },
  price: { type: 'number' },
};

const createUpdateProductProperties = {
  name: { type: 'string', minLength: 2, maxLength: 100 },
  description: { type: 'string', maxLength: 500 },
  price: { type: 'number', minimum: 0 },
};

export default async function productRoutes(app) {
  // Get products by page and filter
  app.get('/', {
    schema: {
      tags: ['Products'],
      summary: 'Get all products',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 20 },
          name: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: { type: 'object', properties: productProperties },
            },
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
          },
        },
      },
    },
    handler: async (req) => {
      const { name } = req.query;
      const { page, limit, skip } = getPagination(req.query);

      const where = {
        ...softDeleteFilter(),
        ...(name && { name: { contains: name, mode: 'insensitive' } }),
      };

      const [data, total] = await prisma.$transaction([
        prisma.product.findMany({ where, skip, take: limit }),
        prisma.product.count({ where }),
      ]);

      return { data, total, page, limit };
    },
  });

  // Get product by id
  app.get('/:id', {
    schema: {
      tags: ['Products'],
      summary: 'Get product by id',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'integer' } },
      },
      response: {
        200: { type: 'object', properties: productProperties },
      },
    },
    handler: async (req) => {
      const { id } = req.params;

      try {
        return await prisma.product.findUniqueOrThrow({
          where: { id, ...softDeleteFilter() },
        });
      } catch (err) {
        handlePrismaError(err);
      }
    },
  });

  // Create product
  app.post('/', {
    schema: {
      tags: ['Products'],
      summary: 'Create a new product',
      body: {
        type: 'object',
        required: ['name', 'price'],
        properties: createUpdateProductProperties,
      },
      response: {
        200: { type: 'object', properties: productProperties },
      },
    },
    handler: async (req) => {
      try {
        return await prisma.product.create({ data: req.body });
      } catch (err) {
        handlePrismaError(err);
      }
    },
  });

  // Update product
  app.put('/:id', {
    schema: {
      tags: ['Products'],
      summary: 'Update product',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'integer' } },
      },
      body: {
        type: 'object',
        properties: createUpdateProductProperties,
      },
      response: {
        200: { type: 'object', properties: productProperties },
      },
    },
    handler: async (req) => {
      const { id } = req.params;

      try {
        return await prisma.product.update({
          where: { id, ...softDeleteFilter() },
          data: req.body,
        });
      } catch (err) {
        handlePrismaError(err);
      }
    },
  });

  // Soft delete product
  app.delete('/:id', {
    schema: {
      tags: ['Products'],
      summary: 'Delete product',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'integer' } },
      },
      response: {
        204: { type: 'null' },
      },
    },
    handler: async (req, reply) => {
      const { id } = req.params;

      try {
        await prisma.product.update({
          where: { id, ...softDeleteFilter() },
          data: { deletedAt: new Date() },
        });
      } catch (err) {
        handlePrismaError(err);
      }

      return sendDeleted(reply);
    },
  });
}
