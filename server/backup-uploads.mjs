import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function listFiles(root, directory = root) {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, absolute));
    else if (entry.isFile()) {
      const stat = await fsp.stat(absolute);
      files.push({ path: path.relative(root, absolute).replaceAll("\\", "/"), bytes: stat.size, sha256: await sha256(absolute) });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export async function createUploadBackup({ uploadRoot, backupRoot, now = new Date() }) {
  const source = path.resolve(uploadRoot);
  const backups = path.resolve(backupRoot);
  if (backups === source || backups.startsWith(`${source}${path.sep}`)) throw new Error("Upload backup root must be outside the upload root");
  await fsp.mkdir(source, { recursive: true });
  await fsp.mkdir(backups, { recursive: true });
  const stamp = now.toISOString().replaceAll(":", "-").replace(".", "-");
  const destination = path.join(backups, `uploads-${stamp}`);
  await fsp.cp(source, destination, { recursive: true, errorOnExist: true });
  const files = await listFiles(destination);
  const manifest = {
    createdAt: now.toISOString(),
    source,
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
  };
  await fsp.writeFile(path.join(destination, "backup-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { destination, manifest };
}
