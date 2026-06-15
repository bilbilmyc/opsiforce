import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { Job } from 'bullmq';
import { ProjectPoolService } from './project-pool.service';
import {
  PROJECT_POOL_QUEUE,
  ProjectPoolJob,
  type IntegrityJobData,
  type ProjectPoolJobData,
  type RecycleJobData,
  type ReplenishJobData,
} from './project-pool.types';

@Processor(PROJECT_POOL_QUEUE, { concurrency: 1 })
export class ProjectPoolProcessor extends WorkerHost implements OnApplicationShutdown {
  private readonly logger = new Logger(ProjectPoolProcessor.name);

  constructor(private readonly poolService: ProjectPoolService) {
    super();
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Shutdown signal ${signal ?? ''} received, draining worker...`);
    await this.worker.close();
  }

  async process(job: Job<ProjectPoolJobData>): Promise<void> {
    switch (job.name) {
      case ProjectPoolJob.Replenish:
        return this.poolService.runReplenishJob((job.data as ReplenishJobData).agentId);
      case ProjectPoolJob.Recycle: {
        const data = job.data as RecycleJobData;
        return this.poolService.runRecycleJob(data.projectId, data.reason);
      }
      case ProjectPoolJob.Integrity:
        return this.poolService.runIntegrityJob((job.data as IntegrityJobData).triggeredBy);
      default:
        this.logger.warn(`Unknown job ${job.name}`);
    }
  }
}
