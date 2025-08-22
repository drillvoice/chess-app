# Development Guidelines

## Preventing Import Errors

### React Hooks Import Checklist
When adding React hooks to a component, always ensure you import them:

```typescript
// ✅ Correct - All hooks imported
import { useState, useEffect, useCallback, useMemo } from 'react';

// ❌ Incorrect - Missing useEffect import
import { useState } from 'react';
```

### Common React Hooks
Always import these when used:
- `useState` - State management
- `useEffect` - Side effects
- `useCallback` - Memoized callbacks
- `useMemo` - Memoized values
- `useRef` - DOM references
- `useContext` - Context consumption
- `useReducer` - Complex state logic

### Import Validation
Before committing, run:
```bash
npm run validate
```

This will:
1. Check TypeScript types
2. Run ESLint (catches missing imports)
3. Run tests (including import validation)

## Code Quality Checks

### Pre-commit Validation
The project includes automatic validation that runs:
- TypeScript type checking
- ESLint with enhanced import rules
- React hooks validation tests
- Import validation tests

### Manual Validation
You can run validation manually:
```bash
# Full validation
npm run validate

# Individual checks
npm run type-check
npm run lint
npm run test
```

## Common Issues and Solutions

### "useEffect is not defined"
**Cause**: Missing import from React
**Solution**: Add `useEffect` to React imports
```typescript
import { useState, useEffect } from 'react';
```

### "useState is not defined"
**Cause**: Missing import from React
**Solution**: Add `useState` to React imports
```typescript
import { useState } from 'react';
```

### Dynamic Import Failures
**Cause**: Network issues or cache conflicts
**Solution**: The app includes retry logic and error boundaries

## Best Practices

1. **Always import React hooks explicitly**
2. **Use the validation scripts before committing**
3. **Check ESLint output for import warnings**
4. **Run tests locally before pushing**
5. **Use TypeScript strict mode (already enabled)**

## IDE Setup

### VS Code Extensions (Recommended)
- ESLint
- TypeScript and JavaScript Language Features
- Prettier
- Error Lens (shows errors inline)

### Auto-fix on Save
Add to VS Code settings:
```json
{
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## Troubleshooting

### If validation fails:
1. Check the error message
2. Fix the specific issue (usually missing imports)
3. Run validation again
4. Commit only when all checks pass

### If tests fail:
1. Check the test output
2. Look for import-related errors
3. Fix missing imports
4. Re-run tests

## Emergency Override
If you need to commit urgently (not recommended):
```bash
git commit --no-verify
```
But always fix the issues afterward!
