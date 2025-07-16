#!/usr/bin/env node

// Static server startup script for Firebase App Hosting
// This serves the built React app as static files on port 8080

const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, 'dist', 'public');

// Serve static files from dist/public
app.use(express.static(PUBLIC_DIR));

// Handle client-side routing - always serve index.html for non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Static server running on port ${PORT}`);
  console.log(`Serving files from: ${PUBLIC_DIR}`);
});

// Health check endpoint for Firebase App Hosting
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});