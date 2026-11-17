import { createParamDecorator, Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { DONOR_IDENTITY } from '../recurring-contract/contract';
import type { DonorIdentityResolver, VerifiedDonorIdentity } from '../recurring-contract/contract';
import { authRequired } from './donor-auth.errors';

export interface DonorRequest extends Request { donor?: VerifiedDonorIdentity }

/** Cookie and admin JWT are deliberately not identity sources. */
export function readDonorBearer(request: Pick<Request, 'headers'>): string | null {
  const header = request.headers.authorization;
  if (typeof header !== 'string') return null;
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(header);
  return match?.[1] ?? null;
}

@Injectable()
export class DonorSessionGuard implements CanActivate {
  constructor(@Inject(DONOR_IDENTITY) private readonly identity: DonorIdentityResolver) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DonorRequest>();
    // Never preserve an identity populated by an unrelated middleware.
    delete request.donor;
    const token = readDonorBearer(request);
    if (!token) throw authRequired();
    request.donor = await this.identity.requireSession(token);
    return true;
  }
}

export const CurrentDonor = createParamDecorator((_data: unknown, context: ExecutionContext): VerifiedDonorIdentity => {
  const donor = context.switchToHttp().getRequest<DonorRequest>().donor;
  if (!donor) throw authRequired();
  return donor;
});
