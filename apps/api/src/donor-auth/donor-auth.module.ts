import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { DonorAuthController } from './donor-auth.controller';
import { DonorAuthService } from './donor-auth.service';
import { DonorJwtGuard } from './donor-jwt.guard';
import { DonorTokenService } from './donor-token.service';

/**
 * Вход в кабинет жертвователя. Не импортирует ничего из `auth/` админки,
 * кроме чтения заголовка Bearer: общие гарды и JWT-модуль там — админские.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [DonorAuthController],
  providers: [DonorAuthService, DonorTokenService, DonorJwtGuard],
  exports: [DonorTokenService, DonorJwtGuard],
})
export class DonorAuthModule {}
