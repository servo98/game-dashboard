import { useMemo } from "react";
import {
  FieldRow,
  SectionHeading,
  SegmentedField,
  SelectField,
  SliderField,
  TextField,
  Toggle,
} from "./Fields";
import {
  buildServerArgs,
  isEnvTrue,
  parseServerArgs,
  VALHEIM_FIELDS,
  VALHEIM_KEY_TOGGLES,
  VALHEIM_MODIFIERS,
  VALHEIM_PRESETS,
  type ValheimField,
  type ValheimSection,
  type WorldModifiers,
  writeEnvBool,
} from "./valheim-config";

type EnvProps = {
  section: ValheimSection;
  envVars: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
};

/** Una sección del formulario guiado de Valheim (todo son variables de entorno). */
export function ValheimEnvSection({ section, envVars, onChange }: EnvProps) {
  const fields = VALHEIM_FIELDS.filter((f) => f.section === section);

  function set(key: string, value: string) {
    onChange({ ...envVars, [key]: value });
  }

  function renderField(field: ValheimField) {
    const raw = envVars[field.key];
    const value = raw ?? field.default;

    switch (field.type) {
      case "toggle":
        return (
          <FieldRow key={field.key} label={field.label} description={field.description}>
            <div className="flex sm:justify-end">
              <Toggle
                checked={isEnvTrue(value)}
                onChange={(on) => set(field.key, writeEnvBool(raw, on))}
              />
            </div>
          </FieldRow>
        );

      case "select":
        return (
          <FieldRow key={field.key} label={field.label} description={field.description}>
            <SelectField
              value={value}
              options={field.options ?? []}
              onChange={(v) => set(field.key, v)}
            />
          </FieldRow>
        );

      case "slider":
        return (
          <FieldRow key={field.key} label={field.label} description={field.description}>
            <SliderField
              value={value}
              min={field.min ?? 0}
              max={field.max ?? 100}
              step={field.step ?? 1}
              unit={field.unit}
              onChange={(v) => set(field.key, v)}
            />
          </FieldRow>
        );

      case "number":
        return (
          <FieldRow key={field.key} label={field.label} description={field.description}>
            <TextField type="number" value={value} onChange={(v) => set(field.key, v)} />
          </FieldRow>
        );

      case "password":
        return (
          <FieldRow
            key={field.key}
            label={field.label}
            description={field.description}
            hint={
              value.length > 0 && value.length < 5 ? (
                <span className="text-[10px] uppercase tracking-wide text-amber-400/90 border border-amber-700/60 rounded px-1 py-px">
                  muy corta
                </span>
              ) : undefined
            }
          >
            <TextField
              type="password"
              mono
              value={value}
              placeholder={field.placeholder}
              onChange={(v) => set(field.key, v)}
            />
          </FieldRow>
        );

      default:
        return (
          <FieldRow key={field.key} label={field.label} description={field.description}>
            <TextField
              value={value}
              placeholder={field.placeholder ?? field.default}
              onChange={(v) => set(field.key, v)}
            />
          </FieldRow>
        );
    }
  }

  return <div className="flex flex-col gap-3">{fields.map(renderField)}</div>;
}

type WorldProps = {
  envVars: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
};

/**
 * Modificadores de mundo. No son variables sueltas: se serializan todos juntos
 * dentro de `SERVER_ARGS` como argumentos del ejecutable.
 */
export function ValheimWorldSection({ envVars, onChange }: WorldProps) {
  const state = useMemo(() => parseServerArgs(envVars.SERVER_ARGS ?? ""), [envVars.SERVER_ARGS]);

  function update(next: WorldModifiers) {
    const args = buildServerArgs(next);
    const env = { ...envVars };
    if (args) env.SERVER_ARGS = args;
    else delete env.SERVER_ARGS;
    onChange(env);
  }

  const presetActive = state.preset !== "";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <SectionHeading
          title="Preset"
          subtitle="Aplica un paquete de ajustes de golpe. Al arrancar pisa los modificadores de abajo."
        />
        <SelectField
          value={state.preset}
          options={VALHEIM_PRESETS}
          onChange={(preset) => update({ ...state, preset })}
        />
      </div>

      <div>
        <SectionHeading
          title="Modificadores"
          subtitle={
            presetActive
              ? "Con un preset activo el juego los ignora — quita el preset para que manden estos."
              : "Cada eje por separado. «Normal» es el valor del juego y no se escribe."
          }
        />
        <div className={`flex flex-col gap-4 ${presetActive ? "opacity-50" : ""}`}>
          {VALHEIM_MODIFIERS.map((modifier) => (
            <div key={modifier.key}>
              <div className="mb-1.5">
                <span className="text-sm text-gray-200">{modifier.label}</span>
                <p className="text-xs text-gray-500">{modifier.description}</p>
              </div>
              <SegmentedField
                value={state.modifiers[modifier.key] ?? ""}
                options={modifier.values}
                onChange={(value) =>
                  update({ ...state, modifiers: { ...state.modifiers, [modifier.key]: value } })
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <SectionHeading title="Reglas extra" />
        <div className="flex flex-col gap-3">
          {VALHEIM_KEY_TOGGLES.map((toggle) => (
            <FieldRow key={toggle.key} label={toggle.label} description={toggle.description}>
              <div className="flex sm:justify-end">
                <Toggle
                  checked={state.keys.includes(toggle.key)}
                  onChange={(on) =>
                    update({
                      ...state,
                      keys: on
                        ? [...state.keys, toggle.key]
                        : state.keys.filter((k) => k !== toggle.key),
                    })
                  }
                />
              </div>
            </FieldRow>
          ))}
        </div>
      </div>

      <div>
        <SectionHeading
          title="Argumentos resultantes"
          subtitle="Es lo que acaba en SERVER_ARGS. Los modificadores sólo se aplican del todo en un mundo nuevo; en uno ya generado algunos requieren resetearlo."
        />
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs font-mono text-gray-400 break-all min-h-[2.25rem]">
          {buildServerArgs(state) || "(ninguno)"}
        </div>
      </div>
    </div>
  );
}
