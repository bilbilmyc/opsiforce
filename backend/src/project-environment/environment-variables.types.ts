export interface EnvironmentVariableEntry {
  key: string;
  value: string;
}

export interface EnvironmentVariablesResponse {
  variables: EnvironmentVariableEntry[];
}

export interface UpdateEnvironmentVariablesDto {
  variables?: Record<string, string>;
  restartApp?: boolean;
}

export type EnvironmentVariablesRestart = 'app' | 'pod' | 'none';

export interface UpdateEnvironmentVariablesResult {
  ok: true;
  restart: EnvironmentVariablesRestart;
}
