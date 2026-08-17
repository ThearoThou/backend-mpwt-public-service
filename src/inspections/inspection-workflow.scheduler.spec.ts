import { Logger } from '@nestjs/common';
import { InspectionExpiryService } from './inspection-expiry.service';
import { InspectionWorkflowScheduler } from './inspection-workflow.scheduler';

describe('InspectionWorkflowScheduler', () => {
  const result = {
    noShows: { scanned: 0, processed: 0, skipped: 0 },
    noShowRebookingExpiries: { scanned: 0, processed: 0, skipped: 0 },
    reinspectionDeadlineExpiries: { scanned: 0, processed: 0, skipped: 0 },
  };
  let processDueActions: jest.Mock;
  let scheduler: InspectionWorkflowScheduler;
  let log: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    processDueActions = jest.fn().mockResolvedValue(result);
    scheduler = new InspectionWorkflowScheduler({
      processDueActions,
    } as unknown as InspectionExpiryService);
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('delegates one normal execution and accepts a zero-work result', async () => {
    await scheduler.processInspectionWorkflows();
    expect(processDueActions).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('skips an overlapping tick and accepts a later invocation after completion', async () => {
    let resolve!: (value: typeof result) => void;
    processDueActions.mockReturnValueOnce(
      new Promise<typeof result>((completion) => {
        resolve = completion;
      }),
    );
    const first = scheduler.processInspectionWorkflows();
    await scheduler.processInspectionWorkflows();
    expect(processDueActions).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    resolve(result);
    await first;
    await scheduler.processInspectionWorkflows();
    expect(processDueActions).toHaveBeenCalledTimes(2);
  });

  it('logs errors and clears busy state for a later successful tick', async () => {
    processDueActions.mockRejectedValueOnce(new Error('unexpected failure'));
    await expect(
      scheduler.processInspectionWorkflows(),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    await scheduler.processInspectionWorkflows();
    expect(processDueActions).toHaveBeenCalledTimes(2);
  });
});
