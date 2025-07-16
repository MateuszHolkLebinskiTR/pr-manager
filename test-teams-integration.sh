#!/bin/bash

# Teams Integration Test Script

echo "💬 Testing Teams Webhook Integration"
echo "===================================="

echo ""
echo "📝 Setup Instructions:"
echo "1. Go to your Teams channel"
echo "2. Click '...' → Connectors → Incoming Webhook"
echo "3. Name it 'PR Manager Bot' and click Create"
echo "4. Copy the webhook URL (starts with https://outlook.office.com/webhook/...)"
echo ""

echo "🧪 Testing Steps:"
echo "1. Load the extension in Chrome (chrome://extensions/)"
echo "2. Open Options page (click extension icon → ⚙️ Settings)"
echo "3. Scroll to 'Microsoft Teams Integration' section"
echo "4. Paste your webhook URL in the 'Teams Webhook URL' field"
echo "5. Click 'Test Webhook' to verify connection"
echo "6. Click 'Save Settings' to store the webhook URL"
echo "7. Click 'Post to Teams' to send filtered PR list"
echo ""

echo "✅ Expected Results:"
echo "- Test webhook: Simple test message appears in Teams channel"
echo "- Post to Teams: Rich card with filtered PRs appears in Teams channel"
echo "- Message includes: repository names, PR titles, approval counts, GitHub links"
echo "- Only shows PRs matching your current filter settings"
echo ""

echo "🐛 Troubleshooting:"
echo "- If 'Failed to fetch': Check webhook URL is complete and valid"
echo "- If 'Request timed out': Check internet connection, try again"
echo "- If 'Network error': Verify webhook URL and network connectivity"
echo "- If permission errors: Verify webhook is still active in Teams"
echo "- If no PRs appear: Check your filter settings and GitHub token"
echo "- Try reloading the extension in chrome://extensions/"
echo ""

echo "🔧 Fixed Issues:"
echo "- ✅ generatePROverview function now available in options.js"
echo "- ✅ Teams posting respects all active filters"
echo "- ✅ Rich Adaptive Card formatting with clickable links"
echo "- ✅ Improved error handling with specific error messages"
echo "- ✅ Request timeout protection (10-15 seconds)"
echo "- ✅ URL validation before sending requests"
echo "- ✅ Enhanced manifest permissions for Office 365 domains"
echo ""

echo "🎉 Teams integration is ready for testing!"
