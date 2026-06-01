import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';

let app;
let testCustomer;
let testProduct;
const createdOrderIds = [];

before(async () => {
  app = await buildApp();
  await app.ready();

  testCustomer = await prisma.customer.create({
    data: {
      email: `test-${Date.now()}@test.com`,
      name: 'Test Customer',
      address: 'Test Street 123',
      city: 'Zagreb',
      country: 'Croatia',
      phone: '+38591000001',
    },
  });

  testProduct = await prisma.product.create({
    data: { name: 'Test Product', price: 9.99 },
  });
});

after(async () => {
  await prisma.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  await prisma.product.delete({ where: { id: testProduct.id } });
  await prisma.customer.delete({ where: { id: testCustomer.id } });
  await app.close();
  await prisma.$disconnect();
});

test('happy path - create order, add item, checkout', async () => {
  // Create order
  const createRes = await app.inject({
    method: 'POST',
    url: '/api/orders',
    payload: { customerId: testCustomer.id },
  });
  assert.equal(createRes.statusCode, 200);
  const order = JSON.parse(createRes.body).data;
  assert.equal(order.status, 'PENDING');
  createdOrderIds.push(order.id);

  // Add item
  const addItemRes = await app.inject({
    method: 'POST',
    url: `/api/orders/${order.id}/items`,
    payload: { productId: testProduct.id, quantity: 2 },
  });
  assert.equal(addItemRes.statusCode, 200);
  const item = JSON.parse(addItemRes.body).data;
  assert.equal(item.quantity, 2);
  assert.equal(item.productId, testProduct.id);

  // Checkout
  const checkoutRes = await app.inject({
    method: 'POST',
    url: `/api/orders/${order.id}/checkout`,
  });
  assert.equal(checkoutRes.statusCode, 200);
  const checkedOut = JSON.parse(checkoutRes.body).data;
  assert.equal(checkedOut.status, 'IN_PROGRESS');
});

test('failure - cannot add item to order that is not pending', async () => {
  // Create order and immediately checkout
  const createRes = await app.inject({
    method: 'POST',
    url: '/api/orders',
    payload: { customerId: testCustomer.id },
  });
  const order = JSON.parse(createRes.body).data;
  createdOrderIds.push(order.id);

  await app.inject({
    method: 'POST',
    url: `/api/orders/${order.id}/items`,
    payload: { productId: testProduct.id, quantity: 1 },
  });

  await app.inject({
    method: 'POST',
    url: `/api/orders/${order.id}/checkout`,
  });

  // Try to add item after checkout — expects 409
  const res = await app.inject({
    method: 'POST',
    url: `/api/orders/${order.id}/items`,
    payload: { productId: testProduct.id, quantity: 1 },
  });
  assert.equal(res.statusCode, 409);
});
