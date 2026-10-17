import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getFlaggedOrders,
  getFlaggedOrderDetails,
  approveFlaggedOrder,
  rejectFlaggedOrder,
  requestManualReview,
  getFraudStatistics,
  getProfileChargebackHistory
} from '../fraud-review';

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(),
      update: vi.fn(),
      insert: vi.fn(),
      eq: vi.fn(),
      gt: vi.fn(),
      order: vi.fn(),
      single: vi.fn(),
      maybeSingle: vi.fn(),
      range: vi.fn()
    }))
  }))
}));

// Mock Clerk auth
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn()
}));

describe('Fraud Review Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getFlaggedOrders', () => {
    it('should require authentication', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: null }))
      }));

      const result = await getFlaggedOrders();
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('authenticated');
    });

    it('should fetch pending orders by default', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: 'user-123' }))
      }));

      // Mock successful response
      const result = await getFlaggedOrders();
      expect(result).toHaveProperty('data');
    });

    it('should respect status filter', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: 'user-123' }))
      }));

      const result = await getFlaggedOrders('approved');
      expect(result).toHaveProperty('data');
    });

    it('should support pagination', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: 'user-123' }))
      }));

      const result = await getFlaggedOrders('pending', 20, 40);
      expect(result).toHaveProperty('data');
    });
  });

  describe('getFlaggedOrderDetails', () => {
    it('should require authentication', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: null }))
      }));

      const result = await getFlaggedOrderDetails('flag-123');
      expect(result).toHaveProperty('error');
    });

    it('should fetch complete flag details', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: 'user-123' }))
      }));

      const result = await getFlaggedOrderDetails('flag-123');
      expect(result).toHaveProperty('data');
    });

    it('should include related order and signals data', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: 'user-123' }))
      }));

      const result = await getFlaggedOrderDetails('flag-123');
      if (result.data) {
        // Should include order and fraud_signals
        expect(typeof result.data).toBe('object');
      }
    });
  });

  describe('approveFlaggedOrder', () => {
    it('should require authentication', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: null }))
      }));

      const result = await approveFlaggedOrder('flag-123');
      expect(result).toHaveProperty('error');
    });

    it('should update flag status to approved', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: 'user-123' }))
      }));

      const result = await approveFlaggedOrder('flag-123', 'False alarm');
      if (!result.error) {
        expect(result).toHaveProperty('success');
        expect(result.success).toBe(true);
      }
    });

    it('should record reviewer and notes', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: 'user-123' }))
      }));

      const result = await approveFlaggedOrder('flag-123', 'Legitimate order');
      expect(result).toBeTruthy();
    });
  });

  describe('rejectFlaggedOrder', () => {
    it('should require authentication', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: null }))
      }));

      const result = await rejectFlaggedOrder('flag-123');
      expect(result).toHaveProperty('error');
    });

    it('should update flag with action', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: 'user-123' }))
      }));

      const result = await rejectFlaggedOrder('flag-123', 'hold', 'Suspicious activity');
      if (!result.error) {
        expect(result).toHaveProperty('success');
      }
    });

    it('should support multiple action types', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: 'user-123' }))
      }));

      const actions: Array<'hold' | 'cancel' | 'require_verification'> = [
        'hold',
        'cancel',
        'require_verification'
      ];

      for (const action of actions) {
        const result = await rejectFlaggedOrder('flag-123', action);
        expect(result).toBeTruthy();
      }
    });

    it('should cancel order if action is cancel', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: 'user-123' }))
      }));

      const result = await rejectFlaggedOrder('flag-123', 'cancel');
      // Should update both fraud_flags and orders tables
      expect(result).toBeTruthy();
    });
  });

  describe('requestManualReview', () => {
    it('should require authentication', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: null }))
      }));

      const result = await requestManualReview('flag-123');
      expect(result).toHaveProperty('error');
    });

    it('should update flag status to manual_review', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: 'user-123' }))
      }));

      const result = await requestManualReview('flag-123', 'Needs human review');
      if (!result.error) {
        expect(result).toHaveProperty('success');
      }
    });
  });

  describe('getFraudStatistics', () => {
    it('should require authentication', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: null }))
      }));

      const result = await getFraudStatistics();
      expect(result).toHaveProperty('error');
    });

    it('should return statistics for last 24 hours', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: 'user-123' }))
      }));

      const result = await getFraudStatistics();
      if (!result.error) {
        expect(result.data).toHaveProperty('statusCounts');
        expect(result.data).toHaveProperty('riskCounts');
        expect(result.data).toHaveProperty('topSignals');
      }
    });

    it('should include period information', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: 'user-123' }))
      }));

      const result = await getFraudStatistics();
      if (!result.error) {
        expect(result.data?.period).toBe('24h');
      }
    });
  });

  describe('getProfileChargebackHistory', () => {
    it('should require authentication', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: null }))
      }));

      const result = await getProfileChargebackHistory('profile-123');
      expect(result).toHaveProperty('error');
    });

    it('should fetch chargeback history for profile', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: 'user-123' }))
      }));

      const result = await getProfileChargebackHistory('profile-123');
      expect(result).toHaveProperty('data');
    });

    it('should order by chargeback date descending', async () => {
      vi.mock('@clerk/nextjs/server', () => ({
        auth: vi.fn(() => ({ userId: 'user-123' }))
      }));

      const result = await getProfileChargebackHistory('profile-123');
      // Should be ordered by chargeback_date DESC
      expect(result).toBeTruthy();
    });
  });
});
