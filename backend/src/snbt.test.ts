import { describe, expect, it } from "vitest";
import { parseSNBT } from "./snbt";

describe("parseSNBT", () => {
  it("parses a simple compound", () => {
    const result = parseSNBT(`{
      name: "Hello"
      value: 42
    }`);
    expect(result).toEqual({ name: "Hello", value: 42 });
  });

  it("handles typed number suffixes", () => {
    const result = parseSNBT(`{
      byte_val: 1b
      short_val: 100s
      long_val: 9999L
      float_val: 1.5f
      double_val: 2.5d
    }`);
    expect(result).toEqual({
      byte_val: 1,
      short_val: 100,
      long_val: 9999,
      float_val: 1.5,
      double_val: 2.5,
    });
  });

  it("handles booleans", () => {
    const result = parseSNBT(`{
      flag1: true
      flag2: false
    }`);
    expect(result).toEqual({ flag1: true, flag2: false });
  });

  it("handles typed arrays", () => {
    const result = parseSNBT(`{
      int_array: [I; 1, 2, 3]
      long_array: [L; 100L, 200L]
    }`);
    expect(result).toEqual({
      int_array: [1, 2, 3],
      long_array: [100, 200],
    });
  });

  it("handles regular lists", () => {
    const result = parseSNBT(`{
      items: ["apple", "banana", "cherry"]
    }`);
    expect(result).toEqual({
      items: ["apple", "banana", "cherry"],
    });
  });

  it("handles nested compounds", () => {
    const result = parseSNBT(`{
      player: {
        name: "Steve"
        health: 20.0f
        pos: {
          x: 100.5d
          y: 64.0d
          z: -200.3d
        }
      }
    }`);
    expect(result).toEqual({
      player: {
        name: "Steve",
        health: 20,
        pos: { x: 100.5, y: 64, z: -200.3 },
      },
    });
  });

  it("handles comments", () => {
    const result = parseSNBT(`{
      # This is a comment
      name: "Test"
      # Another comment
      value: 1
    }`);
    expect(result).toEqual({ name: "Test", value: 1 });
  });

  it("handles quoted keys", () => {
    const result = parseSNBT(`{
      "key with spaces": "value"
      normal_key: "other"
    }`);
    expect(result).toEqual({
      "key with spaces": "value",
      normal_key: "other",
    });
  });

  it("handles escape sequences in strings", () => {
    const result = parseSNBT(`{
      text: "line1\\nline2"
      path: "C:\\\\Users"
      quote: "say \\"hello\\""
    }`);
    expect(result).toEqual({
      text: "line1\nline2",
      path: "C:\\Users",
      quote: 'say "hello"',
    });
  });

  it("handles newlines as separators (no commas)", () => {
    const result = parseSNBT(`{
      a: 1
      b: 2
      c: 3
    }`);
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("handles commas as separators", () => {
    const result = parseSNBT(`{a: 1, b: 2, c: 3}`);
    expect(result).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("handles empty compound", () => {
    const result = parseSNBT(`{}`);
    expect(result).toEqual({});
  });

  it("handles empty list", () => {
    const result = parseSNBT(`{ items: [] }`);
    expect(result).toEqual({ items: [] });
  });

  it("parses FTB Quest-like chapter structure", () => {
    const result = parseSNBT(`{
      id: "ABC123"
      group: 0
      order_index: 1
      filename: "basics"
      title: "Getting Started"
      icon: "minecraft:crafting_table"
      default_quest_shape: ""
      default_hide_dependency_lines: false
      quests: [
        {
          title: "Craft a Workbench"
          x: 0.0d
          y: 0.0d
          id: "DEF456"
          tasks: [
            {
              id: "GHI789"
              type: "item"
              item: "minecraft:crafting_table"
            }
          ]
          rewards: [
            {
              id: "JKL012"
              type: "xp"
              xp: 10
            }
          ]
        }
      ]
    }`);

    expect(result.id).toBe("ABC123");
    expect(result.title).toBe("Getting Started");
    expect(result.default_hide_dependency_lines).toBe(false);
    expect(Array.isArray(result.quests)).toBe(true);
    const quests = result.quests as Array<Record<string, unknown>>;
    expect(quests[0].title).toBe("Craft a Workbench");
    expect(quests[0].x).toBe(0);
    expect(quests[0].y).toBe(0);
  });

  it("parses FTB Quest progress-like structure", () => {
    const result = parseSNBT(`{
      uuid: "12345678-1234-1234-1234-123456789abc"
      completed: [
        "ABC123"
        "DEF456"
        "GHI789"
      ]
      started: [
        "JKL012"
      ]
    }`);

    expect(result.uuid).toBe("12345678-1234-1234-1234-123456789abc");
    expect(result.completed).toEqual(["ABC123", "DEF456", "GHI789"]);
    expect(result.started).toEqual(["JKL012"]);
  });

  it("handles negative numbers", () => {
    const result = parseSNBT(`{
      x: -100
      y: -50.5d
      z: -1L
    }`);
    expect(result).toEqual({ x: -100, y: -50.5, z: -1 });
  });

  it("handles bare string values", () => {
    const result = parseSNBT(`{
      type: item
      item: minecraft:diamond
    }`);
    expect(result).toEqual({ type: "item", item: "minecraft:diamond" });
  });

  it("handles byte array", () => {
    const result = parseSNBT(`{
      data: [B; 0b, 1b, 0b, 1b]
    }`);
    expect(result).toEqual({ data: [0, 1, 0, 1] });
  });
});
