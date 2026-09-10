import { useEffect, useState } from "react";
import { api, type PlayersResponse } from "../api";
import { Tag } from "./ui";

type Props = {
  serverId: string;
  dockerImage: string;
  joinable?: "starting" | "joinable" | null;
};

/** Quién está dentro ahora mismo. */
export default function OnlinePlayers({ serverId, dockerImage, joinable }: Props) {
  const [data, setData] = useState<PlayersResponse | null>(null);

  // Minecraft pinta avatares (mc-heads los sirve por nombre); Valheim no tiene
  // equivalente, así que los nombres van como etiquetas de texto.
  const isMinecraft = dockerImage?.includes("itzg/minecraft-server") ?? false;
  const isValheim = dockerImage?.includes("valheim-server") ?? false;
  const isSupported = isMinecraft || isValheim;

  // Se consulta salvo que sepamos que el server está arrancando. Antes exigía
  // joinable === "joinable", y ese estado vive en memoria del backend: al
  // reiniciarse (cada deploy) se pierde para los contenedores que ya estaban
  // en marcha, y el contador no volvía a aparecer nunca. El endpoint solo pide
  // que el contenedor corra, que es lo que ya garantiza la tarjeta al pintar
  // este componente; mientras el juego no responda, no se muestra nada.
  const isReady = joinable !== "starting";

  useEffect(() => {
    if (!isSupported || !isReady) return;

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
  }, [serverId, isSupported, isReady]);

  if (!isSupported || !isReady || !data) return null;

  return (
    <div className="flex items-center gap-2.5">
      <span className="label shrink-0">Dentro</span>
      <span className="num shrink-0 text-meta text-ink">
        {/* max 0 = no pudimos leer el máximo (A2S mudo): mejor "3" que "3/0" */}
        {data.max > 0 ? `${data.count}/${data.max}` : data.count}
      </span>
      {data.online.length > 0 &&
        (isMinecraft ? (
          <div className="flex -space-x-1">
            {data.online.map((name) => (
              <img
                key={name}
                src={`https://mc-heads.net/avatar/${name}/20`}
                alt={name}
                title={name}
                className="h-5 w-5 rounded-xs border border-line bg-raised"
              />
            ))}
          </div>
        ) : (
          <div className="flex min-w-0 flex-wrap gap-1">
            {data.online.map((name) => (
              <Tag key={name} title={name}>
                {name}
              </Tag>
            ))}
          </div>
        ))}
    </div>
  );
}
