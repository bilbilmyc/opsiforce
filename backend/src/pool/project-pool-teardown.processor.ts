import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { Job } from 'bullmq';
import { ProjectPoolService } from './project-pool.service';
import { PROJECT_POOL_TEARDOWN_QUEUE, type TeardownJobData } from './project-pool.types';

@Processor(PROJECT_POOL_TEARDOWN_QUEUE, { concurrency: 3 })
export class ProjectPoolTeardownProcessor extends WorkerHost implements OnApplicationShutdown {
  private readonly logger = new Logger(ProjectPoolTeardownProcessor.name);

  constructor(private readonly poolService: ProjectPoolService) {
    super();
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(`Shutdown signal ${signal ?? ''} received, draining teardown worker...`);
    await this.worker.close();
  }

  async process(job: Job<TeardownJobData>): Promise<void> {
    await this.poolService.runTeardownJob(job.data);
  }
}
