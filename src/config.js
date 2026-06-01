export const schema = {
  type: 'object',
  required: ['PORT', 'DATABASE_URL', 'REDIS_HOST', 'REDIS_PORT'],
  properties: {
    NODE_ENV:        { type: 'string', default: 'development' },
    PORT:            { type: 'integer', default: 3000 },
    HOST:            { type: 'string', default: '0.0.0.0' },
    DATABASE_URL:    { type: 'string' },
    REDIS_HOST:      { type: 'string', default: 'localhost' },
    REDIS_PORT:      { type: 'integer', default: 6379 },
    REDIS_PASSWORD:  { type: 'string', default: '' },
  },
}

export const options = {
  confKey: 'config',
  schema,
  dotenv: true,
}
