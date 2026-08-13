import { installE2eEnvironment } from './e2e-environment';
import { approvedE2eStorageRoot } from './e2e-safety';

const environment = installE2eEnvironment();
approvedE2eStorageRoot(environment.PRIVATE_STORAGE_ROOT);
