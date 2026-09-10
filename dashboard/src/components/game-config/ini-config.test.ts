import { describe, expect, it } from "vitest";
import { applyCfgChanges, fieldKind, isDefaultValue, parseCfg, sliderStep } from "./ini-config";

const BEPINEX_CFG = `## Settings file was created by plugin MiMod v1.2.3
## Plugin GUID: com.ejemplo.mimod

[Logging]

## Enables showing a console for log output.
# Setting type: Boolean
# Default value: false
Enabled = false

## Cuánto daño extra hacen los enemigos.
# Setting type: Single
# Default value: 1
# Acceptable value range: From 0 to 5
DamageMultiplier = 1.5

## Nivel de detalle del log.
# Setting type: LogLevel
# Default value: Info
# Acceptable values: None, Error, Warning, Info, Debug
Level = Info

[General]

## Nombre a mostrar.
# Setting type: String
# Default value: Servidor
DisplayName = Servidor
`;

const VALHEIM_PLUS_CFG = `[Beehive]

; Change false to true to enable this section.
enabled=false

; Configure the speed at which the bees produce honey in seconds.
honeyProductionSpeed=1200
`;

describe("parseCfg — BepInEx", () => {
  const parsed = parseCfg(BEPINEX_CFG);

  it("agrupa las entradas por sección", () => {
    expect(parsed.sections.map((s) => s.name)).toEqual(["Logging", "General"]);
    expect(parsed.entryCount).toBe(4);
  });

  it("lee descripción, tipo y valor por defecto", () => {
    const entry = parsed.sections[0].entries[0];
    expect(entry.key).toBe("Enabled");
    expect(entry.value).toBe("false");
    expect(entry.description).toBe("Enables showing a console for log output.");
    expect(entry.settingType).toBe("Boolean");
    expect(entry.defaultValue).toBe("false");
  });

  it("lee el rango de valores aceptados", () => {
    const entry = parsed.sections[0].entries[1];
    expect(entry.min).toBe(0);
    expect(entry.max).toBe(5);
  });

  it("lee la lista de valores aceptados", () => {
    const entry = parsed.sections[0].entries[2];
    expect(entry.acceptableValues).toEqual(["None", "Error", "Warning", "Info", "Debug"]);
  });

  it("no arrastra metadatos de una entrada a la siguiente", () => {
    const displayName = parsed.sections[1].entries[0];
    expect(displayName.acceptableValues).toBeUndefined();
    expect(displayName.min).toBeUndefined();
  });

  it("no se traga la cabecera del fichero como descripción", () => {
    expect(parsed.sections[0].entries[0].description).not.toContain("Plugin GUID");
  });
});

describe("fieldKind", () => {
  const parsed = parseCfg(BEPINEX_CFG);
  const [enabled, damage, level] = parsed.sections[0].entries;

  it("Boolean -> toggle", () => {
    expect(fieldKind(enabled)).toBe("toggle");
  });

  it("rango numérico -> slider", () => {
    expect(fieldKind(damage)).toBe("slider");
  });

  it("valores aceptados -> select", () => {
    expect(fieldKind(level)).toBe("select");
  });

  it("String sin metadatos -> text", () => {
    expect(fieldKind(parsed.sections[1].entries[0])).toBe("text");
  });

  it("un enum de flags con varios valores se queda en text", () => {
    const flags = parseCfg(
      [
        "[Logging]",
        "",
        "# Setting type: LogLevel",
        "# Acceptable values: None, Error, Warning, Info",
        "Levels = Error, Warning",
      ].join("\n"),
    ).sections[0].entries[0];
    expect(fieldKind(flags)).toBe("text");
  });

  it("sin tipo declarado deduce por el valor", () => {
    const vplus = parseCfg(VALHEIM_PLUS_CFG).sections[0].entries;
    expect(fieldKind(vplus[0])).toBe("toggle");
    expect(fieldKind(vplus[1])).toBe("number");
  });
});

describe("sliderStep", () => {
  it("usa paso 1 para enteros", () => {
    const entry = parseCfg(
      ["[S]", "", "# Setting type: Int32", "# Acceptable value range: From 0 to 100", "N = 5"].join(
        "\n",
      ),
    ).sections[0].entries[0];
    expect(sliderStep(entry)).toBe(1);
  });

  it("afina el paso en rangos decimales cortos", () => {
    const entry = parseCfg(
      [
        "[S]",
        "",
        "# Setting type: Single",
        "# Acceptable value range: From 0 to 1",
        "N = 0.5",
      ].join("\n"),
    ).sections[0].entries[0];
    expect(sliderStep(entry)).toBe(0.01);
  });
});

describe("applyCfgChanges", () => {
  it("cambia sólo la línea del valor y respeta el resto del fichero", () => {
    const parsed = parseCfg(BEPINEX_CFG);
    const entry = parsed.sections[0].entries[0];
    const out = applyCfgChanges(parsed, { [entry.id]: "true" });

    expect(out).toContain("Enabled = true");
    expect(out).toContain("## Enables showing a console for log output.");
    expect(out).toContain("## Plugin GUID: com.ejemplo.mimod");
    expect(out.split("\n").length).toBe(BEPINEX_CFG.split("\n").length);
  });

  it("sin cambios devuelve el fichero idéntico", () => {
    const parsed = parseCfg(BEPINEX_CFG);
    expect(applyCfgChanges(parsed, {})).toBe(BEPINEX_CFG);
  });

  it("conserva el estilo sin espacios de ValheimPlus", () => {
    const parsed = parseCfg(VALHEIM_PLUS_CFG);
    const entry = parsed.sections[0].entries[1];
    const out = applyCfgChanges(parsed, { [entry.id]: "600" });
    expect(out).toContain("honeyProductionSpeed=600");
  });

  it("mantiene las comillas de los valores TOML", () => {
    const toml = ["[general]", "", "#Nombre", 'name = "hola"'].join("\n");
    const parsed = parseCfg(toml);
    const entry = parsed.sections[0].entries[0];
    expect(entry.value).toBe("hola");
    expect(applyCfgChanges(parsed, { [entry.id]: "adios" })).toContain('name = "adios"');
  });

  it("respeta los finales de línea CRLF", () => {
    const parsed = parseCfg("[S]\r\n\r\nKey = 1\r\n");
    const entry = parsed.sections[0].entries[0];
    expect(applyCfgChanges(parsed, { [entry.id]: "2" })).toBe("[S]\r\n\r\nKey = 2\r\n");
  });
});

describe("formatos que no son INI", () => {
  it("no inventa entradas a partir de un YAML", () => {
    const yaml = ["settings:", "  spawn-limit: 10", "  motd: hola"].join("\n");
    expect(parseCfg(yaml).entryCount).toBe(0);
  });

  it("lee server.properties aunque no tenga secciones", () => {
    const props = ["#Minecraft server properties", "max-players=20", "motd=A Server"].join("\n");
    const parsed = parseCfg(props);
    expect(parsed.entryCount).toBe(2);
    expect(parsed.sections[0].name).toBe("");
    expect(parsed.sections[0].entries[0].key).toBe("max-players");
  });

  it("lee los metadatos de un config de Forge", () => {
    const forge = [
      "[general]",
      "",
      "\t#Cuántos mobs por chunk",
      "\t#Range: 0 ~ 64",
      "\tmobCap = 32",
    ].join("\n");
    const entry = parseCfg(forge).sections[0].entries[0];
    expect(entry.min).toBe(0);
    expect(entry.max).toBe(64);
    expect(fieldKind(entry)).toBe("slider");
  });
});

describe("isDefaultValue", () => {
  it("detecta cuándo el valor sigue en su default", () => {
    const parsed = parseCfg(BEPINEX_CFG);
    expect(isDefaultValue(parsed.sections[0].entries[0])).toBe(true);
    expect(isDefaultValue(parsed.sections[0].entries[1])).toBe(false);
  });
});
