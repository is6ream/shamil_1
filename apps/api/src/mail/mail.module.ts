import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';
import { DONOR_MAIL } from '../recurring-contract/contract';
import { SmtpMailSender, type DonorSmtpOptions } from './smtp-mail.sender';

@Module({
  providers: [{ provide: DONOR_MAIL, inject: [ConfigService], useFactory: (config: ConfigService) => {
    const options = config.get<DonorSmtpOptions>('donor.smtp');
    // No debug sender or network activity until an explicitly configured request.
    return options ? new SmtpMailSender(options, createTransport) : null;
  } }],
  exports: [DONOR_MAIL],
})
export class MailModule {}
