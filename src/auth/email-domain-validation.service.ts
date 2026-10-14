import { Injectable } from '@nestjs/common';
import { promises as dns } from 'node:dns';

@Injectable()
export class EmailDomainValidationService {
  async hasMailDomain(email: string): Promise<boolean> {
    const domain = email.slice(email.lastIndexOf('@') + 1);
    let mailLookupError: unknown;

    try {
      const mailExchanges = await dns.resolveMx(domain);
      if (mailExchanges.length > 0) return true;
    } catch (error) {
      // Some valid receiving domains intentionally use an address-record fallback.
      mailLookupError = error;
    }

    const addressLookups = await Promise.allSettled([
      dns.resolve4(domain),
      dns.resolve6(domain),
    ]);
    if (addressLookups.some(
      (result) => result.status === 'fulfilled' && result.value.length > 0,
    )) return true;

    const lookupErrors: unknown[] = [
      mailLookupError,
      ...addressLookups
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason),
    ];
    const errorCodes = lookupErrors
      .filter((error): error is NodeJS.ErrnoException => error instanceof Error)
      .map((error) => error.code ?? '');
    const domainDoesNotExist = errorCodes.length > 0 && errorCodes.every(
      (code) => ['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes(code),
    );

    // DNS outages must not turn a valid email address into a rejected profile change.
    return !domainDoesNotExist;
  }
}
