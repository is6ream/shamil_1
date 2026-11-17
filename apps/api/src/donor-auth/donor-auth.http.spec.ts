import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { VALIDATION_PIPE_OPTIONS } from '../bootstrap';
import { DONOR_IDENTITY } from '../recurring-contract/contract';
import { DonorAuthController } from './donor-auth.controller';
import { DonorAuthService } from './donor-auth.service';
import { authRequired, donorError } from './donor-auth.errors';
import { DonorSessionGuard } from './donor-session.guard';

describe('donor auth HTTP boundary (isolated Nest module)', () => {
  let app: INestApplication;
  const token = 'a'.repeat(43);
  const auth = {
    requestCode: jest.fn(), verify: jest.fn(), session: jest.fn(), logout: jest.fn(), requireSession: jest.fn(),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DonorAuthController], providers: [
        DonorSessionGuard, { provide: DonorAuthService, useValue: auth }, { provide: DONOR_IDENTITY, useValue: auth },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe(VALIDATION_PIPE_OPTIONS));
    await app.init();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    auth.requireSession.mockResolvedValue({ donorId: randomUUID(), sessionId: randomUUID(), emailVerifiedAt: new Date() });
    auth.session.mockResolvedValue({ donor: { id: randomUUID(), email: 'synthetic@example.test', emailVerifiedAt: new Date().toISOString() }, expiresAt: new Date().toISOString() });
  });
  afterAll(async () => { await app.close(); });

  it('returns 202 without cookies and no-store/no-referrer on successful issuance', async () => {
    auth.requestCode.mockResolvedValue({ accepted: true, challengeId: randomUUID(), expiresInSeconds: 600, retryAfterSeconds: 60 });
    const reply = await request(app.getHttpServer()).post('/api/donor/auth/request-code').send({ email: 'synthetic@example.test' }).expect(202);
    expect(reply.headers['cache-control']).toBe('no-store');
    expect(reply.headers['referrer-policy']).toBe('no-referrer');
    expect(reply.headers['set-cookie']).toBeUndefined();
    expect(reply.body).not.toHaveProperty('code');
  });

  it('marks validation/rate-limit errors private and emits Retry-After', async () => {
    const invalid = await request(app.getHttpServer()).post('/api/donor/auth/request-code').send({ email: 'not-email', ownerId: 'injected' }).expect(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    expect(invalid.headers['cache-control']).toBe('no-store');
    expect(auth.requestCode).not.toHaveBeenCalled();
    auth.requestCode.mockRejectedValue(donorError(429, 'RATE_LIMITED', 'Повторите позже', 60));
    const limited = await request(app.getHttpServer()).post('/api/donor/auth/request-code').send({ email: 'synthetic@example.test' }).expect(429);
    expect(limited.headers['retry-after']).toBe('60');
    expect(limited.headers['referrer-policy']).toBe('no-referrer');
  });

  it.each([undefined, 'Bearer admin.jwt.token', 'Bearer ' + 'a'.repeat(64)])('rejects missing/admin/legacy bearer: %s', async header => {
    const call = request(app.getHttpServer()).get('/api/donor/auth/session').set('Cookie', `shamil-donor-session=${token}; shamil-admin-refresh=${token}`);
    if (header) call.set('Authorization', header);
    const reply = await call.expect(401);
    expect(reply.body.error.code).toBe('AUTH_REQUIRED');
    expect(reply.headers['cache-control']).toBe('no-store');
    expect(auth.requireSession).not.toHaveBeenCalled();
    expect(auth.session).not.toHaveBeenCalled();
  });

  it('uses the injected resolver and rejects revoked bearer', async () => {
    await request(app.getHttpServer()).get('/api/donor/auth/session').set('Authorization', `Bearer ${token}`).expect(200);
    expect(auth.requireSession).toHaveBeenCalledWith(token);
    auth.requireSession.mockRejectedValue(authRequired());
    await request(app.getHttpServer()).get('/api/donor/auth/session').set('Authorization', `Bearer ${token}`).expect(401);
  });

  it('returns API-to-BFF token only from verify; no cookie mutation in API', async () => {
    auth.verify.mockResolvedValue({ sessionToken: token, donor: {}, expiresAt: 'synthetic' });
    const reply = await request(app.getHttpServer()).post('/api/donor/auth/verify').send({ challengeId: randomUUID(), code: '000001' }).expect(200);
    expect(reply.body.sessionToken).toBe(token);
    expect(reply.headers['set-cookie']).toBeUndefined();
    expect(reply.headers['cache-control']).toBe('no-store');
    expect(reply.headers.location).toBeUndefined();
    expect(reply.body).not.toHaveProperty('redirectUrl');
    expect(reply.body).not.toHaveProperty('subscriptionId');
  });

  it.each([
    ['request-code', 'returnTo'], ['request-code', 'draft'],
    ['verify', 'returnTo'], ['verify', 'draft'],
  ])('keeps draft/return context outside auth DTO: %s rejects %s', async (route, field) => {
    const body = route === 'request-code'
      ? { email: 'synthetic@example.test' }
      : { challengeId: randomUUID(), code: '000001' };
    const reply = await request(app.getHttpServer()).post(`/api/donor/auth/${route}`)
      .send({ ...body, [field]: field === 'draft' ? { amountKopecks: 10000, frequency: 'every_friday', isAnonymous: true } : 'https://external.example.test/return' })
      .expect(400);
    expect(reply.body.error.code).toBe('VALIDATION_ERROR');
    expect(reply.headers.location).toBeUndefined();
    expect(auth.requestCode).not.toHaveBeenCalled();
    expect(auth.verify).not.toHaveBeenCalled();
  });

  it('allows idempotent empty logout, ignores cookies, rejects extra body keys', async () => {
    await request(app.getHttpServer()).post('/api/donor/auth/logout').set('Cookie', `shamil-donor-session=${token}`).send({}).expect(204);
    expect(auth.logout).toHaveBeenLastCalledWith(null);
    await request(app.getHttpServer()).post('/api/donor/auth/logout').set('Authorization', `Bearer ${token}`).send({}).expect(204);
    expect(auth.logout).toHaveBeenLastCalledWith(token);
    await request(app.getHttpServer()).post('/api/donor/auth/logout').send({ ownerId: randomUUID() }).expect(400);
  });

  it('does not disclose internal exceptions in error JSON', async () => {
    auth.requestCode.mockRejectedValue(new Error('SMTP synthetic@example.test secret token code'));
    const reply = await request(app.getHttpServer()).post('/api/donor/auth/request-code').send({ email: 'synthetic@example.test' }).expect(503);
    expect(reply.body).toEqual({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Запрос не выполнен' } });
  });
});
