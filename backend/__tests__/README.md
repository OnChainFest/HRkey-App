# HRKey Web3 Wallet Integration - Test Suite

This directory contains the comprehensive automated test suite for the HRKey Web3 wallet payment integration.

## 📋 Overview

The test suite provides extensive coverage of:
- ✅ **Unit Tests** - Individual service testing (WalletManager, NotificationManager)
- ⏳ **Integration Tests** - API endpoint testing (coming soon)
- 🎯 **Mock Data** - Reusable fixtures and test helpers
- 🔧 **Utilities** - Helper functions for test setup and teardown

## 🏗️ Structure

```
backend/__tests__/
├── setup.ts                           # Global test configuration
├── unit/                              # Unit tests
│   ├── wallet-manager.test.ts         # Wallet service tests
│   └── notification-manager.test.ts   # Notification service tests
├── integration/                       # Integration tests (coming soon)
│   ├── wallet-api.test.ts
│   └── notifications-api.test.ts
└── utils/                             # Test utilities
    ├── test-helpers.ts                # Helper functions
    └── mock-data.ts                   # Mock data factory
```

## 🚀 Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### Watch Mode (Development)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

### CI Mode
```bash
npm run test:ci
```

## 📊 Coverage Goals

| Component | Target | Current |
|-----------|--------|---------|
| WalletManager | 80% | ✅ Achieved |
| NotificationManager | 80% | ✅ Achieved |
| API Endpoints | 70% | ⏳ Pending |
| Overall | 60% | ✅ On track |

## 🧪 Test Categories

### Unit Tests

#### WalletManager Tests
Tests for wallet creation, management, and validation:

**Key Scenarios:**
- ✅ Custodial wallet creation with encryption
- ✅ Non-custodial wallet linking (MetaMask, Coinbase)
- ✅ Ethereum address validation
- ✅ Balance fetching (RLUSD + ETH)
- ✅ Private key encryption/decryption
- ✅ Duplicate wallet prevention
- ✅ Wallet deletion with balance check
- ✅ Address checksumming

**Files:** `unit/wallet-manager.test.ts`

#### NotificationManager Tests
Tests for notification creation and email sending:

**Key Scenarios:**
- ✅ In-app notification creation
- ✅ Email sending via Resend
- ✅ Graceful email failure handling
- ✅ Mark as read/unread
- ✅ Unread count tracking
- ✅ Bulk operations (mark all as read)
- ✅ Notification archiving
- ✅ Pagination
- ✅ Email template generation

**Files:** `unit/notification-manager.test.ts`

### Integration Tests (Coming Soon)

#### Wallet API Tests
Full HTTP endpoint testing:

**Endpoints:**
- `POST /api/wallet/setup` - Create/link wallet
- `GET /api/wallet/me` - Get user wallet + balance
- `GET /api/wallet/balance/:userId` - Get balance
- `DELETE /api/wallet/me` - Delete wallet
- `GET /api/wallet/has-wallet/:userId` - Check existence

#### Notifications API Tests
Full HTTP endpoint testing:

**Endpoints:**
- `GET /api/notifications` - List notifications
- `GET /api/notifications/unread-count` - Get count
- `PATCH /api/notifications/:id/read` - Mark as read
- `POST /api/notifications/mark-all-read` - Bulk read
- `DELETE /api/notifications/:id` - Delete

## 🛠️ Test Utilities

### Test Helpers (`utils/test-helpers.ts`)

**Functions:**
- `createTestUser()` - Create Supabase test user
- `createTestWallet()` - Create test wallet in DB
- `cleanupTestUser()` - Clean up test data
- `generateMockPaymentEvent()` - Generate blockchain event
- `generateEthAddress()` - Generate valid Ethereum address
- `mockSuccessResponse()` - Mock Supabase success
- `mockErrorResponse()` - Mock Supabase error

### Mock Data (`utils/mock-data.ts`)

**Fixtures:**
- `mockUsers` - Predefined test users (provider, candidate, employer)
- `mockWallets` - Predefined wallets (custodial, MetaMask)
- `mockNotifications` - All notification types
- `mockReferences` - Reference objects
- `mockPayments` - Payment objects
- `mockBalances` - Balance scenarios

**Factories:**
- `createMockNotification()` - Generate notification
- `createMockWallet()` - Generate wallet
- `createMockPayment()` - Generate payment

## 🔧 Configuration

### Jest Config (`jest.config.js`)
```javascript
{
  preset: 'ts-jest',
  testEnvironment: 'node',
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 60,
      lines: 60,
      statements: 60
    }
  }
}
```

### Global Setup (`setup.ts`)
Sets up:
- Test environment variables
- Supabase test URLs
- Encryption keys
- RPC URLs
- Token addresses

## 🎯 Mocking Strategy

### External Services Mocked:
- ✅ **Supabase** - Database operations
- ✅ **Resend** - Email sending
- ✅ **Ethers.js** - Blockchain interactions
- ✅ **Crypto** - Encryption/decryption

### Real Logic Tested:
- ✅ Business logic
- ✅ Validation
- ✅ Error handling
- ✅ Data transformations

## 🚨 Common Issues

### Issue: "Cannot find module '@/...'"
**Solution:** Check `moduleNameMapper` in `jest.config.js`

### Issue: "Unexpected token 'export'"
**Solution:** Ensure `transform` and `extensionsToTreatAsEsm` are configured

### Issue: "Environment variable not set"
**Solution:** Check `setup.ts` for required env vars

### Issue: Tests timing out
**Solution:** Increase timeout in `setup.ts` (default: 30s)

## 📝 Writing New Tests

### Unit Test Template
```typescript
import { WalletManager } from '../../services/wallet/wallet-manager';

describe('YourService', () => {
  let service: YourService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new YourService();
  });

  test('should do something', async () => {
    // Arrange
    const input = { /* ... */ };

    // Act
    const result = await service.method(input);

    // Assert
    expect(result).toBeDefined();
    expect(result.property).toBe('expected');
  });
});
```

### Integration Test Template
```typescript
import request from 'supertest';
import { app } from '../../server';

describe('POST /api/endpoint', () => {
  test('should return 200 with valid data', async () => {
    const response = await request(app)
      .post('/api/endpoint')
      .set('Authorization', `Bearer ${token}`)
      .send({ /* data */ });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
  });
});
```

## 🔍 Best Practices

1. **Test Isolation** - Each test should be independent
2. **Clear Naming** - Use descriptive test names
3. **Arrange-Act-Assert** - Follow AAA pattern
4. **Mock External** - Mock all external services
5. **Test Both Paths** - Success AND error cases
6. **Clean Up** - Always clean up test data
7. **Fast Tests** - Unit tests < 1s, Integration tests < 5s

## 📚 Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing Library](https://testing-library.com/)
- [Supertest Docs](https://github.com/visionmedia/supertest)
- [Test-Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html)

## 🤝 Contributing

When adding new features:
1. Write tests first (TDD)
2. Ensure >80% coverage for new code
3. Update this README if adding new test categories
4. Run `npm run test:coverage` before committing
5. Ensure CI passes

## 📞 Support

For questions about the test suite:
- Check existing tests for examples
- Review this README
- Ask in team chat
