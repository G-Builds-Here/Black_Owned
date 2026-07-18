# Test Data Conventions

This document defines the naming conventions and patterns for test data in the Black Owned system.

## Overview

All test data must be clearly marked to enable:
- Easy identification during development and testing
- Simple querying for data inspection
- Clean removal without affecting production data

## Naming Conventions

### Business Names

All test businesses MUST use the `BWS-TEST:` prefix:

```
BWS-TEST: My Test Business
BWS-TEST: Community Store
BWS-TEST: Tech Solutions
```

### User Emails

All test user emails MUST use the `bws-test@domain.com` domain pattern:

```
john-doe@bws-test@domain.com
jane-smith@bws-test@domain.com
test-user-1@bws-test@domain.com
```

## Usage

### Import the utilities

```typescript
import {
  formatBusinessName,
  formatUserEmail,
  isTestBusiness,
  isTestEmail,
  generateTestBusinesses,
  generateTestUsers,
  generateTestSeedData,
} from "./utils/test-data-seeder";
```

### Create test businesses

```typescript
// Single business
const business = {
  name: "My Test Store",
  formattedName: formatBusinessName("My Test Store"),
};
// Result: { name: "My Test Store", formattedName: "BWS-TEST: My Test Store" }

// Multiple businesses
const testBusinesses = generateTestBusinesses(5);
```

### Create test users

```typescript
// Single user
const user = {
  firstName: "John",
  lastName: "Doe",
  formattedEmail: formatUserEmail("John Doe"),
};
// Result: { formattedEmail: "john-doe@bws-test@domain.com" }

// Multiple users
const testUsers = generateTestUsers(5);
```

### Query test data

```sql
-- Find all test businesses
SELECT * FROM businesses WHERE name LIKE 'BWS-TEST:%';

-- Find all test users
SELECT * FROM users WHERE email LIKE '%@bws-test@domain.com';

-- Count test data
SELECT COUNT(*) FROM businesses WHERE name LIKE 'BWS-TEST:%';
SELECT COUNT(*) FROM users WHERE email LIKE '%@bws-test@domain.com';
```

### Clean up test data

```sql
-- Delete all test businesses
DELETE FROM businesses WHERE name LIKE 'BWS-TEST:%';

-- Delete all test users
DELETE FROM users WHERE email LIKE '%@bws-test@domain.com';
```

## Helper Functions

| Function | Description |
|----------|-------------|
| `formatBusinessName(name)` | Adds BWS-TEST prefix to business name |
| `formatUserEmail(baseName)` | Creates email with bws-test@domain.com domain |
| `isTestBusiness(name)` | Returns true if name has BWS-TEST prefix |
| `isTestEmail(email)` | Returns true if email uses bws-test domain |
| `generateTestBusinesses(count)` | Generates sample test businesses |
| `generateTestUsers(count)` | Generates sample test users |
| `generateTestSeedData(bizCount, userCount)` | Generates complete seed data |

## Acceptance Criteria

This implementation satisfies:

- [x] All business names include the "BWS-TEST" prefix
- [x] All test user emails use the bws-test@domain.com pattern
- [x] Test data can be easily queried and cleaned up via these markers
