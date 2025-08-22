import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Test to validate React imports in components
describe('React Import Validation', () => {
  const clientSrcPath = path.join(process.cwd(), 'client/src');
  
  // Get all TypeScript/TSX files recursively
  function getTsxFiles(dir: string): string[] {
    const files: string[] = [];
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
        files.push(...getTsxFiles(fullPath));
      } else if (item.endsWith('.tsx') || item.endsWith('.ts')) {
        // Exclude test files and non-React files
        if (!item.includes('.test.') && 
            !item.includes('.spec.') && 
            !item.includes('.d.ts') &&
            !item.includes('import-validation.test.ts')) {
          files.push(fullPath);
        }
      }
    }
    
    return files;
  }
  
  // Check if file uses React hooks
  function usesReactHooks(content: string): string[] {
    const hooks = [
      'useState', 'useEffect', 'useCallback', 'useMemo', 
      'useRef', 'useContext', 'useReducer', 'useLayoutEffect',
      'useImperativeHandle', 'useDebugValue', 'useId', 'useTransition',
      'useDeferredValue', 'useSyncExternalStore', 'useInsertionEffect'
    ];
    
    return hooks.filter(hook => content.includes(hook));
  }
  
  // Check if file imports React hooks
  function importsReactHooks(content: string): string[] {
    const importMatch = content.match(/import\s*{([^}]+)}\s*from\s*['"]react['"]/);
    if (!importMatch) return [];
    
    const imports = importMatch[1].split(',').map(imp => imp.trim());
    return imports;
  }
  
  it('should have proper React imports for all components using hooks', () => {
    const tsxFiles = getTsxFiles(clientSrcPath);
    const errors: string[] = [];
    
    for (const file of tsxFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const usedHooks = usesReactHooks(content);
      const importedHooks = importsReactHooks(content);
      
      if (usedHooks.length > 0) {
        const missingHooks = usedHooks.filter(hook => !importedHooks.includes(hook));
        
        if (missingHooks.length > 0) {
          const relativePath = path.relative(process.cwd(), file);
          errors.push(
            `${relativePath}: Missing imports for hooks: ${missingHooks.join(', ')}`
          );
        }
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Missing React imports found:\n${errors.join('\n')}`);
    }
  });
  
  it('should have proper React imports for JSX usage', () => {
    const tsxFiles = getTsxFiles(clientSrcPath);
    const errors: string[] = [];
    
    for (const file of tsxFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      
      // Only check .tsx files for JSX usage
      if (file.endsWith('.tsx')) {
        // Check if file contains JSX (more specific check)
        if (content.includes('<') && (content.includes('return') || content.includes('export'))) {
          // Check for React import (either default or named)
          const hasReactImport = content.includes("import React") || 
                                content.includes("import {") && content.includes("from 'react'") ||
                                content.includes("import {") && content.includes('from "react"');
          
          if (!hasReactImport) {
            const relativePath = path.relative(process.cwd(), file);
            errors.push(`${relativePath}: Missing React import for JSX usage`);
          }
        }
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Missing React imports for JSX found:\n${errors.join('\n')}`);
    }
  });
});
