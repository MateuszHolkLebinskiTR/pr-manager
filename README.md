# PR Manager Chrome Extension 🔄

A modern Chrome extension for managing GitHub Pull Request notifications with advanced repository and user tracking features. Built with Bootstrap 4 for a beautiful, responsive UI.

## ✨ Features

### 🔍 Advanced PR Filtering (Optional)
- **Popup quick filters**: Toggle filters directly in the popup without going to settings
- **Collapsible interface**: Quick Filters and PR Overview sections can be collapsed to save space
- **Configurable approval filtering**: Optional setting to only show PRs with less than 2 approvals
- **Personal approval filtering**: Optional setting to hide PRs you've already approved
- **Flexible combinations**: Enable one filter, both filters, or neither based on your needs
- **Review count display**: Shows approval counts (e.g., "2/3 ✅") when filtering is enabled
- **Consistent filtering**: Applied across badge count, popup, notifications, and overview
- **Instant feedback**: Filters apply immediately when changed in popup

### 🔔 Smart Notifications
- Customizable notification intervals (1-240 minutes)
- Working hours support (only notify during specified hours)
- Custom notification messages
- Notification history tracking

### 👥 Advanced User Tracking
- **Per-repository user tracking**: Specify which GitHub users to track for each repository
- **Filtered notifications**: Only get notified about PRs from users you care about
- **User badges**: Visual indicators showing tracked users for each repository
- **Dynamic user management**: Add/remove tracked users per repository

### 📋 Repository Management
- Modern card-based repository interface
- Easy repository addition and removal
- Visual repository overview with PR counts
- Support for multiple repositories

### 💬 Teams Integration
- Generate Microsoft Teams messages
- Preview Teams messages before sending
- Copy formatted messages to clipboard
- Export/import repository configurations

### 🎨 Modern UI with Bootstrap 4
- **Responsive design** that works on all screen sizes
- **Professional styling** with Bootstrap 4 components
- **Intuitive interface** with cards, forms, and buttons
- **Consistent theming** across all extension pages
- **Dark mode support** for comfortable viewing

## 🚀 Installation

1. **Download the extension**:
   - Clone this repository or download as ZIP
   - Extract to your desired location

2. **Build the extension**:
   ```bash
   npm install
   npm run build
   ```

3. **Load in Chrome**:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right toggle)
   - Click "Load unpacked" and select the `public` folder

## ⚙️ Setup

### GitHub Token Configuration
1. Go to [GitHub Settings > Personal Access Tokens](https://github.com/settings/tokens)
2. Generate a new token with these scopes:
   - `repo` (Full control of private repositories)
   - `read:user` (Read user profile data)
3. Copy the token and paste it in the extension settings

### Repository Setup
1. Click the extension icon and select "Settings"
2. In the Repository Management section, click "Add Repository"
3. Enter the GitHub repository URL (e.g., `https://github.com/owner/repo/pulls`)
4. Add GitHub usernames to track for each repository
5. Save your settings

### Optional Advanced Filtering
1. In the extension settings, scroll to "🔍 Advanced PR Filtering"
2. Enable either or both filtering options:
   - **"Only show PRs with less than 2 approvals"** - Hides PRs that already have 2+ approvals
   - **"Hide PRs I've already approved"** - Excludes PRs you've already reviewed
3. Save your settings to apply the filters across all extension features

## 🎯 Usage

### Basic Usage
1. **Add repositories** you want to monitor
2. **Configure tracked users** for each repository
3. **Set notification preferences** (interval, working hours, etc.)
4. The extension will automatically check for new PRs and notify you

### Advanced Features
- **PR Overview**: Click "Show PR Overview" to see all pending PRs in a formatted view
- **Teams Messages**: Generate formatted messages for Microsoft Teams
- **Export/Import**: Backup and restore your repository configurations
- **Notification History**: Review past notifications

### PR Filtering Logic (Optional)
The extension now supports optional advanced filtering that can be enabled in settings:

**Filter Option 1: Approval Count Filter**
- When enabled: Only shows PRs with < 3 approvals
- When disabled: Shows all PRs regardless of approval count

**Filter Option 2: My Approval Filter**
- When enabled: Hides PRs you've already approved
- When disabled: Shows all PRs regardless of your approval status

**How the filters work together:**
- **Both disabled** (default): Shows all PRs from tracked users
- **One enabled**: Applies only that specific filter
- **Both enabled**: PRs must pass both filters (AND logic)

**Where filtering is applied:**
- Extension badge count
- Popup PR list and counts
- Desktop notifications
- PR overview and Teams messages

**Quick Filter Access:**
- **Popup Filters**: Toggle filters directly in the extension popup
- **Settings Page**: Configure filters in the extension settings (synced with popup)
- **Instant Updates**: Changes apply immediately when toggled in popup
- **Auto-Sync**: Popup checkboxes stay in sync with settings page

This gives you complete control over which PRs you want to see based on your workflow preferences.

## 🎨 Bootstrap 4 UI

The extension uses Bootstrap 4 for a modern, professional interface:

### Components Used
- **Cards**: For organized content sections
- **Forms**: Bootstrap form controls and validation
- **Buttons**: Various button styles (primary, secondary, outline)
- **Alerts**: Status messages and notifications
- **Input Groups**: Enhanced form inputs
- **Badges**: User tags and counters
- **List Groups**: Notification history
- **Grid System**: Responsive layouts

### Custom Styling
- `src/bootstrap-custom.css`: Custom styles that complement Bootstrap
- Consistent color scheme with CSS custom properties
- Dark mode support
- Smooth animations and transitions
- Custom scrollbars for content areas

## 📁 Project Structure

```
pr-manager/
├── public/
│   ├── background.js      # Chrome extension background script
│   ├── popup.html         # Extension popup UI (Bootstrap 4)
│   ├── popup.js           # Popup functionality
│   ├── options.html       # Settings page UI (Bootstrap 4)
│   ├── options.js         # Settings functionality
│   ├── manifest.json      # Extension manifest
│   └── icons/             # Extension icons
├── src/
│   ├── bootstrap-custom.css # Custom Bootstrap styles
│   └── style.css          # Legacy styles (kept for reference)
├── bootstrap-demo.html    # UI component demonstration
└── README.md             # This file
```

## 🔧 Technical Details

### Chrome Extension APIs Used
- `chrome.storage.sync`: User settings and repository configuration
- `chrome.storage.local`: Notification history and cache
- `chrome.alarms`: Scheduled PR checking
- `chrome.notifications`: Desktop notifications
- `chrome.runtime`: Background script communication

### GitHub API Integration
- Uses GitHub REST API v3
- Requires personal access token
- Fetches PR data and user information
- Handles rate limiting and error responses

### Bootstrap 4 Integration
- CDN-based Bootstrap 4.5.2
- Custom CSS for extension-specific styling
- Responsive design principles
- Accessibility-friendly components

## 🏗️ Development

### Building
```bash
npm install
npm run build
```

### Testing
```bash
npm test
```

### Development Mode
```bash
npm run dev
```

### UI Development
Open `bootstrap-demo.html` in your browser to preview UI components.

## 📊 Features Comparison

| Feature | Before | After (Bootstrap 4) |
|---------|--------|-------------------|
| **UI Framework** | Custom CSS | Bootstrap 4 |
| **Responsiveness** | Limited | Fully responsive |
| **Components** | Custom | Professional Bootstrap components |
| **Theming** | Basic | Comprehensive with dark mode |
| **Accessibility** | Basic | Enhanced with Bootstrap a11y |
| **Maintainability** | Complex custom CSS | Standardized Bootstrap classes |

## 🔄 Migration Notes

The extension has been fully migrated from custom CSS to Bootstrap 4:

### What Changed
- **HTML Structure**: Updated to use Bootstrap 4 markup
- **CSS Classes**: Replaced custom classes with Bootstrap utilities
- **JavaScript**: Updated to work with Bootstrap components
- **Responsive Design**: Now fully responsive across all screen sizes

### What's Preserved
- **All functionality**: No features were removed
- **User data**: All settings and configurations remain intact
- **Chrome extension APIs**: All background functionality unchanged

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🎯 Future Enhancements

- [ ] Bootstrap 5 migration
- [ ] More GitHub integrations (Issues, Projects)
- [ ] Slack integration
- [ ] Custom themes
- [ ] Advanced filtering options
- [ ] PR assignment notifications
- [ ] Integration with CI/CD status

---

**Made with ❤️ and Bootstrap 4**
