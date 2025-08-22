#!/bin/bash

# Pre-commit hook to validate code quality
echo "🔍 Running pre-commit validation..."

# Run TypeScript type checking
echo "📝 Checking TypeScript types..."
npm run type-check
if [ $? -ne 0 ]; then
    echo "❌ TypeScript errors found. Please fix them before committing."
    exit 1
fi

# Run ESLint
echo "🔧 Running ESLint..."
npm run lint
if [ $? -ne 0 ]; then
    echo "❌ ESLint errors found. Please fix them before committing."
    exit 1
fi

# Run tests
echo "🧪 Running tests..."
npm run test
if [ $? -ne 0 ]; then
    echo "❌ Tests failed. Please fix them before committing."
    exit 1
fi

echo "✅ All validation checks passed!"
exit 0
