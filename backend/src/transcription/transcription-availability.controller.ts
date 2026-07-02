import { Controller, Get } from '@nestjs/common';
import { TranscriptionAvailabilityService } from './transcription-availability.service';
import { TRANSCRIPTION_LANGUAGES, type TranscriptionLanguage } from './transcription.constants';

@Controller('transcription')
export class TranscriptionAvailabilityController {
  constructor(private readonly availabilityService: TranscriptionAvailabilityService) {}

  @Get('availability')
  async availability(): Promise<{ available: boolean; languages: readonly TranscriptionLanguage[] }> {
    return { available: await this.availabilityService.isAvailable(), languages: TRANSCRIPTION_LANGUAGES };
  }
}
