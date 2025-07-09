// Background script for PR Manager Chrome Extension
// Handles alarms, notifications, and GitHub API requests

const DEFAULT_INTERVAL_MINUTES = 60;

function getNotificationSettings(cb) {
  chrome.storage.sync.get({
    interval: DEFAULT_INTERVAL_MINUTES,
    prPages: [],
    customMessage: '',
    workingHours: '09:00-18:00',
    showHistory: false
  }, cb);
}

function isWithinWorkingHours(workingHours) {
  const [start, end] = workingHours.split('-');
  const now = new Date();
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const startTime = new Date(now);
  startTime.setHours(startH, startM, 0, 0);
  const endTime = new Date(now);
  endTime.setHours(endH, endM, 0, 0);
  return now >= startTime && now <= endTime;
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
  getNotificationSettings(async (settings) => {
    if (!isWithinWorkingHours(settings.workingHours)) return;
    if (!settings.githubToken) return;
    let user;
    try {
      user = await fetchUser(settings.githubToken);
    } catch {
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
      for (const url of settings.prPages) {
        const prs = await fetchPRsForPage(url, settings.githubToken);
        const reviewRequests = prs.filter(pr => {
          if (!pr.requested_reviewers) return false;
          return pr.requested_reviewers.some(r => r.login === user.login);
        });
        totalPending += reviewRequests.length;
        if (reviewRequests.length > 0) {
          reviewRequests.forEach(pr => {
            chrome.notifications.create({
              type: 'basic',
              iconUrl: 'icon-128.png',
              title: `PR: ${pr.title}`,
              message: `${pr.user.login} | Pending reviews: ${pr.requested_reviewers.length}`,
              priority: 1,
              buttons: [{ title: 'Open PR' }],
              isClickable: true
            }, (notificationId) => {
              chrome.storage.local.set({ [notificationId]: pr.html_url });
              notifiedPRs[pr.id] = pr.state;
              if (settings.showHistory) {
                notificationHistory.push({
                  type: 'pending',
                  prTitle: pr.title,
                  prUrl: pr.html_url,
                  time: new Date().toISOString()
                });
              }
              chrome.storage.local.set({ notifiedPRs, notificationHistory });
            });
          });
        }
        // Check for closed/merged PRs
        const closedOrMerged = await fetchClosedOrMergedPRs(url, settings.githubToken, notifiedPRs);
        closedOrMerged.forEach(pr => {
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
      // Update badge count
      chrome.action.setBadgeText({ text: totalPending > 0 ? String(totalPending) : '' });
      chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  getNotificationSettings((settings) => {
    chrome.alarms.create('checkPRs', { periodInMinutes: settings.interval });
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkPRs') {
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
  // TODO: Handle messages for PR management, settings, etc.
});
