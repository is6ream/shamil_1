import { BadRequestException, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';

import { BCRYPT_COST, PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from './auth.constants';

/**
 * Хеширование паролей (D-04: bcryptjs, cost 12).
 *
 * `bcryptjs`, а не `argon2`: чистый JS без нативной сборки — меньше сюрпризов
 * в образе. Скорость при этом та же по порядку, что и требуется: ~250 мс.
 */
@Injectable()
export class PasswordService implements OnModuleInit {
  /**
   * Хеш-пустышка для входа с несуществующим e-mail. Сравнение с ним тратит
   * столько же времени, сколько настоящая проверка, — по времени ответа нельзя
   * понять, есть ли такой пользователь.
   */
  private dummyHash: string | undefined;

  async onModuleInit(): Promise<void> {
    await this.getDummyHash();
  }

  /** Проверка пароля по правилам до хеширования. Нарушение — 400 с понятным текстом. */
  assertPolicy(password: string): void {
    if (password.length < PASSWORD_MIN_LENGTH) {
      throw new BadRequestException(`Пароль — не короче ${PASSWORD_MIN_LENGTH} символов`);
    }

    if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) {
      // bcrypt молча отбросил бы хвост — человек думал бы, что защищён всем паролем.
      throw new BadRequestException(
        `Пароль — не длиннее ${PASSWORD_MAX_BYTES} байт (кириллица занимает 2 байта на букву)`,
      );
    }
  }

  async hash(password: string): Promise<string> {
    this.assertPolicy(password);

    return hash(password, BCRYPT_COST);
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    return compare(password, passwordHash);
  }

  /** Сравнение «вхолостую» — для выравнивания времени ответа. Результат не важен. */
  async burnTime(password: string): Promise<void> {
    await compare(password, await this.getDummyHash());
  }

  private async getDummyHash(): Promise<string> {
    this.dummyHash ??= await hash('dummy-password-for-timing', BCRYPT_COST);

    return this.dummyHash;
  }
}
