import { gameContainerName } from "../../docker";

/**
 * Execute an RCON command inside the running Minecraft container.
 * Uses `docker exec <container> rcon-cli <command>` since the itzg/minecraft-server
 * image includes rcon-cli out of the box.
 */
export async function execRconCommand(serverId: string, command: string): Promise<string> {
  const containerName = gameContainerName(serverId);

  const proc = Bun.spawn(["docker", "exec", containerName, "rcon-cli", ...command.split(" ")], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`RCON command failed (exit ${exitCode}): ${stderr.trim()}`);
  }

  return output.trim();
}
