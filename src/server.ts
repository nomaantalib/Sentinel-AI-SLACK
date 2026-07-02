import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import mongoose from 'mongoose';
import { db } from './database/mockDb';
import { RiskEngine } from './utils/helpers';
import { GeminiService } from './ai/geminiService';
import { connectMongo, IncidentModel } from './database/mongo';
import { SecurityMasker } from './utils/masking';
import { initSlack } from './slack';

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Slack Bolt integration
initSlack(app);

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Proxy Request & Telemetry Logging Middleware
app.use((req, res, next) => {
  const maskedUrl = SecurityMasker.maskData(req.originalUrl);
  const bodyStr = Object.keys(req.body).length ? JSON.stringify(req.body) : '';
  const maskedBody = SecurityMasker.maskData(bodyStr);
  console.log(`[Sentinel Proxy] ${req.method} ${maskedUrl} ${maskedBody ? `| Payload: ${maskedBody}` : ''}`);
  next();
});

// Serve static files from the frontend build and public fallback
app.use(express.static(path.join(process.cwd(), 'frontend', 'dist')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, '../public'))); // Fallback for tsc dist pathing

// -------------------------------------------------------------
// ENDPOINTS
// -------------------------------------------------------------

/**
 * Endpoint to verify server health
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

/**
 * Endpoint to fetch Prometheus metrics
 */
app.get('/api/metrics', (req, res) => {
  res.json(db.getPrometheusMetrics());
});

/**
 * Endpoint to retrieve system fallback credentials
 */
app.get('/api/config', (req, res) => {
  const rawKey = process.env.FALLBACK_GEMINI_API_KEY || '';
  const masked = rawKey ? `${rawKey.slice(0, 10)}...${rawKey.slice(-4)}` : '';
  res.json({
    fallbackApiKey: masked
  });
});

/**
 * Endpoint to analyze a release
 */
app.post('/api/analyze-release', async (req, res) => {
  const { version, service = 'checkout-service', mode = 'demo', apiKey, githubRepo } = req.body;

  const isDemo = mode === 'demo';
  const selectedService = service || 'checkout-service';

  // 1. Fetch live commits from GitHub if in live mode
  let gitCommitContext = '';
  let fetchedCommitsCount = 0;
  if (!isDemo && githubRepo) {
    try {
      console.log(`[Sentinel Proxy] Querying GitHub API for repository commits: ${githubRepo}`);
      const headers: Record<string, string> = {
        'User-Agent': 'sentinel-ai-devops-guardian'
      };
      if (process.env.GITHUB_TOKEN) {
        headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`;
      } else if (process.env.GITHUB_PAT) {
        headers['Authorization'] = `token ${process.env.GITHUB_PAT}`;
      }

      const gitResponse = await fetch(`https://api.github.com/repos/${githubRepo}/commits`, { headers });
      if (gitResponse.ok) {
        const commits = await gitResponse.json() as any[];
        fetchedCommitsCount = Math.min(commits.length, 5);
        
        let commitDetailsContext = '';
        if (commits.length > 0) {
          const latestSha = commits[0].sha;
          try {
            console.log(`[Sentinel Proxy] Fetching commit details for SHA: ${latestSha}`);
            const commitDetailResponse = await fetch(`https://api.github.com/repos/${githubRepo}/commits/${latestSha}`, { headers });
            if (commitDetailResponse.ok) {
              const detailData = await commitDetailResponse.json() as any;
              const filesSummary = (detailData.files || []).slice(0, 5).map((f: any) => 
                `  - ${f.filename} (+${f.additions}/-${f.deletions}) [Status: ${f.status}]`
              ).join('\n');
              commitDetailsContext = `\nLatest Commit Details (${latestSha.slice(0, 7)}):\n- Author: ${detailData.commit?.author?.name}\n- Date: ${detailData.commit?.author?.date}\n- Files Changed:\n${filesSummary}`;
            }
          } catch (detailErr) {
            console.error('Error fetching commit details:', detailErr);
          }
        }

        const lastCommits = commits.slice(0, 5).map(c => 
          `* Commit by ${c.commit.author?.name || 'author'}: "${c.commit.message}" (Hash: ${c.sha?.slice(0, 7)})`
        ).join('\n');
        gitCommitContext = `\nRecent GitHub commits found in repository "${githubRepo}":\n${lastCommits}\n${commitDetailsContext}`;
      } else {
        // Fallback commits if rate-limited or forbidden
        const fallbackCommits = [
          `* Commit by developer: "refactor: optimize database connection pooling" (Hash: a1b2c3d)`,
          `* Commit by operator: "fix: update checkout-service container memory limits" (Hash: e5f6g7h)`,
          `* Commit by admin: "ci: add sentinel-ai deployment guard step" (Hash: 9j8k7l6)`
        ].join('\n');
        gitCommitContext = `\nRecent GitHub commits found in repository "${githubRepo}" (Rate Limit Fallback):\n${fallbackCommits}`;
        fetchedCommitsCount = 3;
      }
    } catch (err: any) {
      const fallbackCommits = [
        `* Commit by developer: "refactor: optimize database connection pooling" (Hash: a1b2c3d)`,
        `* Commit by operator: "fix: update checkout-service container memory limits" (Hash: e5f6g7h)`,
        `* Commit by admin: "ci: add sentinel-ai deployment guard step" (Hash: 9j8k7l6)`
      ].join('\n');
      gitCommitContext = `\nRecent GitHub commits found in repository "${githubRepo}" (Connection Fallback):\n${fallbackCommits}`;
      fetchedCommitsCount = 3;
    }
  }

  // 2. Fetch incidents from MongoDB if connected to evaluate risk
  let customIncidents: any[] | undefined = undefined;
  const isMongoConnected = mongoose.connection.readyState === 1;
  if (isMongoConnected) {
    try {
      customIncidents = await IncidentModel.find().lean();
    } catch (dbErr) {
      console.error('[Sentinel Risk Engine] Failed to query Mongo incidents for risk engine:', dbErr);
    }
  }

  // 3. Calculate risk score using the risk engine
  const riskAnalysis = RiskEngine.calculateRisk(selectedService, isDemo, customIncidents);

  // 3b. Retrieve and filter matching runbooks (RAG Verification)
  const allRunbooks = db.getRunbooks();
  const matchedRunbooks = allRunbooks.filter(runbook => {
    const serviceLower = selectedService.toLowerCase();
    // Match runbook tags with selected service
    const serviceMatch = runbook.tags.some(tag => serviceLower.includes(tag.toLowerCase()));
    
    // Match runbook tags with words in risk reasons
    const reasonMatch = riskAnalysis.reasons.some(reason => {
      const reasonLower = reason.toLowerCase();
      return runbook.tags.some(tag => reasonLower.includes(tag.toLowerCase()));
    });
    
    return serviceMatch || reasonMatch;
  });

  let runbooksContext = '';
  if (matchedRunbooks.length > 0) {
    runbooksContext = `\nMatched Reference Runbooks for Verification:\n` + matchedRunbooks.map((rb, idx) => 
      `Runbook ${idx + 1}: ${rb.title}\nContent: ${rb.content}\nTags: ${rb.tags.join(', ')}`
    ).join('\n\n');
  } else {
    runbooksContext = `\nNo specific matching incident runbooks were found in the database. Use standard DevOps practices.`;
  }

  // 3c. Draft prompt for Gemini
  const systemPrompt = `You are Sentinel AI, the Predictive DevOps & Deployment Guardian. 
Analyze the release metrics, cross-reference them against any provided reference runbooks, and write a professional, high-impact release risk summary.
Structure your response in markdown format with sections:
- Executive Prediction
- Detailed Risk Breakdown (Memory, Bug, Latency, Historical Outages)
- Runbook & Deployment Verification (Cross-reference and verify current metrics against the matched incident runbooks provided in the context)
- Actionable Recommendation`;

  const userPrompt = `
Analyze release version: ${version} for service: ${selectedService}.${gitCommitContext}
Telemetry and health details:
- Computed Total Risk Score: ${riskAnalysis.totalRisk}%
- Memory Risk Factor: ${riskAnalysis.memoryRisk}/25
- Open Bugs Risk Factor: ${riskAnalysis.bugRisk}/25
- Latency Risk Factor: ${riskAnalysis.latencyRisk}/25
- Historical Outage Similarity: ${riskAnalysis.historicalRisk}/25
- Raw telemetry warnings/flags:
${riskAnalysis.reasons.map(r => `  * ${r}`).join('\n')}

${runbooksContext}

Please generate a deployment guard report based on this telemetry and verify it against the matching runbook guidelines. Explain why the risk score is at ${riskAnalysis.totalRisk}% and outline the best path forward (e.g. Canary strategy, delay deployment, or normal rolling). You MUST explicitly cite specific mitigation steps from the matched runbooks above (e.g. connection pool size parameters, memory profile heapdumps, or Redis maxmemory-policy configuration) if they match the risk reasons.`;

  // 4. Request analysis from Gemini (with fallback handling)
  const aiResult = await GeminiService.generateContent(userPrompt, systemPrompt, apiKey, isDemo);

  res.json({
    version,
    service: selectedService,
    githubRepo: githubRepo || 'N/A',
    commitsCount: fetchedCommitsCount,
    riskScore: riskAnalysis.totalRisk,
    breakdown: {
      memoryRisk: riskAnalysis.memoryRisk,
      bugRisk: riskAnalysis.bugRisk,
      latencyRisk: riskAnalysis.latencyRisk,
      historicalRisk: riskAnalysis.historicalRisk,
      reasons: riskAnalysis.reasons
    },
    report: aiResult.text,
    aiMeta: {
      modelUsed: aiResult.modelUsed,
      keyUsed: aiResult.keyUsed,
      error: aiResult.error
    }
  });
});

/**
 * Endpoint to explain outage (Incident Time Machine)
 */
app.post('/api/explain-outage', async (req, res) => {
  const { query = 'Friday outage', mode = 'demo', apiKey } = req.body;
  const isDemo = mode === 'demo';

  // Retrieve matching incident
  let incidents: any[] = [];
  const isMongoConnected = mongoose.connection.readyState === 1;
  if (isMongoConnected) {
    try {
      incidents = await IncidentModel.find().lean();
    } catch (err) {
      console.error('[Sentinel Explain Outage] MongoDB fetch error:', err);
      incidents = db.getIncidents();
    }
  } else {
    incidents = db.getIncidents();
  }

  const searchIncident = incidents.find(inc => 
    inc.rootCause.toLowerCase().includes(query.toLowerCase()) || 
    inc.service.toLowerCase().includes(query.toLowerCase()) ||
    query.toLowerCase().includes('friday') ||
    query.toLowerCase().includes('outage')
  ) || incidents[0] || { _id: 'mock_empty', service: 'checkout-service', rootCause: 'No incidents recorded yet', timeline: ['No logged events found.'], resolution: 'Configure telemetry logs to start analysis.' };

  const systemPrompt = `You are Sentinel AI Incident Time Machine.
Reconstruct the incident timeline based on historical telemetry.
Create a step-by-step chronology showing the start of deployment, initial degradation, cascading failures, root cause analysis, and resolution.
Format in a beautiful markdown list with clear timestamp logs.`;

  const userPrompt = `
Reconstruct the timeline for incident ID ${searchIncident._id} affecting "${searchIncident.service}".
Historical timeline steps:
${(searchIncident.timeline || []).map((t: any) => `- ${t}`).join('\n')}
Root Cause identified: ${searchIncident.rootCause}
Resolution: ${searchIncident.resolution}

Generate an analytical incident autopsy report explaining the cascading failure chain and recommended safeguards to prevent recurrence.`;

  const aiResult = await GeminiService.generateContent(userPrompt, systemPrompt, apiKey, isDemo);

  res.json({
    incidentId: searchIncident._id,
    service: searchIncident.service,
    rootCause: searchIncident.rootCause,
    timeline: searchIncident.timeline,
    resolution: searchIncident.resolution,
    analysis: aiResult.text,
    aiMeta: {
      modelUsed: aiResult.modelUsed,
      keyUsed: aiResult.keyUsed,
      error: aiResult.error
    }
  });
});

/**
 * Endpoint to get deployment advice
 */
app.post('/api/deployment-advice', async (req, res) => {
  const { service = 'checkout-service', mode = 'demo', apiKey } = req.body;
  const isDemo = mode === 'demo';

  const systemPrompt = `You are Sentinel AI Release Advisor. Provide tactical deployment strategies (e.g. Canary, Blue-Green, Rolling) and safety checks for the specified service. Use tables or lists in markdown to outline traffic split schedules and expected risk reduction percentages.`;
  const userPrompt = `Provide strategic deployment advice for deploying updates to "${service}". The current environment has memory warnings and a history of database connection pool exhaustion. Provide traffic splits (10%, 25%, 50%, 100%) and validation tests.`;

  const aiResult = await GeminiService.generateContent(userPrompt, systemPrompt, apiKey, isDemo);

  res.json({
    service,
    advice: aiResult.text,
    aiMeta: {
      modelUsed: aiResult.modelUsed,
      keyUsed: aiResult.keyUsed,
      error: aiResult.error
    }
  });
});

/**
 * Endpoint to investigate service root causes
 */
app.post('/api/investigate', async (req, res) => {
  const { service = 'checkout-service', mode = 'demo', apiKey } = req.body;
  const isDemo = mode === 'demo';

  const tickets = db.getJiraTickets().filter(t => t.service === service);
  const metrics = db.getPrometheusMetrics()[service];

  const systemPrompt = `You are Sentinel AI Root Cause Investigator. Your task is to diagnose active anomalies in infrastructure and logs, matching them against known incident patterns.`;
  const userPrompt = `
Investigate the active health state of "${service}".
Active Prometheus telemetry:
- CPU: ${metrics?.cpuUsage || 'N/A'}
- Memory: ${metrics?.memoryUsage || 'N/A'}
- Latency: ${metrics?.latency || 'N/A'}
- Error Rate: ${metrics?.errorRate || 'N/A'}

Active Jira Blocker tickets:
${tickets.map(t => `- [${t.id}] ${t.summary} (${t.priority})`).join('\n')}

Identify the root cause probability, provide specific evidence logs, and list previous matching incident files.`;

  const aiResult = await GeminiService.generateContent(userPrompt, systemPrompt, apiKey, isDemo);

  res.json({
    service,
    activeMetrics: metrics,
    investigation: aiResult.text,
    aiMeta: {
      modelUsed: aiResult.modelUsed,
      keyUsed: aiResult.keyUsed,
      error: aiResult.error
    }
  });
});

// -------------------------------------------------------------
// INCIDENT LOG CRUD ENDPOINTS
// -------------------------------------------------------------

/**
 * Fetch all incident logs (MongoDB or fallback local db)
 */
app.get('/api/incidents', async (req, res) => {
  try {
    const isMongoConnected = mongoose.connection.readyState === 1;
    if (isMongoConnected) {
      const incidents = await IncidentModel.find().sort({ date: -1 });
      res.json(incidents);
    } else {
      res.json(db.getIncidents());
    }
  } catch (err: any) {
    console.error('[Sentinel CRUD] Fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Create a new incident log
 */
app.post('/api/incidents', async (req, res) => {
  const { service, severity, rootCause, resolution = '', timeline = [] } = req.body;
  try {
    const isMongoConnected = mongoose.connection.readyState === 1;
    const cleanTimeline = timeline.length ? timeline : [`Incident reported in telemetry log for ${service}.`];
    
    const incidentData = {
      service,
      severity,
      rootCause,
      resolution,
      timeline: cleanTimeline,
      date: new Date()
    };

    if (isMongoConnected) {
      const doc = new IncidentModel(incidentData);
      await doc.save();
      res.json(doc);
    } else {
      const mockId = 'inc_' + Math.random().toString(36).substring(2, 11);
      const mockDoc = {
        _id: mockId,
        ...incidentData,
        date: new Date().toISOString(),
        similarOutagesCount: 0
      };
      db.getIncidents().unshift(mockDoc as any);
      res.json(mockDoc);
    }
  } catch (err: any) {
    console.error('[Sentinel CRUD] Create error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Update an existing incident log
 */
app.put('/api/incidents/:id', async (req, res) => {
  const { id } = req.params;
  const { severity, rootCause, resolution, timeline } = req.body;
  try {
    const isMongoConnected = mongoose.connection.readyState === 1;
    if (isMongoConnected) {
      const doc = await IncidentModel.findByIdAndUpdate(
        id,
        { severity, rootCause, resolution, timeline },
        { new: true }
      );
      res.json(doc);
    } else {
      const incidents = db.getIncidents();
      const idx = incidents.findIndex(i => i._id === id);
      if (idx !== -1) {
        if (severity) incidents[idx].severity = severity;
        if (rootCause) incidents[idx].rootCause = rootCause;
        if (resolution !== undefined) incidents[idx].resolution = resolution;
        if (timeline) incidents[idx].timeline = timeline;
        res.json(incidents[idx]);
      } else {
        res.status(404).json({ error: 'Incident not found' });
      }
    }
  } catch (err: any) {
    console.error('[Sentinel CRUD] Update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Delete an incident log
 */
app.delete('/api/incidents/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const isMongoConnected = mongoose.connection.readyState === 1;
    if (isMongoConnected) {
      if (mongoose.Types.ObjectId.isValid(id)) {
        await IncidentModel.findByIdAndDelete(id);
      } else {
        // Handle mock string IDs if they somehow ended up in Mongo connection context
        await IncidentModel.deleteOne({ _id: id } as any);
      }
      res.json({ success: true, id });
    } else {
      const incidents = db.getIncidents();
      const idx = incidents.findIndex(i => i._id === id);
      if (idx !== -1) {
        incidents.splice(idx, 1);
        res.json({ success: true, id });
      } else {
        res.status(404).json({ error: 'Incident not found' });
      }
    }
  } catch (err: any) {
    console.error('[Sentinel CRUD] Delete error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Endpoint simulating Slack Slash Commands and Slack Block Kit payload formats
 */
app.post('/api/slack-command', (req, res) => {
  const { commandText } = req.body;
  const normalized = commandText.trim().toLowerCase();

  let blocks: any[] = [];
  let responseText = '';

  if (normalized.startsWith('/analyze-release') || normalized.includes('analyze release')) {
    const parts = commandText.split(' ');
    const version = parts[2] || parts[1] || 'v4.2';
    const serviceName = 'checkout-service';
    const riskAnalysis = RiskEngine.calculateRisk(serviceName, true);

    responseText = `Risk assessment report for *${serviceName} ${version}*`;
    blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🔍 *Sentinel AI Release Analysis* for \`${serviceName}\` (\`${version}\`)`
        }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Risk Score:* ${riskAnalysis.totalRisk}%` },
          { type: 'mrkdwn', text: `*Status:* ${riskAnalysis.totalRisk > 70 ? '🚨 HIGH RISK' : '✅ LOW RISK'}` },
          { type: 'mrkdwn', text: `*Memory Risk:* ${riskAnalysis.memoryRisk}/25` },
          { type: 'mrkdwn', text: `*Bug Risk:* ${riskAnalysis.bugRisk}/25` }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `⚠️ *Risk Triggers Found:*\n${riskAnalysis.reasons.map(r => `• ${r}`).join('\n')}`
        }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Delay Deployment 🛑' },
            style: 'danger',
            value: 'delay_deploy'
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Deploy to Canary 🧪' },
            style: 'primary',
            value: 'canary_deploy'
          }
        ]
      }
    ];
  } else if (normalized.startsWith('/explain-outage') || normalized.includes('explain outage')) {
    const incident = db.getIncidents()[0];
    responseText = `Incident autopsy for *${incident.service}*`;
    blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `⏳ *Sentinel AI Incident Time Machine* - Autopsy for \`${incident.service}\``
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Root Cause:* ${incident.rootCause}\n*Resolution:* ${incident.resolution}`
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Timeline History:*\n${incident.timeline.map(t => `• \`${t.split(' - ')[0]}\` - ${t.split(' - ')[1]}`).join('\n')}`
        }
      }
    ];
  } else if (normalized.startsWith('/deployment-advice') || normalized.includes('deployment advice')) {
    responseText = 'Sentinel Deployment Strategy Recommendation';
    blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '💡 *Sentinel AI Intelligent Release Advisor*'
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Recommended Strategy:* Canary Deployment\n*Expected Risk Reduction:* 68%\n\n*Traffic Split Schedule:*\n• Split 1: 10% traffic (observe 10 mins)\n• Split 2: 25% traffic (observe 15 mins)\n• Split 3: 50% traffic (observe 20 mins)\n• Split 4: 100% traffic (full roll)'
        }
      }
    ];
  } else if (normalized.startsWith('/investigate') || normalized.includes('investigate')) {
    const serviceName = 'checkout-service';
    const metrics = db.getPrometheusMetrics()[serviceName];
    responseText = `Root cause investigation diagnostics for *${serviceName}*`;
    blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🛠️ *Sentinel AI Root Cause Analysis* for \`${serviceName}\``
        }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*CPU Usage:* ${metrics.cpuUsage}` },
          { type: 'mrkdwn', text: `*Memory Usage:* ${metrics.memoryUsage}` },
          { type: 'mrkdwn', text: `*Latency:* ${metrics.latency}` },
          { type: 'mrkdwn', text: `*Error Rate:* ${metrics.errorRate}` }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Diagnosis:* Probable database connection pool exhaustion due to open blocking connections and latency spikes. Code matches incident *inc_001*.'
        }
      }
    ];
  } else {
    responseText = 'Unknown command. Available commands: `/analyze-release <version>`, `/explain-outage`, `/deployment-advice`, `/investigate <service>`';
    blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `❌ *Command Not Found*\n\nAvailable commands:\n• \`/analyze-release v4.2\` - Perform risk prediction\n• \`/explain-outage\` - Launch Incident Time Machine\n• \`/deployment-advice\` - Fetch canary templates\n• \`/investigate checkout-service\` - Trigger root cause search`
        }
      }
    ];
  }

  res.json({
    text: responseText,
    blocks: blocks
  });
});

// Serve the console page (React built version or public legacy fallback)
app.get('/console', (req, res) => {
  const reactIndex = path.join(process.cwd(), 'frontend', 'dist', 'index.html');
  if (fs.existsSync(reactIndex)) {
    res.sendFile(reactIndex);
  } else {
    res.sendFile(path.join(process.cwd(), 'public', 'console.html'));
  }
});

// Serve the index/wildcard page (React built version or public legacy fallback)
app.get('*', (req, res) => {
  const reactIndex = path.join(process.cwd(), 'frontend', 'dist', 'index.html');
  if (fs.existsSync(reactIndex)) {
    res.sendFile(reactIndex);
  } else {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
  }
});

// Connect to MongoDB Atlas first, then start server
connectMongo().then(() => {
  app.listen(PORT, () => {
    console.log(`[Sentinel Server] Started on http://localhost:${PORT}`);
  });
});
