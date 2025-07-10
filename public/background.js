// Background script for PR Manager Chrome Extension
// Handles alarms, notifications, and GitHub API requests

const DEFAULT_INTERVAL_MINUTES = 60;

function getNotificationSettings(cb) {
  chrome.storage.sync.get({
    interval: DEFAULT_INTERVAL_MINUTES,
    prPages: [], // Keep for backward compatibility
    repositories: [], // New repository structure
    customMessage: '',
    workingHours: '09:00-18:00',
    showHistory: false,
    githubToken: '', // Add githubToken to defaults
    token: '' // Also check for 'token' key for backwards compatibility
  }, (settings) => {
    // Use either githubToken or token field
    if (!settings.githubToken && settings.token) {
      settings.githubToken = settings.token;
    }
    cb(settings);
  });
}

function isWithinWorkingHours(workingHours) {
  if (!workingHours || workingHours === '24:00-24:00') return true; // Allow 24/7 mode
  
  try {
    const [start, end] = workingHours.split('-');
    const now = new Date();
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const startTime = new Date(now);
    startTime.setHours(startH, startM, 0, 0);
    const endTime = new Date(now);
    endTime.setHours(endH, endM, 0, 0);
    return now >= startTime && now <= endTime;
  } catch (e) {
    console.warn('Invalid working hours format:', workingHours);
    return true; // Default to allowing notifications
  }
}

async function fetchUser(token) {
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `token ${token}` }
  });
  if (!res.ok) throw new Error('Failed to fetch user');
  return res.json();
}

async function fetchPRsForPage(url, token) {
  // Extract owner/repo from PR listing page URL
  // Example: https://github.com/org/repo/pulls
  const match = url.match(/github.com\/(.+?)\/(.+?)\/pulls/);
  if (!match) return [];
  const [_, owner, repo] = match;
  // Fetch open PRs
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open`, {
    headers: { Authorization: `token ${token}` }
  });
  if (!res.ok) return [];
  return res.json();
}

async function fetchClosedOrMergedPRs(url, token, notifiedPRs) {
  // Extract owner/repo from PR listing page URL
  const match = url.match(/github.com\/(.+?)\/(.+?)\/pulls/);
  if (!match) return [];
  const [_, owner, repo] = match;
  // Fetch recently closed PRs (state=closed, sorted by updated)
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=10`, {
    headers: { Authorization: `token ${token}` }
  });
  if (!res.ok) return [];
  const closedPRs = await res.json();
  // Only notify if not already notified
  return closedPRs.filter(pr => notifiedPRs[pr.id] !== pr.state);
}

async function checkPRsAndNotify() {
  console.log('Checking PRs for notifications...');
  getNotificationSettings(async (settings) => {
    console.log('Settings:', settings);
    
    if (!isWithinWorkingHours(settings.workingHours)) {
      console.log('Outside working hours');
      return;
    }
    
    if (!settings.githubToken) {
      console.log('No GitHub token found');
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon-128.png',
        title: 'PR Manager: Setup Required',
        message: 'Please add your GitHub token in the options page.',
        priority: 2
      });
      return;
    }
    
    let user;
    try {
      user = await fetchUser(settings.githubToken);
      console.log('GitHub user:', user.login);
    } catch (error) {
      console.error('Auth error:', error);
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon-128.png',
        title: 'PR Manager: Auth Error',
        message: 'Failed to authenticate with GitHub. Check your token.',
        priority: 2
      });
      return;
    }
    
    let totalPending = 0;
    let notificationHistory = [];
    
    chrome.storage.local.get({ notifiedPRs: {}, notificationHistory: [] }, async (localData) => {
      const notifiedPRs = localData.notifiedPRs || {};
      notificationHistory = localData.notificationHistory || [];
      
      // Use new repository structure, fallback to old prPages for backward compatibility
      const repositories = settings.repositories && settings.repositories.length > 0 
        ? settings.repositories 
        : settings.prPages.map(url => ({ url, trackedUsers: [] }));
      
      for (const repo of repositories) {
        const url = repo.url;
        console.log('Checking repository:', url);
        const prs = await fetchPRsForPage(url, settings.githubToken);
        console.log(`Found ${prs.length} total PRs for ${url}`);
        
        // Filter PRs by tracked users (if any are specified)
        let filteredPRs = prs;
        if (repo.trackedUsers && repo.trackedUsers.length > 0) {
          filteredPRs = prs.filter(pr => repo.trackedUsers.includes(pr.user.login));
          console.log(`Filtered to ${filteredPRs.length} PRs from tracked users: ${repo.trackedUsers.join(', ')}`);
        }
        
        // Count filtered PRs for badge
        totalPending += filteredPRs.length;
        
        // Show notification about filtered PRs
        if (filteredPRs.length > 0) {
          const repoName = url.split('/').slice(-3, -1).join('/');
          const userFilter = repo.trackedUsers && repo.trackedUsers.length > 0 
            ? ` from tracked users` 
            : '';
          
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon-128.png',
            title: `PR Manager: ${filteredPRs.length} Open PRs`,
            message: `Found ${filteredPRs.length} open PRs${userFilter} in ${repoName}`,
            priority: 1,
            isClickable: true
          }, (notificationId) => {
            chrome.storage.local.set({ [notificationId]: url });
          });
        }
        
        // Original logic for review requests (still useful for personal review notifications)
        const reviewRequests = filteredPRs.filter(pr => {
          if (!pr.requested_reviewers) return false;
          return pr.requested_reviewers.some(r => r.login === user.login);
        });
        
        if (reviewRequests.length > 0) {
          reviewRequests.forEach(pr => {
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icon-128.png',
              title: `PR Review: ${pr.title}`,
              message: `${pr.user.login} | You're requested to review this PR`,
              priority: 2,
              buttons: [{ title: 'Open PR' }],
              isClickable: true
            }, (notificationId) => {
              chrome.storage.local.set({ [notificationId]: pr.html_url });
              notifiedPRs[pr.id] = pr.state;
              if (settings.showHistory) {
                notificationHistory.push({
                  type: 'review-request',
                  prTitle: pr.title,
                  prUrl: pr.html_url,
                  time: new Date().toISOString()
                });
              }
              chrome.storage.local.set({ notifiedPRs, notificationHistory });
            });
          });
        }
        
        // Check for closed/merged PRs (apply same filtering)
        const closedOrMerged = await fetchClosedOrMergedPRs(url, settings.githubToken, notifiedPRs);
        let filteredClosedPRs = closedOrMerged;
        if (repo.trackedUsers && repo.trackedUsers.length > 0) {
          filteredClosedPRs = closedOrMerged.filter(pr => repo.trackedUsers.includes(pr.user.login));
        }
        
        filteredClosedPRs.forEach(pr => {
          const stateMsg = pr.merged_at ? 'merged' : 'closed';
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon-128.png',
            title: `PR ${stateMsg.toUpperCase()}: ${pr.title}`,
            message: `${pr.user.login} | PR was ${stateMsg}`,
            priority: 1,
            isClickable: true
          }, (notificationId) => {
            chrome.storage.local.set({ [notificationId]: pr.html_url });
            notifiedPRs[pr.id] = pr.state;
            if (settings.showHistory) {
              notificationHistory.push({
                type: stateMsg,
                prTitle: pr.title,
                prUrl: pr.html_url,
                time: new Date().toISOString()
              });
            }
            chrome.storage.local.set({ notifiedPRs, notificationHistory });
          });
        });
      }
      
      // Update badge count with filtered total
      console.log(`Setting badge count to: ${totalPending}`);
      chrome.action.setBadgeText({ text: totalPending > 0 ? String(totalPending) : '' });
      chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('PR Manager extension installed/updated');
  getNotificationSettings((settings) => {
    chrome.alarms.create('checkPRs', { periodInMinutes: settings.interval });
    console.log(`Alarm created with interval: ${settings.interval} minutes`);
    // Run initial check after 5 seconds
    setTimeout(() => {
      checkPRsAndNotify();
    }, 5000);
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkPRs') {
    console.log('Alarm triggered: checkPRs');
    checkPRsAndNotify();
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.storage.local.get(notificationId, (data) => {
    if (data[notificationId]) {
      chrome.tabs.create({ url: data[notificationId] });
      chrome.storage.local.remove(notificationId);
    }
  });
});

// Listen for messages from popup/options
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'settings-updated') {
    console.log('Settings updated, recreating alarm');
    getNotificationSettings((settings) => {
      chrome.alarms.clear('checkPRs');
      chrome.alarms.create('checkPRs', { periodInMinutes: settings.interval });
    });
  } else if (message.type === 'check-now') {
    console.log('Manual check requested');
    checkPRsAndNotify();
    sendResponse({ success: true });
  }
});

// Run initial check when extension starts
chrome.runtime.onStartup.addListener(() => {
  console.log('PR Manager extension started');
  setTimeout(() => {
    checkPRsAndNotify();
  }, 2000);
});
