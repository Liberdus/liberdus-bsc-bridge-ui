import { describe, expect, it } from 'vitest';

import {
  isPendingStatus,
  mergeTransactions,
  normalizeTxHash,
  TRANSACTION_STATUS,
} from '../js/components/transactions-tab.js';

describe('TransactionsTab transaction hash normalization', () => {
  it('normalizes bare and 0x-prefixed hashes to the same key', () => {
    expect(normalizeTxHash('0xAbCd')).toBe('abcd');
    expect(normalizeTxHash('AbCd')).toBe('abcd');
  });

  it('dedupes local and observer rows that only differ by a 0x prefix', () => {
    const observerRow = {
      txHash: 'abcd1234',
      status: TRANSACTION_STATUS.COMPLETED,
      type: 2,
      timestamp: 100,
      receiptTxHash: 'beef5678',
    };
    const localRow = {
      txHash: '0xabcd1234',
      status: TRANSACTION_STATUS.PENDING,
      type: 1,
      timestamp: 100,
      receiptTxHash: '',
    };

    const merged = mergeTransactions([observerRow], [localRow]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      txHash: 'abcd1234',
      status: TRANSACTION_STATUS.COMPLETED,
      type: 2,
      receiptTxHash: 'beef5678',
    });
    expect(typeof merged[0].status).toBe('number');
  });

  it('treats numeric observer statuses as pending-like until completion', () => {
    expect(isPendingStatus('Pending')).toBe(true);
    expect(isPendingStatus('Processing')).toBe(true);
    expect(isPendingStatus(TRANSACTION_STATUS.PENDING)).toBe(true);
    expect(isPendingStatus(TRANSACTION_STATUS.PROCESSING)).toBe(true);
    expect(isPendingStatus(TRANSACTION_STATUS.COMPLETED)).toBe(false);

    const localRow = {
      txHash: '0xabcd1234',
      status: TRANSACTION_STATUS.PENDING,
      type: 1,
      timestamp: 100,
      receiptTxHash: '',
    };
    const observerPendingRow = {
      txHash: 'abcd1234',
      status: TRANSACTION_STATUS.PENDING,
      type: 2,
      timestamp: 100,
      receiptTxHash: '',
    };
    const observerCompletedRow = {
      txHash: 'abcd1234',
      status: TRANSACTION_STATUS.COMPLETED,
      type: 2,
      timestamp: 100,
      receiptTxHash: 'beef5678',
    };

    const pendingMerged = mergeTransactions([observerPendingRow], [localRow]);
    expect(pendingMerged).toHaveLength(1);
    expect(isPendingStatus(pendingMerged[0].status)).toBe(true);

    const completedMerged = mergeTransactions([observerCompletedRow], pendingMerged);
    expect(completedMerged).toHaveLength(1);
    expect(completedMerged[0]).toMatchObject({
      txHash: 'abcd1234',
      status: TRANSACTION_STATUS.COMPLETED,
      type: 2,
      receiptTxHash: 'beef5678',
    });
    expect(typeof completedMerged[0].status).toBe('number');
  });
});
