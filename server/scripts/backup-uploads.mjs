import { loadConfig } from "../config.mjs";
import { createUploadBackup } from "../backup-uploads.mjs";

const config=loadConfig();
const result=await createUploadBackup(config);
console.log(`Upload backup created at ${result.destination} (${result.manifest.fileCount} files, ${result.manifest.totalBytes} bytes)`);

