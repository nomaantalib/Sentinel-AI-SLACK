import mongoose, { Schema, Document } from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';

// -------------------------------------------------------------
// SCHEMAS & INTERFACES
// -------------------------------------------------------------

export interface IIncident extends Document {
  service: string;
  date: Date;
  severity: string;
  rootCause: string;
  timeline: string[];
  resolution: string;
  similarOutagesCount: number;
}

const IncidentSchema = new Schema<IIncident>({
  service: { type: String, required: true },
  date: { type: Date, required: true, default: Date.now },
  severity: { type: String, required: true },
  rootCause: { type: String, required: true },
  timeline: [{ type: String }],
  resolution: { type: String, default: '' },
  similarOutagesCount: { type: Number, default: 0 }
});

export interface IRelease extends Document {
  version: string;
  riskScore: number;
  prediction: string;
  recommendations: string[];
}

const ReleaseSchema = new Schema<IRelease>({
  version: { type: String, required: true, unique: true },
  riskScore: { type: Number, required: true },
  prediction: { type: String, required: true },
  recommendations: [{ type: String }]
});

export interface IDeployment extends Document {
  service: string;
  version: string;
  deploymentDate: Date;
  status: string;
}

const DeploymentSchema = new Schema<IDeployment>({
  service: { type: String, required: true },
  version: { type: String, required: true },
  deploymentDate: { type: Date, required: true, default: Date.now },
  status: { type: String, required: true }
});

// Models
export const IncidentModel = mongoose.model<IIncident>('Incident', IncidentSchema, 'incidents');
export const ReleaseModel = mongoose.model<IRelease>('Release', ReleaseSchema, 'releases');
export const DeploymentModel = mongoose.model<IDeployment>('Deployment', DeploymentSchema, 'deployment_history');

// Connect to MongoDB Atlas
export async function connectMongo() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.warn('[MongoDB] No MONGO_URI variable detected in env. Falling back to memory mock storage.');
    return false;
  }

  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(uri);
    console.log('[MongoDB] Connected to database cluster successfully.');
    
    // Seed DB if collections are empty
    await seedDatabase();
    return true;
  } catch (error) {
    console.error('[MongoDB] Connection error failed:', error);
    return false;
  }
}

// Seeder script
async function seedDatabase() {
  try {
    const incidentsCount = await IncidentModel.countDocuments();
    const releasesCount = await ReleaseModel.countDocuments();
    const deploymentsCount = await DeploymentModel.countDocuments();

    if (incidentsCount === 0 || releasesCount === 0 || deploymentsCount === 0) {
      console.log('[MongoDB] Empty collections detected, loading seed data from mockData.json...');
      
      const getSeedFile = (): string => {
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
      const seedFile = getSeedFile();
      if (fs.existsSync(seedFile)) {
        const raw = fs.readFileSync(seedFile, 'utf-8');
        const parsed = JSON.parse(raw);

        if (incidentsCount === 0 && parsed.incidents) {
          await IncidentModel.insertMany(parsed.incidents.map((i: any) => ({
            service: i.service,
            date: new Date(i.date),
            severity: i.severity,
            rootCause: i.rootCause,
            timeline: i.timeline,
            resolution: i.resolution,
            similarOutagesCount: i.similarOutagesCount
          })));
          console.log('[MongoDB] Seeding incidents table complete.');
        }

        if (releasesCount === 0 && parsed.releases) {
          await ReleaseModel.insertMany(parsed.releases.map((r: any) => ({
            version: r.version,
            riskScore: r.riskScore,
            prediction: r.prediction,
            recommendations: r.recommendations
          })));
          console.log('[MongoDB] Seeding releases table complete.');
        }

        if (deploymentsCount === 0 && parsed.deploymentHistory) {
          await DeploymentModel.insertMany(parsed.deploymentHistory.map((d: any) => ({
            service: d.service,
            version: d.version,
            deploymentDate: new Date(d.deploymentDate),
            status: d.status
          })));
          console.log('[MongoDB] Seeding deployment history complete.');
        }
      }
    }
  } catch (err) {
    console.error('[MongoDB] Failed seeding databases:', err);
  }
}
