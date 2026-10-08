import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AuthCoreModule } from './auth-core.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { RefreshTokenService } from './refresh-token.service';

/** Вход, сессии и пользователи админки (D-04…D-06). */
@Module({
  imports: [AuthCoreModule, AuditModule],
  controllers: [AuthController, AdminUsersController],
  providers: [AuthService, AdminUsersService, PasswordService, RefreshTokenService],
  exports: [PasswordService],
})
export class AuthModule {}
