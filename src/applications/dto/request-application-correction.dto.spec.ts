import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { DocumentType } from '../enums/document-type.enum';
import { RequestApplicationCorrectionDto } from './request-application-correction.dto';

describe('RequestApplicationCorrectionDto', () => {
  it('requires unique document types and trims a valid reason', async () => {
    const input = plainToInstance(RequestApplicationCorrectionDto, {
      documentTypes: [DocumentType.CITIZEN_ID_CARD],
      reason: ' Please upload a clearer image. ',
    });

    expect(await validate(input)).toHaveLength(0);
    expect(input.reason).toBe('Please upload a clearer image.');
  });

  it.each([
    [[], 'reason'],
    [[DocumentType.CITIZEN_ID_CARD, DocumentType.CITIZEN_ID_CARD], 'reason'],
    [['NOT_A_DOCUMENT'], 'reason'],
    [[DocumentType.CITIZEN_ID_CARD], '   '],
    [[DocumentType.CITIZEN_ID_CARD], 'x'.repeat(501)],
  ])('rejects invalid correction input', async (documentTypes, reason) => {
    const input = plainToInstance(RequestApplicationCorrectionDto, {
      documentTypes,
      reason,
    });

    expect(await validate(input)).not.toHaveLength(0);
  });
});
