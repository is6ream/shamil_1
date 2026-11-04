import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { DonorAuthController } from './donor-auth.controller';
import { DonorAuthService } from './donor-auth.service';
import { DonorCodeService } from './donor-code.service';
import { DonorJwtGuard } from './donor-jwt.guard';
import { DonorSessionService } from './donor-session.service';
import { DonorTokenService } from './donor-token.service';
import { VkAuthService } from './vk/vk-auth.service';
import { HttpVkIdClient, VK_ID_CLIENT } from './vk/vk-id.client';

/**
 * Вход в кабинет жертвователя. Не импортирует ничего из `auth/` админки,
 * кроме чтения заголовков: общие гарды и JWT-модуль там — админские.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [DonorAuthController],
  providers: [
    DonorAuthService,
    DonorCodeService,
    DonorSessionService,
    DonorTokenService,
    DonorJwtGuard,
    VkAuthService,
    { provide: VK_ID_CLIENT, useClass: HttpVkIdClient },
  ],
  exports: [DonorTokenService, DonorSessionService, DonorCodeService, DonorJwtGuard],
})
export class DonorAuthModule {}
