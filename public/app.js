document.addEventListener('DOMContentLoaded', () => {

  // -------------------------------------------------------------
  // DOM ELEMENT SELECTORS
  // -------------------------------------------------------------
  const heroSection = document.getElementById('hero-section');
  const appConsole = document.getElementById('app-console');
  const heroLaunchBtn = document.getElementById('hero-launch-btn');
  const navLaunchBtn = document.getElementById('nav-launch-btn');
  const exitConsoleBtn = document.getElementById('exit-console-btn');
  const consoleLogoBack = document.getElementById('console-logo-back');

  const sidebarMenuItems = document.querySelectorAll('.sidebar-menu li');
  const tabPanes = document.querySelectorAll('.tab-pane');

  const modeToggle = document.getElementById('mode-toggle');
  const userApiKeyInput = document.getElementById('user-api-key');
  const modelStatusIndicator = document.getElementById('model-status-indicator');
  const githubRepoGroup = document.getElementById('github-repo-group');

  // Diagnostics DOM
  const diagLastModel = document.getElementById('diag-last-model');
  const diagLastKey = document.getElementById('diag-last-key');

  // Show/Hide GitHub field based on Mode
  function toggleModeFields() {
    const isDemo = modeToggle.checked; // checked = demo, unchecked = live
    if (githubRepoGroup) {
      if (isDemo) {
        githubRepoGroup.classList.add('hidden');
      } else {
        githubRepoGroup.classList.remove('hidden');
      }
    }
  }
  modeToggle?.addEventListener('change', toggleModeFields);
  toggleModeFields(); // Run on startup

  // -------------------------------------------------------------
  // HERO LOG FEED SIMULATOR
  // -------------------------------------------------------------
  const heroLogFeed = document.getElementById('hero-log-feed');
  const sampleLogs = [
    { type: 'info', text: 'github-mcp: PR #182 merged successfully.' },
    { type: 'info', text: 'prometheus-mcp: Service checkout-service telemetry synced.' },
    { type: 'warn', text: 'jira-mcp: Blocker ticket JIRA-102 unresolved.' },
    { type: 'error', text: 'prometheus-mcp: Latency exceeded 200ms threshold.' },
    { type: 'success', text: 'gemini-llm: Analysis generated via gemini-2.5-flash.' },
    { type: 'bold', text: 'SENTINEL: Outage prediction checked (Score: 76%)' }
  ];

  if (heroLogFeed) {
    let logIndex = 0;
    setInterval(() => {
      const log = sampleLogs[logIndex];
      const div = document.createElement('div');
      div.className = `log-line ${log.type}`;
      const time = new Date().toLocaleTimeString();
      div.textContent = `[${time}] ${log.text}`;
      heroLogFeed.appendChild(div);
      heroLogFeed.scrollTop = heroLogFeed.scrollHeight;
      logIndex = (logIndex + 1) % sampleLogs.length;
    }, 4000);
  }

  // -------------------------------------------------------------
  // NAVIGATION & VIEW SWITCHING
  // -------------------------------------------------------------
  function showConsole() {
    heroSection.classList.add('hidden');
    appConsole.classList.remove('hidden');
  }

  function showHero() {
    appConsole.classList.add('hidden');
    heroSection.classList.remove('hidden');
  }

  heroLaunchBtn?.addEventListener('click', showConsole);
  navLaunchBtn?.addEventListener('click', showConsole);
  exitConsoleBtn?.addEventListener('click', showHero);
  consoleLogoBack?.addEventListener('click', showHero);

  // Tab switching inside console
  sidebarMenuItems.forEach(item => {
    item.addEventListener('click', () => {
      // Remove active from menus
      sidebarMenuItems.forEach(menu => menu.classList.remove('active'));
      // Add active to clicked menu
      item.classList.add('active');

      // Hide all panes
      tabPanes.forEach(pane => pane.classList.remove('active'));

      // Show matching pane
      const targetTabId = `tab-${item.getAttribute('data-tab')}`;
      const targetPane = document.getElementById(targetTabId);
      if (targetPane) {
        targetPane.classList.add('active');
      }
    });
  });

  // -------------------------------------------------------------
  // GETTERS FOR DYNAMIC INPUTS
  // -------------------------------------------------------------
  function getMode() {
    return modeToggle.checked ? 'demo' : 'live';
  }

  function getApiKey() {
    return userApiKeyInput.value.trim() || '';
  }

  function updateAiDiagnostics(meta) {
    if (!meta) return;
    if (diagLastModel) diagLastModel.textContent = meta.modelUsed || 'N/A';
    if (diagLastKey) diagLastKey.textContent = meta.keyUsed || 'N/A';
    if (modelStatusIndicator) {
      modelStatusIndicator.textContent = `Gemini: ${meta.modelUsed || 'Active'}`;
    }
  }

  // -------------------------------------------------------------
  // FEATURES INTERACTION
  // -------------------------------------------------------------

  // Feature 1: Pre-Deployment Risk Analyzer
  const analyzeForm = document.getElementById('analyze-form');
  const pipelineLogs = document.getElementById('pipeline-logs');
  const riskBadge = document.getElementById('risk-badge');
  const gaugeCircle = document.getElementById('gauge-circle');
  const gaugeScoreText = document.getElementById('gauge-score-text');
  const gaugeRec = document.getElementById('gauge-recommendation');
  
  const bdMemory = document.getElementById('breakdown-memory');
  const bdBugs = document.getElementById('breakdown-bugs');
  const bdLatency = document.getElementById('breakdown-latency');
  const bdHistory = document.getElementById('breakdown-history');
  
  const riskMarkdownContainer = document.getElementById('risk-ai-markdown');

  analyzeForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const version = document.getElementById('release-version').value.trim();
    const service = document.getElementById('target-service').value;
    const githubRepo = document.getElementById('github-repo').value.trim();
    const mode = getMode();
    const apiKey = getApiKey();

    // Reset results & Start log simulations
    pipelineLogs.innerHTML = '';
    riskMarkdownContainer.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Gathering pipeline telemetries...</p></div>`;
    
    const logSteps = [
      'Initializing pre-deployment scan routine...',
      'github-mcp: Fetching commits and changed files...',
      'jira-mcp: Auditing open bugs and blockers...',
      'prometheus-mcp: Loading system telemetry & cpu/memory loads...',
      'rag-db: Matching deployment blueprints against historical runbooks...',
      'gemini-service: Evaluating risk matrices using Gemini LLM...'
    ];

    for (let i = 0; i < logSteps.length; i++) {
      const line = document.createElement('div');
      line.className = 'log-line info';
      line.textContent = `[${new Date().toLocaleTimeString()}] ${logSteps[i]}`;
      pipelineLogs.appendChild(line);
      pipelineLogs.scrollTop = pipelineLogs.scrollHeight;
      await new Promise(r => setTimeout(r, 600));
    }

    try {
      const response = await fetch('/api/analyze-release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version, service, mode, apiKey, githubRepo })
      });
      const data = await response.json();

      // Render score gauge (radius=50, circumference = 314.16)
      const score = data.riskScore;
      const offset = 314.16 * (1 - score / 100);
      gaugeCircle.style.strokeDashoffset = offset;
      gaugeScoreText.textContent = score;

      // Color coding gauge score
      if (score > 70) {
        gaugeCircle.style.stroke = 'var(--color-red)';
        riskBadge.textContent = 'High Risk';
        riskBadge.className = 'badge badge-red';
        gaugeRec.textContent = 'Delay Deployment';
      } else if (score > 40) {
        gaugeCircle.style.stroke = 'var(--color-yellow)';
        riskBadge.textContent = 'Medium Risk';
        riskBadge.className = 'badge badge-yellow';
        gaugeRec.textContent = 'Canary Split';
      } else {
        gaugeCircle.style.stroke = 'var(--color-green)';
        riskBadge.textContent = 'Low Risk';
        riskBadge.className = 'badge badge-green';
        gaugeRec.textContent = 'Deploy Approved';
      }

      // Fill progress bars (convert value from max 25 to max 100%)
      bdMemory.style.width = `${(data.breakdown.memoryRisk / 25) * 100}%`;
      bdBugs.style.width = `${(data.breakdown.bugRisk / 25) * 100}%`;
      bdLatency.style.width = `${(data.breakdown.latencyRisk / 25) * 100}%`;
      bdHistory.style.width = `${(data.breakdown.historicalRisk / 25) * 100}%`;

      // Render Markdown AI report
      riskMarkdownContainer.innerHTML = parseMarkdown(data.report);
      updateAiDiagnostics(data.aiMeta);

    } catch (err) {
      pipelineLogs.innerHTML += `<div class="log-line error">[ERROR] Failed to fetch risk data: ${err.message}</div>`;
    }
  });

  // Feature 2: Incident Time Machine
  const outageForm = document.getElementById('outage-form');
  const timelineSteps = document.getElementById('incident-steps-timeline');
  const outageMarkdown = document.getElementById('outage-ai-markdown');

  outageForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = document.getElementById('outage-query').value.trim();
    const mode = getMode();
    const apiKey = getApiKey();

    outageMarkdown.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Reconstructing incident logs...</p></div>`;

    try {
      const response = await fetch('/api/explain-outage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, mode, apiKey })
      });
      const data = await response.json();

      // Render step timeline
      timelineSteps.innerHTML = '';
      data.timeline.forEach((step, idx) => {
        const li = document.createElement('li');
        li.className = 'timeline-step completed-step';
        if (step.toLowerCase().includes('started') || step.toLowerCase().includes('completed')) {
          li.className = 'timeline-step completed-step';
        } else if (step.toLowerCase().includes('spike') || step.toLowerCase().includes('exhaustion') || step.toLowerCase().includes('increase')) {
          li.className = 'timeline-step warn-step';
        } else if (step.toLowerCase().includes('failure') || step.toLowerCase().includes('restart')) {
          li.className = 'timeline-step failed-step';
        }

        li.innerHTML = `
          <div class="step-bullet"></div>
          <div class="step-content"><strong>${step.split(' - ')[0] || ''}</strong> ${step.split(' - ')[1] || step}</div>
        `;
        timelineSteps.appendChild(li);
      });

      // Show Markdown Report
      outageMarkdown.innerHTML = parseMarkdown(data.analysis);
      updateAiDiagnostics(data.aiMeta);

    } catch (err) {
      outageMarkdown.innerHTML = `<p class="text-red">Failed to reconstruct outage: ${err.message}</p>`;
    }
  });

  // Feature 3: Release Advisor
  const adviceForm = document.getElementById('advice-form');
  const adviceMarkdown = document.getElementById('advice-ai-markdown');

  adviceForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const service = document.getElementById('advice-service').value;
    const apiKey = getApiKey();

    adviceMarkdown.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Consulting release advisor template...</p></div>`;

    try {
      const response = await fetch('/api/advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service, apiKey })
      });
      // Fallback endpoint mapping if /api/advice vs /api/deployment-advice
      let rawData;
      if (response.ok) {
        rawData = await response.json();
      } else {
        const fallbackRes = await fetch('/api/deployment-advice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ service, apiKey })
        });
        rawData = await fallbackRes.json();
      }

      adviceMarkdown.innerHTML = parseMarkdown(rawData.advice);
      updateAiDiagnostics(rawData.aiMeta);

    } catch (err) {
      adviceMarkdown.innerHTML = `<p class="text-red">Failed to retrieve advice: ${err.message}</p>`;
    }
  });

  // Feature 4: Root Cause Anomaly Scanner
  const investigateForm = document.getElementById('investigate-form');
  const metricCpu = document.getElementById('metric-cpu');
  const metricMem = document.getElementById('metric-mem');
  const metricLatency = document.getElementById('metric-latency');
  const metricError = document.getElementById('metric-error');
  const investigateMarkdown = document.getElementById('investigate-ai-markdown');

  investigateForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const service = document.getElementById('investigate-service').value;
    const apiKey = getApiKey();

    investigateMarkdown.innerHTML = `<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Scanning active anomalies...</p></div>`;

    try {
      const response = await fetch('/api/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service, apiKey })
      });
      const data = await response.json();

      // Render metrics
      if (data.activeMetrics) {
        metricCpu.textContent = data.activeMetrics.cpuUsage;
        metricMem.textContent = data.activeMetrics.memoryUsage;
        metricLatency.textContent = data.activeMetrics.latency;
        metricError.textContent = data.activeMetrics.errorRate;

        // Apply health color classes
        const metricCards = document.querySelectorAll('.telemetry-gauge-card');
        metricCards.forEach(c => {
          c.className = 'telemetry-gauge-card';
          if (data.activeMetrics.status === 'critical') {
            c.classList.add('badge-red');
          } else if (data.activeMetrics.status === 'warning') {
            c.classList.add('badge-yellow');
          } else {
            c.classList.add('badge-green');
          }
        });
      }

      investigateMarkdown.innerHTML = parseMarkdown(data.investigation);
      updateAiDiagnostics(data.aiMeta);

    } catch (err) {
      investigateMarkdown.innerHTML = `<p class="text-red">Failed to complete investigation: ${err.message}</p>`;
    }
  });

  // Feature 5: Slack Workspace Simulator
  const slackForm = document.getElementById('slack-form');
  const slackInput = document.getElementById('slack-input');
  const slackFeed = document.getElementById('slack-feed');
  const commandBadges = document.querySelectorAll('.quick-commands-list button');

  // Badge click fills input
  commandBadges.forEach(b => {
    b.addEventListener('click', () => {
      slackInput.value = b.getAttribute('data-cmd');
      slackInput.focus();
    });
  });

  slackForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const commandText = slackInput.value.trim();
    if (!commandText) return;

    // 1. Render user command in feed
    appendUserSlackMessage(commandText);
    slackInput.value = '';

    // 2. Fetch slack simulator API response
    try {
      const response = await fetch('/api/slack-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandText })
      });
      const data = await response.json();
      
      // Simulate typing delay
      await new Promise(r => setTimeout(r, 800));

      appendBotSlackMessage(data);

    } catch (err) {
      appendBotSlackMessage({
        text: `Error connecting to simulator router: ${err.message}`,
        blocks: []
      });
    }
  });

  function appendUserSlackMessage(text) {
    const div = document.createElement('div');
    div.className = 'slack-message';
    div.innerHTML = `
      <div class="avatar" style="background:#1f75cb;"><i class="fa-solid fa-circle-user"></i></div>
      <div class="message-content">
        <div class="sender-name">Operator <span class="timestamp">${new Date().toLocaleTimeString()}</span></div>
        <div class="message-text"><code>${text}</code></div>
      </div>
    `;
    slackFeed.appendChild(div);
    slackFeed.scrollTop = slackFeed.scrollHeight;
  }

  function appendBotSlackMessage(data) {
    const div = document.createElement('div');
    div.className = 'slack-message';
    
    // Convert Block layout items into clean simulated elements
    let attachmentsHtml = '';
    
    if (data.blocks && data.blocks.length > 0) {
      // Find fields section
      const sectionBlock = data.blocks.find(b => b.type === 'section' && b.fields);
      const riskScoreField = sectionBlock?.fields.find(f => f.text.includes('Risk Score'));
      let riskClass = '';
      if (riskScoreField) {
        const matches = riskScoreField.text.match(/\d+/);
        if (matches && parseInt(matches[0]) > 70) {
          riskClass = 'high-risk';
        } else if (matches && parseInt(matches[0]) > 40) {
          riskClass = 'medium-risk';
        } else {
          riskClass = 'low-risk';
        }
      }

      data.blocks.forEach(block => {
        if (block.type === 'section') {
          if (block.fields) {
            attachmentsHtml += `
              <div class="slack-attachment-card ${riskClass}">
                <div class="slack-attachment-fields">
                  ${block.fields.map(f => `<div class="slack-attachment-field">${f.text.replace(/\*/g, '')}</div>`).join('')}
                </div>
            `;
          } else if (block.text) {
            // If fields are not present, check if it is title or description
            if (block.text.text.includes('Release Analysis') || block.text.text.includes('Incident Time Machine') || block.text.text.includes('Advisor') || block.text.text.includes('Root Cause')) {
              attachmentsHtml += `<div class="slack-attachment-title">${block.text.text.replace(/\*/g, '')}</div>`;
            } else {
              attachmentsHtml += `<div class="message-text">${block.text.text.replace(/\*/g, '').replace(/\n/g, '<br>')}</div>`;
            }
          }
        } else if (block.type === 'actions') {
          attachmentsHtml += `
            <div class="slack-actions">
              ${block.elements.map(el => {
                const isDanger = el.style === 'danger';
                const isPrimary = el.style === 'primary';
                const btnClass = isDanger ? 'btn-slack-danger' : (isPrimary ? 'btn-slack-primary' : '');
                return `<button class="slack-btn ${btnClass}">${el.text.text}</button>`;
              }).join('')}
            </div>
          `;
        }
      });
      
      // Close card tag if fields card was opened
      if (sectionBlock) {
        attachmentsHtml += `</div>`;
      }
    }

    div.innerHTML = `
      <div class="avatar"><i class="fa-solid fa-shield-halved"></i></div>
      <div class="message-content">
        <div class="sender-name">Sentinel AI <span class="app-tag">APP</span> <span class="timestamp">${new Date().toLocaleTimeString()}</span></div>
        <div class="message-text">${data.text}</div>
        ${attachmentsHtml}
      </div>
    `;
    slackFeed.appendChild(div);
    slackFeed.scrollTop = slackFeed.scrollHeight;
  }

  // -------------------------------------------------------------
  // HELPER: BASIC MARKDOWN PARSER
  // -------------------------------------------------------------
  function parseMarkdown(mdText) {
    if (!mdText) return '';
    let html = mdText;

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');

    // Inline Code
    html = html.replace(/`(.*?)`/gim, '<code>$1</code>');

    // Paragraphs
    html = html.replace(/\n\n/g, '<br><br>');

    // Bullet points (lists)
    // Replace lines starting with - or * with <li> tags
    html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>');
    
    // Wrap consecutive list items in <ul>
    // Note: This is a simplified regex parser, fits mock data markdown summaries perfectly
    html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>');
    // Remove duplicate outer tags if any
    html = html.replace(/<\/ul>\s*<ul>/gim, '');

    return html;
  }

  // Fetch fallback credentials from backend config
  async function fetchConfig() {
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        const data = await response.json();
        const display = document.getElementById('fallback-key-display');
        if (display && data.fallbackApiKey) {
          display.textContent = data.fallbackApiKey;
        }
      }
    } catch (err) {
      console.error('Failed to fetch configuration details:', err);
    }
  }
  fetchConfig();
});

