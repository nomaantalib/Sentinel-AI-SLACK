import { db, JiraTicket, ServiceMetrics, Incident } from '../database/mockDb';

export interface RiskBreakdown {
  memoryRisk: number;
  bugRisk: number;
  latencyRisk: number;
  historicalRisk: number;
  totalRisk: number;
  reasons: string[];
}

export class RiskEngine {
  /**
   * Computes a comprehensive risk score and breakdown for a service release
   */
  public static calculateRisk(serviceName: string, isDemoMode: boolean, customIncidents?: any[]): RiskBreakdown {
    let memoryRisk = 0;
    let bugRisk = 0;
    let latencyRisk = 0;
    let historicalRisk = 0;
    const reasons: string[] = [];

    // Get Data from Mock DB
    const metricsMap = db.getPrometheusMetrics();
    const metrics: ServiceMetrics | undefined = metricsMap[serviceName];
    const tickets = db.getJiraTickets().filter(t => t.service === serviceName);
    const incidents = customIncidents !== undefined
      ? customIncidents.filter(i => i.service === serviceName)
      : db.getIncidents().filter(i => i.service === serviceName);

    // 1. Memory and CPU Risk (Max 25 pts)
    if (metrics) {
      const memVal = parseInt(metrics.memoryUsage.replace('%', ''), 10) || 0;
      const cpuVal = parseInt(metrics.cpuUsage.replace('%', ''), 10) || 0;
      
      if (memVal > 85) {
        memoryRisk = 25;
        reasons.push(`Memory usage is critical at ${metrics.memoryUsage}`);
      } else if (memVal > 70) {
        memoryRisk = 15;
        reasons.push(`Memory usage is elevated at ${metrics.memoryUsage}`);
      } else {
        memoryRisk = Math.round((memVal / 100) * 10);
      }

      if (cpuVal > 80 && memoryRisk < 25) {
        memoryRisk = Math.min(25, memoryRisk + 10);
        reasons.push(`CPU usage is high at ${metrics.cpuUsage}`);
      }
    } else {
      // Default fallback if no metrics found
      memoryRisk = isDemoMode ? 18 : 5;
    }

    // 2. Open Bug Risk (Max 25 pts)
    const criticalBugs = tickets.filter(t => t.priority === 'Critical' && t.status !== 'Closed');
    const highBugs = tickets.filter(t => t.priority === 'High' && t.status !== 'Closed');

    if (criticalBugs.length > 0) {
      bugRisk = 25;
      reasons.push(`Critical Open Jira bug exists: "${criticalBugs[0].summary}"`);
    } else if (highBugs.length > 0) {
      bugRisk = 18;
      reasons.push(`High priority Open Jira bugs exist (${highBugs.length} detected)`);
    } else if (tickets.length > 0) {
      bugRisk = Math.min(10, tickets.length * 4);
      reasons.push(`${tickets.length} open bugs associated with this service`);
    } else {
      bugRisk = 0;
    }

    // 3. Latency & Network Risk (Max 25 pts)
    if (metrics) {
      const latencyMs = parseInt(metrics.latency.replace('ms', ''), 10) || 0;
      const errorRateVal = parseFloat(metrics.errorRate.replace('%', '')) || 0;

      if (latencyMs > 200) {
        latencyRisk = 15;
        reasons.push(`High response latency detected: ${metrics.latency}`);
      } else if (latencyMs > 100) {
        latencyRisk = 8;
      }

      if (errorRateVal > 0.1) {
        latencyRisk = Math.min(25, latencyRisk + 10);
        reasons.push(`Active network error rate elevated: ${metrics.errorRate}`);
      }
    } else {
      latencyRisk = isDemoMode ? 15 : 5;
    }

    // 4. Historical Incident Similarity Risk (Max 25 pts)
    if (incidents.length > 0) {
      const recentIncident = incidents[0];
      historicalRisk = 20;
      reasons.push(`Similar deployment failed recently: outage on ${new Date(recentIncident.date).toLocaleDateString()} due to ${recentIncident.rootCause}`);
    } else {
      historicalRisk = isDemoMode ? 18 : 5;
    }

    const totalRisk = Math.min(100, memoryRisk + bugRisk + latencyRisk + historicalRisk);

    return {
      memoryRisk,
      bugRisk,
      latencyRisk,
      historicalRisk,
      totalRisk,
      reasons: reasons.length > 0 ? reasons : ['No critical risk elements identified. Release is clean.']
    };
  }
}
