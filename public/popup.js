// Handles popup UI for PR Manager
// Loads PR pages, allows adding/removing, and opens settings

function renderPRList(prPages) {
  const prListDiv = document.getElementById('pr-list');
  prListDiv.innerHTML = '';
  if (!prPages.length) {
    prListDiv.innerHTML = '<p>No PR pages added yet.</p>';
    return;
  }
  chrome.storage.sync.get({ githubToken: '' }, async (settings) => {
    let user = null;
    if (settings.githubToken) {
      try {
        const res = await fetch('https://api.github.com/user', {
          headers: { Authorization: `token ${settings.githubToken}` }
        });
        user = await res.json();
      } catch {}
    }
    prPages.forEach(async (url, idx) => {
      let pendingCount = '';
      if (user && settings.githubToken) {
        const match = url.match(/github.com\/(.+?)\/(.+?)\/pulls/);
        if (match) {
          const [_, owner, repo] = match;
          const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open`, {
            headers: { Authorization: `token ${settings.githubToken}` }
          });
          if (res.ok) {
            const prs = await res.json();
            pendingCount = prs.filter(pr => pr.requested_reviewers && pr.requested_reviewers.some(r => r.login === user.login)).length;
          }
        }
      }
      const div = document.createElement('div');
      div.className = 'pr-page-item';
      div.innerHTML = `
        <span><a href="${url}" target="_blank">${url}</a> ${pendingCount ? `(<b>${pendingCount}</b> pending)` : ''}</span>
        <button data-idx="${idx}" class="remove-pr-page">Remove</button>
      `;
      prListDiv.appendChild(div);
    });
  });
}

function loadPRPages() {
  chrome.storage.sync.get({ prPages: [] }, (data) => {
    renderPRList(data.prPages);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadPRPages();

  document.getElementById('add-pr-page').onclick = () => {
    const url = prompt('Enter GitHub PR listing page URL:');
    if (url && url.startsWith('https://github.com/')) {
      chrome.storage.sync.get({ prPages: [] }, (data) => {
        if (!data.prPages.includes(url)) {
          const updated = [...data.prPages, url];
          chrome.storage.sync.set({ prPages: updated }, loadPRPages);
        }
      });
    }
  };

  document.getElementById('pr-list').onclick = (e) => {
    if (e.target.classList.contains('remove-pr-page')) {
      const idx = parseInt(e.target.getAttribute('data-idx'), 10);
      chrome.storage.sync.get({ prPages: [] }, (data) => {
        const updated = data.prPages.filter((_, i) => i !== idx);
        chrome.storage.sync.set({ prPages: updated }, loadPRPages);
      });
    }
  };

  document.getElementById('open-settings').onclick = () => {
    chrome.runtime.openOptionsPage();
  };
});
