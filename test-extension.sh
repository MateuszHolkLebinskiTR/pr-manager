#!/bin/bash

# Simple test script for PR Manager extension

echo "🚀 PR Manager Extension Test"
echo "=============================="

echo "1. Make sure you have:"
echo "   - Added your GitHub token in the options page"
echo "   - Added the PR page URL: https://github.com/tr/rcom-arc_insurer-frontend/pulls"
echo "   - Set notification interval to 2 minutes"
echo ""

echo "2. Testing steps:"
echo "   - Load the extension in Chrome (chrome://extensions/)"
echo "   - Enable Developer mode"
echo "   - Click 'Load unpacked' and select this folder"
echo "   - Click on the extension icon and add your PR page"
echo "   - Go to Options and add your GitHub token"
echo "   - Click 'Check Now' in the popup to test immediately"
echo ""

echo "3. If you see issues:"
echo "   - Check Chrome Developer Tools console for errors"
echo "   - Verify your GitHub token has the right permissions"
echo "   - Make sure the PR page URL is correct"
echo ""

echo "4. Expected behavior:"
echo "   - You should see a notification about the 15 open PRs"
echo "   - The extension badge should show the number of pending PRs"
echo "   - Notifications should appear every 2 minutes"
echo ""

echo "✅ Extension has been updated with debugging and fixes!"
