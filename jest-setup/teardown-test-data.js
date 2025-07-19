import { rmSync } from 'fs';
import { join } from 'path';

const testDataDir = 'test-data';

const teardown = async () => {
  try {
    rmSync(testDataDir, { recursive: true, force: true });
    console.log(`Successfully removed ${testDataDir}`);
  } catch (error) {
    console.error(`Error removing ${testDataDir}:`, error);
  }
};

export default teardown;