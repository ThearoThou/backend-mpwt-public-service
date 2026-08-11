import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { RejectApplicationDto } from './reject-application.dto';
import { ReopenApplicationDto } from './reopen-application.dto';

describe.each([
  ['RejectApplicationDto', RejectApplicationDto],
  ['ReopenApplicationDto', ReopenApplicationDto],
])('%s', (_name, Dto) => {
  it('requires a trimmed reason of at most 500 characters', async () => {
    const valid = plainToInstance(Dto, { reason: ' reason ' });
    const blank = plainToInstance(Dto, { reason: '   ' });
    const overlong = plainToInstance(Dto, { reason: 'x'.repeat(501) });

    expect(await validate(valid)).toHaveLength(0);
    expect(valid.reason).toBe('reason');
    expect(await validate(blank)).not.toHaveLength(0);
    expect(await validate(overlong)).not.toHaveLength(0);
  });
});
