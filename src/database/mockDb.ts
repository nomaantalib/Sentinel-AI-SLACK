import * as fs from 'fs';
import * as path from 'path';

export interface Incident {
  _id: string;
  service: string;
  date: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  rootCause: string;
  timeline: string[];
  resolution: string;
  similarOutagesCount: number;
}

export interface Release {
  _id: string;
  version: string;
  riskScore: number;
  prediction: 'low' | 'medium' | 'high';
  recommendations: string[];
}

export interface DeploymentHistory {
  _id: string;
  service: string;
  version: string;
  deploymentDate: string;
  status: 'success' | 'failed' | 'progressing';
}

export interface JiraTicket {
  id: string;
  summary: string;
  status: string;
  priority: string;
  service: string;
  createdDate: string;
}

export interface ServiceMetrics {
  cpuUsage: string;
  memoryUsage: string;
  errorRate: string;
  latency: string;
  status: 'healthy' | 'warning' | 'critical';
}

export interface Runbook {
  title: string;
  content: string;
  tags: string[];
}

export interface MockDatabaseSchema {
  incidents: Incident[];
  releases: Release[];
  deploymentHistory: DeploymentHistory[];
  jiraTickets: JiraTicket[];
  prometheusMetrics: { [service: string]: ServiceMetrics };
  runbooks: Runbook[];
}

const getDbPath = (): string => {
  const paths = [
    path.join(process.cwd(), 'src', 'database', 'mockData.json'),
    path.join(process.cwd(), 'database', 'mockData.json'),
    path.join(__dirname, 'mockData.json'),
    path.join(__dirname, '..', 'database', 'mockData.json')
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return paths[0];
};
const dbPath = getDbPath();

class MockDatabase {
  private data!: MockDatabaseSchema;

  constructor() {
    this.loadData();
  }

  private loadData() {
    try {
      const fileContent = fs.readFileSync(dbPath, 'utf-8');
      this.data = JSON.parse(fileContent);
    } catch (error) {
      console.error('Failed to load mock database, creating defaults:', error);
      this.data = {
        incidents: [],
        releases: [],
        deploymentHistory: [],
        jiraTickets: [],
        prometheusMetrics: {},
        runbooks: []
      };
    }
  }

  private saveData() {
    try {
      fs.writeFileSync(dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save mock database data:', error);
    }
  }

  public getIncidents(): Incident[] {
    return this.data.incidents;
  }

  public getReleases(): Release[] {
    return this.data.releases;
  }

  public getDeploymentHistory(): DeploymentHistory[] {
    return this.data.deploymentHistory;
  }

  public getJiraTickets(): JiraTicket[] {
    return this.data.jiraTickets;
  }

  public getPrometheusMetrics(): { [service: string]: ServiceMetrics } {
    return this.data.prometheusMetrics;
  }

  public getRunbooks(): Runbook[] {
    return this.data.runbooks;
  }

  public getIncidentById(id: string): Incident | undefined {
    return this.data.incidents.find(inc => inc._id === id);
  }

  public getReleaseByVersion(version: string): Release | undefined {
    return this.data.releases.find(rel => rel.version === version);
  }

  public createRelease(release: Release): Release {
    const existingIndex = this.data.releases.findIndex(r => r.version === release.version);
    if (existingIndex !== -1) {
      this.data.releases[existingIndex] = release;
    } else {
      this.data.releases.push(release);
    }
    this.saveData();
    return release;
  }

  public createDeployment(dep: DeploymentHistory): DeploymentHistory {
    this.data.deploymentHistory.push(dep);
    this.saveData();
    return dep;
  }
}

export const db = new MockDatabase();
