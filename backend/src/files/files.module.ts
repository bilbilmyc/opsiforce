import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { DownloadController } from './download.controller';
import { ContentController } from './content.controller';
import { ConvertController } from './convert.controller';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { WorkspaceAccessService } from './workspace-access.service';
import { FileConversionService } from './file-conversion.service';
import { GotenbergService } from './gotenberg.service';
import { WorkspaceFileService } from './workspace-file.service';
import { ProjectModule } from '../project/project.module';
import { ProjectEnvironmentModule } from '../project-environment/project-environment.module';

@Module({
  imports: [ProjectModule, ProjectEnvironmentModule],
  controllers: [UploadController, DownloadController, ContentController, ConvertController, FilesController],
  providers: [
    UploadService,
    FilesService,
    WorkspaceAccessService,
    WorkspaceFileService,
    FileConversionService,
    GotenbergService,
  ],
})
export class FilesModule {}
