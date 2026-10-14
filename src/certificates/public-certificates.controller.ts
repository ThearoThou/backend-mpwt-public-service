import { Controller, Get, Param } from '@nestjs/common';

import { createDataResponse } from '../common/http/api-response';
import { CertificateReadsService } from './certificate-reads.service';

@Controller('certificates')
export class PublicCertificatesController {
  constructor(private readonly reads: CertificateReadsService) {}

  @Get('verify/:certificateNumber')
  async verify(@Param('certificateNumber') certificateNumber: string) {
    return createDataResponse(
      await this.reads.getPublicVerification(certificateNumber),
    );
  }
}
