import { createServer } from 'node:http';
import type { IncomingHttpHeaders, Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { ConfigService } from '@nestjs/config';

import type { AppConfig } from '../config/configuration';
import { RevalidationService } from './revalidation.service';

interface Captured {
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

const SECRET = 'revalidate-secret-'.padEnd(40, 'x');

function serviceFor(url: string, options: { readonly withSecret: boolean } = { withSecret: true }): RevalidationService {
  const secret = options.withSecret ? SECRET : undefined;

  return new RevalidationService(new ConfigService<AppConfig, true>({ revalidation: { url, secret } }));
}

describe('ревалидация сайта', () => {
  let server: Server;
  let url: string;
  let captured: Captured[];
  let status: number;

  beforeAll(async () => {
    server = createServer((request, response) => {
      let body = '';

      request.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf8');
      });
      request.on('end', () => {
        captured.push({ headers: request.headers, body });
        response.statusCode = status;
        response.end('{}');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/revalidate`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    captured = [];
    status = 200;
  });

  test('POST с Bearer-секретом и телом { tags } — контракт фронта D-F02', async () => {
    // Act
    await serviceFor(url).notify(['content', 'stages', 'content']);

    // Assert
    expect(captured).toHaveLength(1);
    expect(captured[0]?.headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(captured[0]?.headers['content-type']).toContain('application/json');
    expect(JSON.parse(captured[0]?.body ?? '')).toEqual({ tags: ['content', 'stages'] });
  });

  test('без секрета ревалидация выключена — запросов нет', async () => {
    // Act
    await serviceFor(url, { withSecret: false }).notify(['news']);

    // Assert
    expect(captured).toHaveLength(0);
  });

  test('ошибка сайта не пробрасывается: сохранение уже закоммичено', async () => {
    // Arrange
    status = 503;

    // Act
    const act = serviceFor(url).notify(['gallery']);

    // Assert
    await expect(act).resolves.toBeUndefined();
  });

  test('недоступный сайт тоже не роняет вызов', async () => {
    // Act
    const act = serviceFor('http://127.0.0.1:9/api/revalidate').notify(['video']);

    // Assert
    await expect(act).resolves.toBeUndefined();
  });
});
