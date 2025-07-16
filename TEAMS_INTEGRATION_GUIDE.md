# 💬 Teams Webhook Integration Guide

## 🚀 Quick Setup

### Step 1: Create Teams Webhook
1. Open your Microsoft Teams channel
2. Click the **"..."** (More options) next to the channel name
3. Select **"Connectors"**
4. Find **"Incoming Webhook"** and click **"Configure"**
5. Give it a name like "PR Manager Bot"
6. Optionally upload a custom image
7. Click **"Create"**
8. **Copy the webhook URL** (starts with `https://outlook.office.com/webhook/...`)

### Step 2: Configure Extension
1. Open PR Manager settings (click extension icon → ⚙️ Settings)
2. Scroll to **"Microsoft Teams Integration"** section
3. Paste your webhook URL in the **"Teams Webhook URL"** field
4. Click **"Test Webhook"** to verify connection
5. Click **"Save Settings"**

### Step 3: Post to Teams
1. Use **"Post to Teams"** button to send filtered PRs directly to your channel
2. The message will include:
   - Total PR count with your current filters applied
   - Repository breakdown
   - Individual PR details with approval counts
   - Direct links to view PRs on GitHub

## 🎯 Features

### ✅ What Gets Posted:
- **Filtered PR List**: Only PRs matching your current filters
  - Less than 2 approvals (if enabled)
  - Not approved by you (if enabled)  
  - Excludes WIP PRs (if enabled)
- **Rich Formatting**: Adaptive Cards with clickable links
- **Repository Grouping**: PRs organized by repository
- **Approval Status**: Shows current approval count (e.g., "1/2 ✅")
- **Direct Links**: Click to open PRs directly in GitHub

### 🧪 Test Functionality:
- **Test Webhook**: Sends a simple test message to verify connectivity
- **Error Handling**: Clear error messages if webhook URL is invalid
- **Success Feedback**: Confirmation when messages are posted successfully

## 🔧 Troubleshooting

### Common Issues:

1. **"Failed to fetch" / "Network error"**: 
   - **Check webhook URL**: Make sure it's complete and starts with `https://`
   - **Verify webhook is active**: Go to Teams → Channel → "..." → Connectors → Manage
   - **Test network connection**: Try accessing the webhook URL in a browser
   - **Check firewall/proxy**: Corporate networks may block webhook requests
   - **Reload extension**: Sometimes Chrome needs to reload the extension for permissions

2. **"Request timed out"**: 
   - **Check internet connection**: Ensure stable network connectivity
   - **Try again**: Teams servers may be temporarily unavailable
   - **Check webhook URL**: Verify it's the correct URL from Teams

3. **"Webhook test failed"**: 
   - **URL validation**: Ensure URL contains "webhook" and starts with "https://"
   - **Copy-paste carefully**: Don't include extra spaces or characters
   - **Create new webhook**: If old webhook expired, create a new one in Teams

4. **"No PRs found"**: 
   - **Check filter settings**: Disable filters temporarily to see all PRs
   - **Verify GitHub token**: Make sure your token has correct permissions
   - **Check repositories**: Ensure repositories are configured and accessible

5. **"GitHub token required"**:
   - **Add token**: Go to GitHub Settings → Developer settings → Personal access tokens
   - **Required scopes**: `repo` and `read:user` permissions needed
   - **Private repos**: Token must have access to private repositories if needed

### Permission Issues:
- **Chrome extension reload**: After updating, reload the extension in chrome://extensions/
- **Manifest permissions**: Extension now includes broader Office 365 domains
- **CORS errors**: Should be resolved with updated manifest permissions

### Webhook URL Format:
```
https://outlook.office.com/webhook/[team-id]/IncomingWebhook/[channel-id]/[token]
```
or
```
https://[tenant].webhook.office.com/webhookb2/[team-id]/IncomingWebhook/[channel-id]/[token]
```

## 💡 Tips

- **Save your webhook URL**: It's stored securely in your extension settings
- **Test first**: Always use "Test Webhook" before posting PR lists
- **Filter before posting**: Use the filtering options to send only relevant PRs
- **Regular updates**: Post updates when PR status changes significantly

## 🔒 Security

- Webhook URLs are stored locally in your browser
- No data is sent to third-party servers (except Teams)
- Only filtered PR data is posted (respects your privacy settings)
- GitHub tokens and webhook URLs are kept separate and secure

---

🎉 **You're all set!** Your PR Manager extension can now post filtered GitHub PRs directly to your Teams channel!
