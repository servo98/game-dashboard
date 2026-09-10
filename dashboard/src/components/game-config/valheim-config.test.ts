import { describe, expect, it } from "vitest";
import {
  buildServerArgs,
  getServerArgFlag,
  getValheimKnownKeys,
  isEnvTrue,
  parseServerArgs,
  setServerArgFlag,
  VALHEIM_FIELDS,
  VALHEIM_MODIFIERS,
  writeEnvBool,
} from "./valheim-config";

describe("parseServerArgs", () => {
  it("lee preset, modificadores y setkeys", () => {
    const state = parseServerArgs("-preset casual -modifier raids less -setkey nomap");
    expect(state.preset).toBe("casual");
    expect(state.modifiers).toEqual({ raids: "less" });
    expect(state.keys).toEqual(["nomap"]);
    expect(state.extraArgs).toEqual([]);
  });

  it("acumula varios modificadores", () => {
    const state = parseServerArgs("-modifier combat hard -modifier portals veryhard");
    expect(state.modifiers).toEqual({ combat: "hard", portals: "veryhard" });
  });

  it("conserva los argumentos que no conoce", () => {
    const state = parseServerArgs("-crossplay -instanceid 42 -modifier combat hard");
    expect(state.extraArgs).toEqual(["-crossplay", "-instanceid", "42"]);
    expect(state.modifiers).toEqual({ combat: "hard" });
  });

  it("no se traga un modificador desconocido como si lo entendiera", () => {
    const state = parseServerArgs("-modifier inventado mucho");
    expect(state.modifiers).toEqual({});
    expect(state.extraArgs).toContain("-modifier");
  });

  it("respeta las comillas dobles", () => {
    const state = parseServerArgs('-name "Mi Server" -preset hard');
    expect(state.preset).toBe("hard");
    expect(state.extraArgs).toEqual(["-name", "Mi Server"]);
  });

  it("una cadena vacía no rompe nada", () => {
    const state = parseServerArgs("");
    expect(state).toEqual({ preset: "", modifiers: {}, keys: [], flags: {}, extraArgs: [] });
  });
});

describe("buildServerArgs", () => {
  it("pone el preset delante de los modificadores", () => {
    const args = buildServerArgs({
      preset: "casual",
      modifiers: { raids: "less" },
      keys: [],
      flags: {},
      extraArgs: [],
    });
    expect(args.indexOf("-preset")).toBeLessThan(args.indexOf("-modifier"));
  });

  it("omite los modificadores en su valor normal", () => {
    const args = buildServerArgs({
      preset: "",
      modifiers: { raids: "", combat: "hard" },
      keys: [],
      flags: {},
      extraArgs: [],
    });
    expect(args).toBe("-modifier combat hard");
  });

  it("devuelve vacío cuando no hay nada configurado", () => {
    expect(buildServerArgs({ preset: "", modifiers: {}, keys: [], flags: {}, extraArgs: [] })).toBe(
      "",
    );
  });

  it("vuelve a poner comillas en los argumentos con espacios", () => {
    const args = buildServerArgs({
      preset: "",
      modifiers: {},
      keys: [],
      flags: {},
      extraArgs: ["-name", "Mi Server"],
    });
    expect(args).toBe('-name "Mi Server"');
  });

  it("hace round-trip sin perder nada", () => {
    const original = '-preset hard -modifier combat veryhard -setkey nomap -name "Mi Server"';
    expect(buildServerArgs(parseServerArgs(original))).toBe(original);
  });
});

describe("booleanos de entorno", () => {
  it("acepta las formas habituales de true", () => {
    for (const value of ["1", "true", "TRUE", "yes", "on"]) {
      expect(isEnvTrue(value)).toBe(true);
    }
  });

  it("todo lo demás es false", () => {
    for (const value of ["0", "false", "", undefined]) {
      expect(isEnvTrue(value)).toBe(false);
    }
  });

  it("mantiene el estilo 1/0 si la variable ya lo usaba", () => {
    expect(writeEnvBool("1", false)).toBe("0");
    expect(writeEnvBool("0", true)).toBe("1");
  });

  it("usa true/false para variables nuevas o textuales", () => {
    expect(writeEnvBool(undefined, true)).toBe("true");
    expect(writeEnvBool("false", true)).toBe("true");
  });
});

describe("getValheimKnownKeys", () => {
  it("cubre todos los campos del formulario y SERVER_ARGS", () => {
    const keys = getValheimKnownKeys();
    for (const field of VALHEIM_FIELDS) {
      expect(keys.has(field.key)).toBe(true);
    }
    expect(keys.has("SERVER_ARGS")).toBe(true);
  });
});

describe("modificador de portales", () => {
  it("no ofrece 'hard' como escalón aparte: es la regla vanilla, o sea Normal", () => {
    const portals = VALHEIM_MODIFIERS.find((m) => m.key === "portals")!;
    expect(portals.values.map((v) => v.value)).toEqual(["casual", "", "veryhard"]);
  });

  it("sigue leyendo un '-modifier portals hard' que ya estuviera escrito", () => {
    expect(parseServerArgs("-modifier portals hard").modifiers).toEqual({ portals: "hard" });
  });
});

describe("flags con valor dentro de SERVER_ARGS", () => {
  it("lee -saveinterval sin confundirlo con un argumento desconocido", () => {
    const state = parseServerArgs("-saveinterval 600 -preset hard");
    expect(state.flags).toEqual({ saveinterval: "600" });
    expect(state.extraArgs).toEqual([]);
    expect(state.preset).toBe("hard");
  });

  it("round-trip conservando modificadores y flags a la vez", () => {
    const original = "-preset hard -modifier raids more -setkey nomap -saveinterval 600";
    expect(buildServerArgs(parseServerArgs(original))).toBe(original);
  });

  it("escribe el flag sin tocar el resto de argumentos", () => {
    const out = setServerArgFlag("-modifier combat hard -crossplay", "saveinterval", "600");
    expect(out).toBe("-modifier combat hard -saveinterval 600 -crossplay");
  });

  it("sobrescribe el valor si el flag ya estaba", () => {
    expect(
      getServerArgFlag(
        setServerArgFlag("-saveinterval 1800", "saveinterval", "300"),
        "saveinterval",
      ),
    ).toBe("300");
  });

  it("un valor vacío borra el flag y puede dejar SERVER_ARGS a cero", () => {
    expect(setServerArgFlag("-saveinterval 600", "saveinterval", "")).toBe("");
  });

  it("devuelve cadena vacía cuando el flag no está puesto", () => {
    expect(getServerArgFlag("-preset hard", "saveinterval")).toBe("");
  });
});
