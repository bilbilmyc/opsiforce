import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CephfsDirectoryUsageStrategy } from './cephfs-directory-usage.strategy';
import { DIRECTORY_USAGE_STRATEGY, type DirectoryUsageStrategy } from './directory-usage.strategy';
import { HostPathDirectoryUsageStrategy } from './hostpath-directory-usage.strategy';
import { PlatformStorageController } from './platform-storage.controller';
import { PlatformStorageSnapshotService } from './platform-storage-snapshot.service';
import { PlatformStorageService } from './platform-storage.service';

@Module({
  controllers: [PlatformStorageController],
  providers: [
    PlatformStorageService,
    PlatformStorageSnapshotService,
    {
      provide: DIRECTORY_USAGE_STRATEGY,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): DirectoryUsageStrategy =>
        configService.getOrThrow<'cephfs' | 'hostPath'>('storageType') === 'hostPath'
          ? new HostPathDirectoryUsageStrategy(configService)
          : new CephfsDirectoryUsageStrategy(configService),
    },
  ],
})
export class StorageModule {}
