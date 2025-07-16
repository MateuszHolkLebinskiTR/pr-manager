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
    token: '', // Also check for 'token' key for backwards compatibility
    filterByApprovals: false,
    filterByMyApproval: false,
    filterByWip: false
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

// Generate content hash for change detection (same as popup.js)
function generateContentHash(overviewData, totalPRs) {
  const contentString = JSON.stringify({
    totalPRs,
    repos: overviewData.map(repo => ({
      name: repo.repoName,
      count: repo.prs.length,
      prs: repo.prs.map(pr => ({
        id: pr.id,
        title: pr.title,
        user: pr.user.login,
        approvals: pr.approvals,
        html_url: pr.html_url
      }))
    }))
  });
  
  // Simple hash function
  let hash = 0;
  for (let i = 0; i < contentString.length; i++) {
    const char = contentString.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

// Auto-post to Teams when notifications are triggered
async function autoPostToTeamsFromNotification(overviewData, totalPRs) {
  console.log('🚀 Auto-posting to Teams from notification check...');
  
  // Get Teams webhook settings
  const teamsSettings = await new Promise(resolve => {
    chrome.storage.sync.get({
      teamsWebhookUrl: '',
      teamsSenderName: 'PR Manager Bot'
    }, resolve);
  });
  
  if (!teamsSettings.teamsWebhookUrl) {
    console.log('⏭️ No Teams webhook URL configured - skipping auto-post');
    return { success: false, reason: 'No webhook URL configured' };
  }
  
  if (totalPRs === 0) {
    console.log('⏭️ No PRs to post - skipping auto-post');
    return { success: false, reason: 'No PRs found' };
  }
  
  try {
    // Generate content hash to check for changes
    const currentContentHash = generateContentHash(overviewData, totalPRs);
    
    // Check if content has changed since last post
    const { lastTeamsContentHash } = await new Promise(resolve => {
      chrome.storage.sync.get({ lastTeamsContentHash: null }, resolve);
    });
    
    if (lastTeamsContentHash === currentContentHash) {
      console.log('⏭️ No changes detected since last Teams post - skipping to avoid spam');
      return { success: false, reason: 'No changes detected' };
    }
    
    // Create Teams payload
    const teamsCard = {
      "@type": "MessageCard",
      "@context": "https://schema.org/extensions",
      "summary": `GitHub PRs to Review (${totalPRs} total)`,
      "themeColor": "0076D7",
      "title": `📋 GitHub PRs to Review (${totalPRs} total) [notification]`,
      "originator": teamsSettings.teamsSenderName,
      "sections": [{
        "facts": []
      }]
    };
    
    // Add PR facts grouped by repository
    for (const repoData of overviewData) {
      teamsCard.sections[0].facts.push({
        "name": `📁 ${repoData.repoName}`,
        "value": `${repoData.prs.length} PRs`
      });
      
      for (const pr of repoData.prs.slice(0, 5)) { // Limit to 5 PRs per repo for Teams
        const approvalText = pr.approvals !== undefined ? ` (${pr.approvals}/2 ✅)` : '';
        teamsCard.sections[0].facts.push({
          "name": `  ${pr.title.substring(0, 50)}${pr.title.length > 50 ? '...' : ''}`,
          "value": `by @${pr.user.login}${approvalText} - [View PR](${pr.html_url})`
        });
      }
      
      if (repoData.prs.length > 5) {
        teamsCard.sections[0].facts.push({
          "name": "  ...",
          "value": `and ${repoData.prs.length - 5} more PRs`
        });
      }
    }
    
    // Create alternative simple text format for Teams Workflows
    const simplePayload = {
      "text": `📋 **GitHub PRs to Review (${totalPRs} total)** [notification]\n\n` +
             overviewData.map(repoData => 
               `**📁 ${repoData.repoName}** (${repoData.prs.length} PRs)\n` +
               repoData.prs.slice(0, 5).map(pr => {
                 const approvalText = pr.approvals !== undefined ? ` (${pr.approvals}/2 ✅)` : '';
                 return `• [${pr.title.substring(0, 60)}${pr.title.length > 60 ? '...' : ''}](${pr.html_url}) by @${pr.user.login}${approvalText}`;
               }).join('\n') +
               (repoData.prs.length > 5 ? `\n• ...and ${repoData.prs.length - 5} more PRs` : '')
             ).join('\n\n') +
             `\n\n*Posted by ${teamsSettings.teamsSenderName}*`
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    // Try MessageCard format first, then simple text format
    let response;
    try {
      response = await fetch(teamsSettings.teamsWebhookUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'PR-Manager-Extension/0.1.0'
        },
        body: JSON.stringify(teamsCard),
        signal: controller.signal
      });
      
      if (!response.ok) {
        console.log('MessageCard format failed, trying simple text format...');
        response = await fetch(teamsSettings.teamsWebhookUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'PR-Manager-Extension/0.1.0'
          },
          body: JSON.stringify(simplePayload),
          signal: controller.signal
        });
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.log('MessageCard format error, trying simple text format...', error);
        response = await fetch(teamsSettings.teamsWebhookUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'PR-Manager-Extension/0.1.0'
          },
          body: JSON.stringify(simplePayload),
          signal: controller.signal
        });
      } else {
        throw error;
      }
    }
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      // Save the content hash for future comparison
      chrome.storage.sync.set({ lastTeamsContentHash: currentContentHash }, () => {
        console.log('Saved Teams content hash for change detection');
      });
      
      console.log(`🎉 Successfully auto-posted ${totalPRs} PRs to Teams from notification!`);
      return { success: true, message: `Auto-posted ${totalPRs} PRs to Teams!` };
    } else {
      const responseText = await response.text();
      console.error('Teams auto-posting response error:', responseText);
      throw new Error(`HTTP ${response.status}: ${response.statusText || 'Unknown error'}`);
    }
    
  } catch (error) {
    console.error('Teams auto-posting error:', error);
    
    let errorMessage = 'Unknown error occurred';
    if (error.name === 'AbortError') {
      errorMessage = 'Request timed out (check your network connection)';
    } else if (error.message.includes('Failed to fetch')) {
      errorMessage = 'Network error - check your internet connection and webhook URL';
    } else {
      errorMessage = error.message;
    }
    
    return { success: false, reason: errorMessage };
  }
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
    let allPROverviewData = []; // Collect PR data for Teams auto-posting
    
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
        
        // Apply advanced filtering only if enabled in settings
        let prsNeedingReview = filteredPRs;
        console.log(`Filtering settings: approvals=${settings.filterByApprovals}, myApproval=${settings.filterByMyApproval}, wip=${settings.filterByWip}`);
        
        if (settings.filterByApprovals || settings.filterByMyApproval || settings.filterByWip) {
          prsNeedingReview = [];
          for (const pr of filteredPRs) {
            let includeThisPR = true;
            
            // Check WIP filter first (doesn't require API call)
            if (settings.filterByWip) {
              const isWIP = pr.title.toLowerCase().includes('wip') || 
                            pr.title.toLowerCase().includes('work in progress') ||
                            pr.draft === true;
              if (isWIP) {
                includeThisPR = false;
                console.log(`WIP filter: excluded PR "${pr.title}" (draft: ${pr.draft})`);
              } else {
                console.log(`WIP filter: included PR "${pr.title}" (draft: ${pr.draft})`);
              }
            }
            
            // Skip API call if already filtered out by WIP
            if (!includeThisPR) {
              continue;
            }
            
            try {
              const match = url.match(/github.com\/(.+?)\/(.+?)\/pulls/);
              if (match) {
                const [_, owner, repoName] = match;
                const reviewsRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/pulls/${pr.number}/reviews`, {
                  headers: { Authorization: `token ${settings.githubToken}` }
                });
                if (reviewsRes.ok) {
                  const reviews = await reviewsRes.json();
                  
                  // Count total approvals
                  const approvals = reviews.filter(review => review.state === 'APPROVED');
                  pr.approvals = approvals.length;
                  
                  // Check if current user has approved
                  const userHasApproved = approvals.some(review => 
                    review.user.login === user.login
                  );
                  
                  // Apply filtering based on settings (continue from WIP check above)
                  if (settings.filterByApprovals && pr.approvals >= 2) {
                    includeThisPR = false; // Exclude PRs with 2+ approvals
                  }
                  
                  if (settings.filterByMyApproval && userHasApproved) {
                    includeThisPR = false; // Exclude PRs already approved by user
                  }
                  
                  if (includeThisPR) {
                    prsNeedingReview.push(pr);
                  }
                }
              }
            } catch (e) {
              console.warn('Failed to fetch reviews for PR', pr.number, e);
              // If we can't fetch reviews, include the PR to be safe
              prsNeedingReview.push(pr);
            }
          }
        }
        
        // Count filtered PRs for badge (only those needing review)
        console.log(`Repository ${url}: ${filteredPRs.length} total PRs, ${prsNeedingReview.length} after filtering`);
        totalPending += prsNeedingReview.length;
        
        // Collect PR data for Teams auto-posting
        if (prsNeedingReview.length > 0) {
          const repoMatch = url.match(/github\.com\/(.+?)\/(.+?)\/pulls/);
          const displayName = repoMatch ? `${repoMatch[1]}/${repoMatch[2]}` : url;
          allPROverviewData.push({
            repoName: displayName,
            prs: prsNeedingReview,
            trackedUsers: repo.trackedUsers || []
          });
        }
        
        // Show notification about filtered PRs
        if (prsNeedingReview.length > 0) {
          const repoName = url.split('/').slice(-3, -1).join('/');
          const userFilter = repo.trackedUsers && repo.trackedUsers.length > 0 
            ? ` from tracked users` 
            : '';
          
          // Create notification message based on filtering settings
          let notificationMessage = `Found ${prsNeedingReview.length} open PRs${userFilter} in ${repoName}`;
          let notificationTitle = `PR Manager: ${prsNeedingReview.length} Open PRs`;
          
          if (settings.filterByApprovals || settings.filterByMyApproval) {
            notificationTitle = `PR Manager: ${prsNeedingReview.length} PRs Need Review`;
            const filterParts = [];
            if (settings.filterByApprovals) filterParts.push('<3 approvals');
            if (settings.filterByMyApproval) filterParts.push('not approved by you');
            notificationMessage = `Found ${prsNeedingReview.length} PRs needing review${userFilter} in ${repoName} (${filterParts.join(' & ')})`;
          }
          
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icon-128.png',
            title: notificationTitle,
            message: notificationMessage,
            priority: 1,
            isClickable: true
          }, (notificationId) => {
            chrome.storage.local.set({ [notificationId]: url });
          });
        }
        
        // Original logic for review requests (still useful for personal review notifications)
        const reviewRequests = prsNeedingReview.filter(pr => {
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
      
      // Auto-post to Teams with collected PR data (respects duplicate detection)
      if (allPROverviewData.length > 0 && totalPending > 0) {
        console.log(`🚀 Triggering Teams auto-post from notification check with ${totalPending} total PRs`);
        const teamsResult = await autoPostToTeamsFromNotification(allPROverviewData, totalPending);
        if (teamsResult.success) {
          console.log('✅ Teams auto-post successful:', teamsResult.message);
        } else {
          console.log('⏭️ Teams auto-post skipped:', teamsResult.reason);
        }
      }
      
      // Update badge count with filtered total
      console.log(`Setting badge count to: ${totalPending} (filtered from all PRs across repositories)`);
      console.log(`Filter settings used: approvals=${settings.filterByApprovals}, myApproval=${settings.filterByMyApproval}, wip=${settings.filterByWip}`);
      console.log(`Total pending PRs across all repositories: ${totalPending}`);
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
    console.log('Settings updated, recreating alarm and triggering check');
    getNotificationSettings((settings) => {
      chrome.alarms.clear('checkPRs');
      chrome.alarms.create('checkPRs', { periodInMinutes: settings.interval });
      // Also trigger immediate check to update badge with new filter settings
      setTimeout(() => {
        checkPRsAndNotify();
      }, 1000);
    });
  } else if (message.type === 'check-now') {
    console.log('Manual check requested');
    checkPRsAndNotify();
    sendResponse({ success: true });
  } else if (message.type === 'update-badge') {
    console.log('Badge update requested with count:', message.count);
    const count = message.count || 0;
    console.log(`Total pending PRs across all repositories: ${count}`);
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
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
