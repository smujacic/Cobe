export default async function routes(app) {
  app.get('/health', async () => ({ status: 'ok' }));
  app.register(import('./customer.js'), { prefix: '/customers' });
  app.register(import('./product.js'), { prefix: '/products' });
  app.register(import('./order.js'), { prefix: '/orders' });
}
