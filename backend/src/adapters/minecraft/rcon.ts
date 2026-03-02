import { docker, gameContainerName } from "../../docker";

/**
 * Execute an RCON command inside the running Minecraft container.
 * Uses dockerode exec API (via the Docker socket) since the itzg/minecraft-server
 * image includes rcon-cli out of the box.
 */
export async function execRconCommand(serverId: string, command: string): Promise<string> {
  const containerName = gameContainerName(serverId);
  const container = docker.getContainer(containerName);

  const exec = await container.exec({
    Cmd: ["rcon-cli", ...command.split(" ")],
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({ Detach: false });

  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];

    stream.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    stream.on("end", () => {
      const raw = Buffer.concat(chunks);
      // Docker multiplexed stream: each frame has an 8-byte header
      // (1 byte stream type, 3 padding, 4 bytes size). Strip headers.
      let output = "";
      let offset = 0;
      while (offset + 8 <= raw.length) {
        const size = raw.readUInt32BE(offset + 4);
        if (offset + 8 + size > raw.length) break;
        output += raw.subarray(offset + 8, offset + 8 + size).toString("utf-8");
        offset += 8 + size;
      }
      // Fallback: if no frames parsed, use raw text (non-TTY mode sometimes skips headers)
      if (!output && raw.length > 0) {
        output = raw.toString("utf-8");
      }
      resolve(output.trim());
    });

    stream.on("error", reject);
  });
}
