import { useEffect, useState } from "react";
import { api, type PlayersResponse } from "../api";

type Props = {
  serverId: string;
  dockerImage: string;
};

export default function OnlinePlayers({ serverId, dockerImage }: Props) {
  const [data, setData] = useState<PlayersResponse | null>(null);

  const isMinecraft = dockerImage.includes("itzg/minecraft-server");

  useEffect(() => {
    if (!isMinecraft) return;

    let mounted = true;

    function poll() {
      api
        .getPlayers(serverId)
        .then((res) => {
          if (mounted) setData(res);
        })
        .catch(() => {});
    }

    poll();
    const interval = setInterval(poll, 15_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [serverId, isMinecraft]);

  if (!isMinecraft || !data) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-gray-400">
      <span className="font-medium text-gray-300">
        {data.count}/{data.max} Players
      </span>
      {data.online.length > 0 && (
        <div className="flex -space-x-1">
          {data.online.map((name) => (
            <img
              key={name}
              src={`https://mc-heads.net/avatar/${name}/20`}
              alt={name}
              title={name}
              className="w-5 h-5 rounded-sm border border-gray-700"
            />
          ))}
        </div>
      )}
    </div>
  );
}
