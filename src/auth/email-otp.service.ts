import { HttpStatus, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { VerificationPurpose } from './enums/verification-purpose.enum';
import { ApiErrorCode } from '../common/errors/api-error-code';
import { DomainException } from '../common/errors/domain.exception';

@Injectable()
export class EmailOtpService {
  private readonly logger = new Logger(EmailOtpService.name);

  constructor(private readonly configService: ConfigService) {}

  async send(
    to: string,
    code: string,
    purpose: VerificationPurpose,
    expiresInSeconds: number,
  ): Promise<void> {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const from = this.configService.get<string>('EMAIL_FROM');

    if (!apiKey || !from) {
      throw new ServiceUnavailableException(
        'Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM.',
      );
    }

    const isPasswordReset =
      purpose === VerificationPurpose.RESET_PASSWORD
    const isEmailChange = purpose === VerificationPurpose.CHANGE_EMAIL;
    const subject = isPasswordReset
      ? 'លេខកូដកំណត់ពាក្យសម្ងាត់ឡើងវិញ | Password reset code'
      : isEmailChange
        ? 'លេខកូដផ្ទៀងផ្ទាត់អ៊ីមែលថ្មី | New email verification code'
      : 'លេខកូដផ្ទៀងផ្ទាត់គណនី | Account verification code';
    const khmerAction = isPasswordReset
      ? 'កំណត់ពាក្យសម្ងាត់របស់អ្នកឡើងវិញ'
      : isEmailChange
        ? 'ផ្ទៀងផ្ទាត់អ៊ីមែលថ្មីរបស់អ្នក'
      : 'ផ្ទៀងផ្ទាត់គណនីរបស់អ្នក';
    const englishAction = isPasswordReset
      ? 'reset your password'
      : isEmailChange
        ? 'verify your new email address'
      : 'verify your account';
    const minutes = Math.ceil(expiresInSeconds / 60);
    const logo = await this.getEmbeddedLogo();
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text: `លេខកូដផ្ទៀងផ្ទាត់ MPWT របស់អ្នកគឺ ${code}។ សូមប្រើវាដើម្បី${khmerAction}។ វាផុតកំណត់ក្នុងរយៈពេល ${minutes} នាទី។\n\nYour MPWT verification code is ${code}. Use it to ${englishAction}. It expires in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        html: this.createHtmlEmail(
          code,
          isPasswordReset
            ? 'លេខកូដកំណត់ពាក្យសម្ងាត់ឡើងវិញ'
            : isEmailChange
              ? 'លេខកូដផ្ទៀងផ្ទាត់អ៊ីមែលថ្មី'
            : 'លេខកូដផ្ទៀងផ្ទាត់របស់អ្នក',
          khmerAction,
          englishAction,
          minutes,
        ),
        attachments: [
          {
            content: logo,
            filename: 'mpwt-logo.svg',
            content_type: 'image/svg+xml',
            content_id: 'mpwt-logo',
          },
        ],
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      this.logger.error(`Resend rejected OTP email: ${response.status} ${details}`);
      if (response.status === 403 && from.includes('@resend.dev')) {
        throw new DomainException(
          ApiErrorCode.EMAIL_DELIVERY_RESTRICTED,
          HttpStatus.UNPROCESSABLE_ENTITY,
          'The email service is in test mode and can only send to the Resend account email. Verify a domain in Resend to deliver to other email addresses.',
        );
      }
      throw new ServiceUnavailableException(
        'Unable to send the verification email. Please try again later.',
      );
    }
  }

  private async getEmbeddedLogo(): Promise<string> {
    const logoPath = join(__dirname, 'assets', 'mpwt-logo.svg');
    return (await readFile(logoPath)).toString('base64');
  }

  private createHtmlEmail(
    code: string,
    khmerTitle: string,
    khmerAction: string,
    englishAction: string,
    minutes: number,
  ): string {
    const minuteLabel = minutes === 1 ? 'minute' : 'minutes';

    return `<!doctype html>
<html lang="km">
  <body style="margin:0;background:#f5f6fb;color:#17212b;font-family:'Siemreap',Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#f5f6fb;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #d7dced;">
          <tr><td style="padding:24px 32px;background:#2a3472;color:#ffffff;text-align:center;">
            <img src="cid:mpwt-logo" width="62" height="62" alt="MPWT" style="display:block;margin:0 auto 12px;max-width:62px;" />
            <div style="font-family:'Moul','Siemreap',Arial,sans-serif;font-size:18px;font-weight:400;line-height:1.65;">ក្រសួងសាធារណការ និងដឹកជញ្ជូន</div>
            <div style="font-size:11px;letter-spacing:.02em;margin-top:5px;opacity:.9;">MINISTRY OF PUBLIC WORKS AND TRANSPORT</div>
          </td></tr>
          <tr><td style="padding:32px;">
            <h1 style="font-family:'Siemreap',Arial,sans-serif;font-size:19px;font-weight:400;line-height:1.45;margin:0 0 16px;color:#1f2d63;">${khmerTitle}</h1>
            <p style="font-size:16px;line-height:1.7;margin:0 0 22px;">សូមប្រើលេខកូដខាងក្រោម ដើម្បី${khmerAction}។</p>
            <div style="margin:0 0 22px;padding:18px;text-align:center;border-radius:10px;background:#eef1fb;border:1px dashed #5668ad;font-size:32px;font-weight:700;letter-spacing:8px;color:#2a3472;">${code}</div>
            <p style="font-size:14px;line-height:1.6;margin:0;color:#56636c;">លេខកូដនេះនឹងផុតកំណត់ក្នុងរយៈពេល ${minutes} នាទី។ សូមកុំចែករំលែកលេខកូដនេះជាមួយអ្នកដទៃ។</p>
            <hr style="border:0;border-top:1px solid #e5eaed;margin:28px 0;" />
            <h2 style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:400;margin:0 0 10px;color:#1f2d63;">Your verification code</h2>
            <p style="font-size:15px;line-height:1.6;margin:0;color:#56636c;">Use the code above to ${englishAction}. It expires in ${minutes} ${minuteLabel}. Do not share this code with anyone.</p>
          </td></tr>
          <tr><td style="padding:18px 32px;background:#eef0f8;text-align:center;font-size:12px;line-height:1.5;color:#66757d;">Vehicle Inspection Renewal</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  }
}
