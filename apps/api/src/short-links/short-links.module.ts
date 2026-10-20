import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { AuthCoreModule } from '../auth/auth-core.module';
import { AdminShortLinksController, ShortLinkRedirectController } from './short-links.controller';
import { ShortLinksService } from './short-links.service';

/** Короткие ссылки `/go/<slug>` для QR и соцсетей: редирект с метками и CRUD в админке. */
@Module({
  imports: [AuthCoreModule, AuditModule],
  controllers: [ShortLinkRedirectController, AdminShortLinksController],
  providers: [ShortLinksService],
})
export class ShortLinksModule {}
