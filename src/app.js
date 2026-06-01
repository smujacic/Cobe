import Fastify from 'fastify';
import fastifyEnv from '@fastify/env';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { options as envOptions } from './config.js';
import routes from './routes/index.js';
import { STATUS_CODES } from 'node:http';

export async function buildApp() {
  const app = Fastify({
    logger: true,
    ajv: {
      customOptions: { allErrors: true },
    },
  });

  await app.register(fastifyEnv, envOptions);

  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Cobe API',
        version: '1.0.0',
      },
    },
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
  });

  app.register(routes, { prefix: '/api' });

  // normalize API response shape
  app.addHook('onSend', async (request, reply, payload) => {
    if (reply.statusCode >= 400 || payload === null) return payload;
    if (request.url.startsWith('/docs')) return payload;

    const contentType = reply.getHeader('content-type');
    if (!contentType?.includes('application/json')) return payload;

    const data = JSON.parse(payload);

    return JSON.stringify({
      statusCode: reply.statusCode,
      statusMessage: STATUS_CODES[reply.statusCode] ?? 'Unknown',
      data,
    });
  });

  const customMessages = {
    phone: {
      pattern: 'must be a valid international phone number, e.g. +38591223344',
    },
  };

  app.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      const errors = error.validation.map((e) => {
        const field =
          e.instancePath.replace('/', '') || e.params?.missingProperty;
        const message = customMessages[field]?.[e.keyword] ?? e.message;
        return { field, message };
      });

      return reply.status(400).send({
        statusCode: 400,
        statusMessage: 'Validation failed',
        errors,
        data: null,
      });
    }

    reply.status(error.statusCode ?? 500).send({
      statusCode: error.statusCode ?? 500,
      statusMessage: error.message,
      data: null,
    });
  });

  return app;
}
