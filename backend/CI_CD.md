# CI/CD Documentation

**Service**: HRkey Backend
**Last Updated**: 2025-12-09

---

## Overview

The HRkey backend uses **GitHub Actions** for continuous integration (CI) to ensure code quality and prevent regressions.

---

## Workflows

### Backend CI (`backend-ci.yml`)

**Purpose**: Automated testing and validation for backend code changes.

**Triggers**:
- ✅ **Push** to `main` branch
- ✅ **Push** to any `claude/**` branch
- ✅ **Pull Request** targeting `main` branch

**Path filters**:
- Only runs when files in `backend/` directory change
- Or when the workflow file itself changes

**Jobs**:

#### 1. backend-tests
Runs the complete test suite for the backend.

**Environment**:
- OS: Ubuntu Latest
- Node.js: 20.x (LTS)
- Timeout: 10 minutes

**Steps**:
1. **Checkout code**: Clone the repository
2. **Setup Node.js**: Install Node 20.x with npm cache
3. **Install dependencies**: Run `npm ci` (clean install)
4. **Run tests**: Execute `npm test` with proper environment variables
5. **Upload results**: Archive test coverage (if generated)

**Environment Variables** (for tests):
```yaml
NODE_ENV: test
NODE_OPTIONS: --experimental-vm-modules
SUPABASE_URL: https://mock-project.supabase.co
SUPABASE_SERVICE_KEY: mock-service-key-for-testing
STRIPE_SECRET_KEY: sk_test_mock_key_for_testing_...
STRIPE_WEBHOOK_SECRET: whsec_mock_webhook_secret_for_testing_...
APP_URL: http://localhost:8080
FRONTEND_URL: http://localhost:3000
```

**Note**: These are **mock values** for testing. Real secrets are never stored in the workflow file.

#### 2. backend-lint
Checks code quality and formatting (if lint script exists).

**Steps**:
1. **Checkout code**: Clone the repository
2. **Setup Node.js**: Install Node 20.x with npm cache
3. **Install dependencies**: Run `npm ci`
4. **Check lint script**: Detect if `npm run lint` exists
5. **Run lint**: Execute linter if configured, skip otherwise

---

## Running Tests Locally

### Prerequisites
- Node.js 20.x (LTS)
- npm 10.x or higher

### Install Dependencies
```bash
cd backend
npm install
```

### Run All Tests
```bash
cd backend
npm test
```

**Expected output**:
```
Test Suites: 9 total
Tests:       143 passed, 14 skipped, 1 flaky
Time:        ~15-20 seconds
```

### Run Tests in Watch Mode
```bash
cd backend
npm run test:watch
```

### Run Tests with Coverage
```bash
cd backend
npm run test:coverage
```

**Coverage report**: Generated in `backend/coverage/`

### Run Specific Test File
```bash
cd backend
npm test -- tests/health/health.test.js
```

---

## Interpreting CI Results

### ✅ Success
- All tests passed
- No lint errors (if configured)
- Ready to merge/deploy

### ❌ Failure

#### Common Causes:

**1. Test Failures**
```
FAIL tests/auth/auth.integration.test.js
  ● IT-H1: Should return health status without authentication
    expect(received).toBe(expected)
```

**Solution**:
- Run tests locally: `npm test`
- Fix failing test
- Commit and push fix

**2. Dependency Installation Errors**
```
npm ERR! code ERESOLVE
npm ERR! ERESOLVE unable to resolve dependency tree
```

**Solution**:
- Check `package.json` and `package-lock.json` are in sync
- Delete `package-lock.json` and run `npm install` locally
- Commit updated `package-lock.json`

**3. Timeout Errors**
```
The job running on runner GitHub Actions X has exceeded the maximum execution time of 10 minutes.
```

**Solution**:
- Check for hanging tests (missing timeouts)
- Review test that takes too long
- Consider increasing timeout in workflow (if justified)

**4. Environment Variable Issues**
```
TypeError: Cannot read properties of undefined (reading 'SUPABASE_URL')
```

**Solution**:
- Ensure test uses mocks, not real environment variables
- Check that workflow sets required mock env vars
- Update workflow file if new env vars are needed

**5. Node Version Mismatch**
```
Error: The engine "node" is incompatible with this module.
```

**Solution**:
- Check `package.json` `engines` field
- Update workflow to use correct Node version
- Or update `package.json` to support Node 20.x

---

## Workflow Optimization

### Caching
The workflow uses **npm caching** to speed up dependency installation:
- Cache key: Based on `backend/package-lock.json` hash
- Cache hit: ~30 seconds saved per run
- Cache miss: Full `npm ci` runs (~2-3 minutes)

### Concurrency Control
```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

**Benefit**: When you push multiple commits quickly, only the latest run continues. Earlier runs are cancelled automatically.

### Path Filters
```yaml
paths:
  - "backend/**"
  - ".github/workflows/backend-ci.yml"
```

**Benefit**: Workflow only runs when backend code changes. Frontend changes don't trigger backend tests.

---

## GitHub Actions Features

### Status Checks
- ✅ **Required status checks**: Configure in GitHub repo settings
- ✅ **Branch protection**: Prevent merging if tests fail
- ✅ **Pull request checks**: See test results before merging

### Artifacts
- Test coverage reports are uploaded as artifacts
- Retention: 7 days
- Download from Actions tab > Workflow run > Artifacts

### Notifications
- Failed runs trigger GitHub notifications
- Configure email/Slack notifications in repo settings

---

## Troubleshooting

### Workflow Not Running

**Check**:
1. Workflow file is in `.github/workflows/`
2. Workflow syntax is valid (YAML)
3. Branch matches trigger pattern (`main`, `claude/**`)
4. Path filters match changed files

**Debug**:
- Go to Actions tab in GitHub
- Check "All workflows" dropdown
- Look for disabled workflows

### Workflow Failing on CI but Passing Locally

**Common causes**:
1. **Environment differences**:
   - Missing environment variables in workflow
   - Different Node version
   - OS-specific issues (Ubuntu vs macOS/Windows)

2. **Timing/Race conditions**:
   - Tests may be flaky
   - Network timeouts in CI environment
   - Insufficient timeout values

3. **Dependency issues**:
   - `npm ci` uses exact versions from `package-lock.json`
   - `npm install` may install different versions
   - Always use `npm ci` in CI

**Solution**:
```bash
# Reproduce CI environment locally
rm -rf node_modules
npm ci
npm test
```

### Test Coverage Not Uploading

**Check**:
1. Coverage is generated: `npm run test:coverage`
2. Coverage directory exists: `backend/coverage/`
3. Workflow has upload step (it does)

**Debug**:
- Check workflow logs for upload step
- Verify coverage path in workflow matches actual path

---

## Best Practices

### Before Pushing Code

1. **Run tests locally**:
```bash
cd backend && npm test
```

2. **Check for errors**:
```bash
npm run lint  # if configured
```

3. **Review changes**:
```bash
git diff
```

4. **Commit with clear message**:
```bash
git commit -m "fix: resolve auth middleware timeout issue"
```

### When Creating Pull Requests

1. ✅ Ensure all tests pass locally first
2. ✅ Wait for CI to finish before requesting review
3. ✅ Address any CI failures promptly
4. ✅ Include test changes with code changes

### When Tests Fail in CI

1. **Don't ignore failures** - they indicate real issues
2. **Reproduce locally** - run the same test suite
3. **Fix root cause** - don't just skip the test
4. **Push fixes** - CI will re-run automatically

---

## Future Enhancements

### Planned Improvements

- [ ] **Code coverage reporting**: Integrate with Codecov or Coveralls
- [ ] **Performance testing**: Add load tests to CI
- [ ] **Security scanning**: Add Snyk or Dependabot
- [ ] **Deploy previews**: Auto-deploy PR branches to staging
- [ ] **Frontend CI**: Add tests when frontend is ready
- [ ] **E2E tests**: Integration tests across frontend + backend
- [ ] **Docker builds**: Build and test Docker images
- [ ] **Semantic versioning**: Auto-bump version on merge

### Adding New Jobs

To add a new job to the workflow:

1. Edit `.github/workflows/backend-ci.yml`
2. Add new job under `jobs:` section
3. Define steps similar to existing jobs
4. Test with a push to a branch

**Example** (code quality check):
```yaml
code-quality:
  name: Code Quality
  runs-on: ubuntu-latest
  defaults:
    run:
      working-directory: ./backend
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 20.x
    - run: npm ci
    - run: npm run lint
    - run: npm run type-check  # if using TypeScript
```

---

## Related Documentation

- **Health Checks**: `backend/HEALTHCHECKS.md` - Health endpoint configuration
- **Tests**: `backend/TESTS_PERMISSIONS.md` - Test inventory and patterns
- **Security**: `backend/SECURITY_AUDIT.md` - Security hardening
- **Logging**: `backend/LOGGING_AUDIT.md` - Structured logging

---

## GitHub Actions Documentation

- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [Workflow syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)
- [Actions marketplace](https://github.com/marketplace?type=actions)
- [Caching dependencies](https://docs.github.com/en/actions/using-workflows/caching-dependencies-to-speed-up-workflows)

---

## Support

For CI/CD issues:
1. Check workflow logs in Actions tab
2. Run tests locally to reproduce
3. Review this documentation
4. Check GitHub Actions status: https://www.githubstatus.com/

**Common Commands**:
```bash
# Run all tests
cd backend && npm test

# Run specific test file
cd backend && npm test -- tests/health/health.test.js

# Run with coverage
cd backend && npm run test:coverage

# Watch mode for development
cd backend && npm run test:watch

# Clean install (matches CI)
cd backend && rm -rf node_modules && npm ci && npm test
```
