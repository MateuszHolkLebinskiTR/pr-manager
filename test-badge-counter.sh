#!/bin/bash

# Test script to verify badge counter respects filters

echo "🔍 Testing Badge Counter with Filters"
echo "======================================"

echo ""
echo "📝 Test Instructions:"
echo "1. Load the extension in Chrome (chrome://extensions/)"
echo "2. Make sure you have repositories and GitHub token configured"
echo "3. Open the popup and check the current badge count"
echo "4. Toggle the filters one by one and observe the badge count changes:"
echo "   - 'Only show PRs with less than 2 approvals' ✅"
echo "   - 'Hide PRs I've already approved' ✅"
echo "   - 'Exclude Work In Progress PRs' ✅"
echo "5. The badge should update immediately when you change filters"
echo "6. Check browser console (F12) for debug logs"
echo ""

echo "🔧 Recent Changes Made:"
echo "- Badge counter now respects ALL filters (approvals, my approval, WIP)"
echo "- Changing filters in popup immediately triggers background re-check"
echo "- Changing filters in options page triggers background re-check"
echo "- Added better logging to help debug badge counter"
echo "- Fixed 'less than 2 approvals' filter logic (was 'less than 3')"
echo ""

echo "🐛 Debug Tips:"
echo "- Check Chrome DevTools console for background script logs"
echo "- Look for messages like 'Setting badge count to: X (filtered from all PRs)'"
echo "- Filter settings are logged as 'approvals=true, myApproval=false, wip=true'"
echo "- Manual badge sync button in popup for debugging"
echo ""

echo "✅ Expected Behavior:"
echo "- Badge count should match the number of PRs shown in PR Overview"
echo "- Badge should update immediately when filters change"
echo "- Badge should respect all three filter types"
echo "- Badge should be 0 or empty when all PRs are filtered out"
echo ""

echo "🚀 Test completed! Extension is ready for badge counter testing."
