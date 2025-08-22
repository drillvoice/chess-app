# Pre-commit hook to validate code quality
Write-Host "🔍 Running pre-commit validation..." -ForegroundColor Cyan

# Run TypeScript type checking
Write-Host "📝 Checking TypeScript types..." -ForegroundColor Yellow
npm run type-check
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ TypeScript errors found. Please fix them before committing." -ForegroundColor Red
    exit 1
}

# Run ESLint
Write-Host "🔧 Running ESLint..." -ForegroundColor Yellow
npm run lint
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ ESLint errors found. Please fix them before committing." -ForegroundColor Red
    exit 1
}

# Run tests
Write-Host "🧪 Running tests..." -ForegroundColor Yellow
npm run test
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Tests failed. Please fix them before committing." -ForegroundColor Red
    exit 1
}

Write-Host "✅ All validation checks passed!" -ForegroundColor Green
exit 0
