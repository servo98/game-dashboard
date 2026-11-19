import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * REGRESIÓN: cada actualización de un servidor dejaba la imagen anterior en el
 * host como <none>. En prod se juntaron 42, casi 8 GB, 32 de ellas versiones de
 * una sola imagen. Y las de servidores borrados no se podían limpiar porque su
 * contenedor parado seguía ahí.
 */

type FakeImage = { Id: string; RepoTags: string[] };

let images: FakeImage[] = [];
let containers: { ImageID: string; Names: string[] }[] = [];
const removed: string[] = [];
let removeError: (Error & { statusCode?: number }) | null = null;
let onPull: (() => void) | null = null;
const containerRemove = vi.fn();

function findImage(ref: string): FakeImage | undefined {
  return images.find((i) => i.Id === ref || i.RepoTags.includes(ref));
}

vi.mock("dockerode", () => ({
  default: class {
    modem = { followProgress: (_s: unknown, cb: (e: Error | null) => void) => cb(null) };
    listContainers() {
      return Promise.resolve(containers);
    }
    getImage(ref: string) {
      return {
        inspect: async () => {
          const img = findImage(ref);
          if (!img) throw Object.assign(new Error("no such image"), { statusCode: 404 });
          return img;
        },
        remove: async () => {
          if (removeError) throw removeError;
          const img = findImage(ref);
          if (!img) throw Object.assign(new Error("no such image"), { statusCode: 404 });
          removed.push(ref);
          if (img.Id === ref || img.RepoTags.length <= 1) {
            images = images.filter((i) => i !== img);
          } else {
            img.RepoTags = img.RepoTags.filter((t) => t !== ref);
          }
        },
      };
    }
    getContainer(name: string) {
      return {
        inspect: async () => {
          const c = containers.find((x) => x.Names.includes(`/${name}`));
          if (!c) throw Object.assign(new Error("no such container"), { statusCode: 404 });
          return { Image: c.ImageID };
        },
        remove: async (opts: unknown) => {
          containerRemove(name, opts);
          containers = containers.filter((x) => !x.Names.includes(`/${name}`));
        },
      };
    }
    pull(_image: string, _opts: unknown, cb: (e: Error | null, s: unknown) => void) {
      onPull?.();
      cb(null, {});
    }
    createContainer({ name, Image }: { name: string; Image: string }) {
      const img = findImage(Image);
      containers.push({ ImageID: img?.Id ?? "", Names: [`/${name}`] });
      return Promise.resolve({ start: () => Promise.resolve() });
    }
  },
}));

vi.mock("./db", () => ({ getPanelSetting: () => "2" }));

const { normalizeImageRef, removeGameContainer, removeImageIfUnused, startGameContainer } =
  await import("./docker");

const OLD = "sha256:old";
const NEW = "sha256:new";

beforeEach(() => {
  images = [];
  containers = [];
  removed.length = 0;
  removeError = null;
  onPull = null;
  containerRemove.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("normalizeImageRef", () => {
  it.each([
    ["itzg/minecraft-server", "itzg/minecraft-server:latest"],
    ["itzg/minecraft-server:java21", "itzg/minecraft-server:java21"],
    ["docker.io/itzg/minecraft-server:java21", "itzg/minecraft-server:java21"],
    ["docker.io/library/nginx", "nginx:latest"],
    ["localhost:5000/img", "localhost:5000/img:latest"],
    ["ghcr.io/servo98/doblaje:latest", "ghcr.io/servo98/doblaje:latest"],
    ["ghcr.io/o/img@sha256:abc", "ghcr.io/o/img@sha256:abc"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeImageRef(input)).toBe(expected);
  });
});

describe("removeImageIfUnused", () => {
  it("borra una imagen que ya nadie usa", async () => {
    images = [{ Id: OLD, RepoTags: [] }];
    expect(await removeImageIfUnused(OLD)).toBe("removed");
    expect(images).toEqual([]);
  });

  it("no la borra si un contenedor la usa, aunque esté parado", async () => {
    images = [{ Id: OLD, RepoTags: ["gameservermanagers/gameserver:pz"] }];
    containers = [{ ImageID: OLD, Names: ["/game-panel-otro"] }];
    expect(await removeImageIfUnused(OLD)).toBe("in-use");
    expect(removed).toEqual([]);
  });

  it("no la borra si es la imagen de otro servidor, aunque no tenga contenedor", async () => {
    images = [{ Id: OLD, RepoTags: ["itzg/minecraft-server:java21"] }];
    // minecraft-cabin: en el panel, pero sin contenedor creado todavía
    expect(await removeImageIfUnused(OLD, ["itzg/minecraft-server:java21"])).toBe("in-use");
    expect(await removeImageIfUnused(OLD, ["docker.io/itzg/minecraft-server:java21"])).toBe(
      "in-use",
    );
    expect(removed).toEqual([]);
  });

  it("con varias etiquetas las quita una a una (por ID Docker exigiría forzar)", async () => {
    images = [{ Id: OLD, RepoTags: ["img:a", "img:b"] }];
    expect(await removeImageIfUnused(OLD)).toBe("removed");
    expect(removed).toEqual(["img:a", "img:b"]);
    expect(images).toEqual([]);
  });

  it("devuelve missing si la imagen no existe", async () => {
    expect(await removeImageIfUnused("sha256:nope")).toBe("missing");
  });

  it("un 409 de Docker es 'en uso', no un fallo", async () => {
    images = [{ Id: OLD, RepoTags: [] }];
    removeError = Object.assign(new Error("conflict"), { statusCode: 409 });
    expect(await removeImageIfUnused(OLD)).toBe("in-use");
  });

  it("otro error se reporta sin lanzar", async () => {
    images = [{ Id: OLD, RepoTags: [] }];
    removeError = Object.assign(new Error("daemon"), { statusCode: 500 });
    expect(await removeImageIfUnused(OLD)).toBe("error");
  });
});

describe("removeGameContainer", () => {
  it("quita el contenedor y dice con qué imagen se creó", async () => {
    containers = [{ ImageID: OLD, Names: ["/game-panel-pz"] }];
    expect(await removeGameContainer("pz")).toEqual({ removed: true, imageId: OLD });
    expect(containerRemove).toHaveBeenCalledWith("game-panel-pz", { force: true, v: true });
    expect(containers).toEqual([]);
  });

  it("si no hay contenedor no hace nada", async () => {
    expect(await removeGameContainer("pz")).toEqual({ removed: false, imageId: null });
    expect(containerRemove).not.toHaveBeenCalled();
  });
});

describe("startGameContainer: limpieza de la imagen anterior", () => {
  const TAG = "ghcr.io/servo98/doblaje:latest";
  const start = (opts?: { keepImageRefs?: string[] }) =>
    startGameContainer("doblaje", TAG, 3400, {}, {}, 2, opts);

  /** El pull trae una versión nueva: la etiqueta pasa a ella y la vieja queda <none>. */
  function pullBringsNewVersion() {
    onPull = () => {
      const old = images.find((i) => i.Id === OLD);
      if (old) old.RepoTags = [];
      images.push({ Id: NEW, RepoTags: [TAG] });
    };
  }

  it("al actualizar borra la versión anterior", async () => {
    images = [{ Id: OLD, RepoTags: [TAG] }];
    containers = [{ ImageID: OLD, Names: ["/game-panel-doblaje"] }];
    pullBringsNewVersion();

    await start();

    expect(images.map((i) => i.Id)).toEqual([NEW]);
    expect(containers).toEqual([{ ImageID: NEW, Names: ["/game-panel-doblaje"] }]);
  });

  it("si la imagen no cambió, no borra nada", async () => {
    images = [{ Id: OLD, RepoTags: [TAG] }];
    containers = [{ ImageID: OLD, Names: ["/game-panel-doblaje"] }];

    await start();

    expect(removed).toEqual([]);
    expect(images.map((i) => i.Id)).toEqual([OLD]);
  });

  it("no borra la versión anterior si otro contenedor sigue con ella", async () => {
    images = [{ Id: OLD, RepoTags: [TAG] }];
    containers = [
      { ImageID: OLD, Names: ["/game-panel-doblaje"] },
      { ImageID: OLD, Names: ["/game-panel-doblaje-pruebas"] },
    ];
    pullBringsNewVersion();

    await start();

    expect(removed).toEqual([]);
    expect(images.map((i) => i.Id).sort()).toEqual([NEW, OLD].sort());
  });

  it("al cambiar de imagen borra la vieja, salvo que sea la de otro servidor", async () => {
    // El servidor pasó de java17 a `TAG`; java17 ya no lo usa su contenedor.
    const java17 = { Id: OLD, RepoTags: ["itzg/minecraft-server:java17"] };
    images = [java17, { Id: NEW, RepoTags: [TAG] }];
    containers = [{ ImageID: OLD, Names: ["/game-panel-doblaje"] }];

    await start({ keepImageRefs: ["itzg/minecraft-server:java17"] });
    expect(images).toContain(java17);

    containers = [{ ImageID: OLD, Names: ["/game-panel-doblaje"] }];
    await start({ keepImageRefs: [] });
    expect(images.map((i) => i.Id)).toEqual([NEW]);
  });

  it("si el contenedor nuevo no arranca, conserva la versión anterior", async () => {
    images = [{ Id: OLD, RepoTags: [TAG] }];
    containers = [{ ImageID: OLD, Names: ["/game-panel-doblaje"] }];
    pullBringsNewVersion();
    const { docker } = await import("./docker");
    const spy = vi.spyOn(docker, "createContainer").mockRejectedValueOnce(new Error("port busy"));

    await expect(start()).rejects.toThrow("port busy");

    expect(removed).toEqual([]);
    spy.mockRestore();
  });
});
