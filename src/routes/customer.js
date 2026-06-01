import { prisma } from '../db.js';
import { getPagination } from '../utils/pagination.js';
import {
  handlePrismaError,
  sendDeleted,
  softDeleteFilter,
} from '../utils/responses.js';

const customerProperties = {
  id: { type: 'integer' },
  email: { type: 'string' },
  name: { type: 'string' },
  address: { type: 'string' },
  city: { type: 'string' },
  country: { type: 'string' },
  phone: { type: 'string' },
};

const createUpdateCustomerProperties = {
  email: { type: 'string', format: 'email' },
  name: { type: 'string', minLength: 5, maxLength: 100 },
  address: { type: 'string', minLength: 10, maxLength: 100 },
  city: { type: 'string', minLength: 3, maxLength: 100 },
  country: { type: 'string', minLength: 2, maxLength: 100 },
  phone: { type: 'string', pattern: '^\\+[1-9]\\d{7,14}$' },
};

export default async function customerRoutes(app) {
  // Get customers by page and filter
  app.get('/', {
    schema: {
      tags: ['Customers'],
      summary: 'Get all customers',
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 20 },
          name: { type: 'string' },
          city: { type: 'string' },
          country: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: { type: 'object', properties: customerProperties },
            },
            total: { type: 'integer' },
            page: { type: 'integer' },
            limit: { type: 'integer' },
          },
        },
      },
    },
    handler: async (req) => {
      const { name, city, country } = req.query;
      const { page, limit, skip } = getPagination(req.query);

      const where = {
        ...softDeleteFilter(),
        ...(name && { name: { contains: name, mode: 'insensitive' } }),
        ...(city && { city: { contains: city, mode: 'insensitive' } }),
        ...(country && { country: { contains: country, mode: 'insensitive' } }),
      };

      const [data, total] = await prisma.$transaction([
        prisma.customer.findMany({ where, skip, take: limit }),
        prisma.customer.count({ where }),
      ]);

      return { data, total, page, limit };
    },
  });

  // Create new customer
  app.post('/', {
    schema: {
      tags: ['Customers'],
      summary: 'Create a new customer',
      body: {
        type: 'object',
        required: ['email', 'name', 'address', 'city', 'country', 'phone'],
        properties: createUpdateCustomerProperties,
      },
      response: {
        200: { type: 'object', properties: customerProperties },
      },
    },
    handler: async (req) => {
      const { email, name, address, city, country, phone } = req.body;
      try {
        return await prisma.customer.create({
          data: { email, name, address, city, country, phone },
        });
      } catch (err) {
        handlePrismaError(err);
      }
    },
  });

  // Get customer by id
  app.get('/:id', {
    schema: {
      tags: ['Customers'],
      summary: 'Get customer by id',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'integer' } },
      },
      response: {
        200: { type: 'object', properties: customerProperties },
      },
    },
    handler: async (req) => {
      const { id } = req.params;

      try {
        return await prisma.customer.findUniqueOrThrow({
          where: { id, ...softDeleteFilter() },
        });
      } catch (err) {
        handlePrismaError(err);
      }
    },
  });

  // Update customer
  app.put('/:id', {
    schema: {
      tags: ['Customers'],
      summary: 'Update customer',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'integer' } },
      },
      body: {
        type: 'object',
        properties: createUpdateCustomerProperties,
      },
      response: {
        200: { type: 'object', properties: customerProperties },
      },
    },
    handler: async (req) => {
      const { id } = req.params;

      try {
        return await prisma.customer.update({
          where: { id, ...softDeleteFilter() },
          data: req.body,
        });
      } catch (err) {
        handlePrismaError(err);
      }
    },
  });

  // Soft delete customer
  app.delete('/:id', {
    schema: {
      tags: ['Customers'],
      summary: 'Delete customer',
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
        await prisma.customer.update({
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
