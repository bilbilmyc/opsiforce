import { createAppQuery } from '~/lib/create-app-query';
import { api } from './client';

const AVAILABILITY_STALE_MS = 5 * 60 * 1000;

export interface TranscriptionAvailability {
  available: boolean;
  languages: string[];
}

export function useTranscriptionAvailability() {
  return createAppQuery(() => ({
    queryKey: ['transcription-availability'],
    queryFn: () => api.get<TranscriptionAvailability>('/transcription/availability'),
    staleTime: AVAILABILITY_STALE_MS,
  }));
}
