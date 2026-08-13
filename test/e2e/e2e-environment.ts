import {
  type EnvironmentVariables,
  validateEnvironment,
} from '../../src/config/environment.validation';
import { assertApprovedE2eDatabaseConfiguration } from './e2e-safety';

export function loadE2eEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): EnvironmentVariables {
  const validatedEnvironment = validateEnvironment(environment);
  assertApprovedE2eDatabaseConfiguration(validatedEnvironment);

  return validatedEnvironment;
}

export function installE2eEnvironment(): EnvironmentVariables {
  const environment = loadE2eEnvironment();

  for (const [name, value] of Object.entries(environment)) {
    if (value !== undefined) {
      process.env[name] = String(value);
    }
  }

  return environment;
}
