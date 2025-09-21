#!/bin/bash

# Justice Redacted - Netlify Deployment Setup Script
# This script helps set up the project for Netlify deployment

echo "🚀 Justice Redacted - Netlify Deployment Setup"
echo "=============================================="

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📦 Initializing Git repository..."
    git init
    git add .
    git commit -m "Initial commit: Justice Redacted application"
    echo "✅ Git repository initialized"
else
    echo "✅ Git repository already exists"
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ .env file created from template"
    echo "⚠️  Please edit .env file with your actual API keys"
else
    echo "✅ .env file already exists"
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi

# Test build
echo "🔨 Testing build..."
if npm run build; then
    echo "✅ Build successful"
else
    echo "❌ Build failed - please check your configuration"
    exit 1
fi

echo ""
echo "🎉 Setup complete! Next steps:"
echo "1. Edit .env file with your API keys"
echo "2. Create a GitHub repository"
echo "3. Push your code to GitHub"
echo "4. Connect to Netlify and deploy"
echo ""
echo "📖 See DEPLOYMENT.md for detailed instructions"
