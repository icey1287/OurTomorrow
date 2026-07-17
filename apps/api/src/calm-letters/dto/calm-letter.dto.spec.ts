import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { CreateCalmLetterDto } from "./calm-letter.dto";

describe("CreateCalmLetterDto", () => {
  it("requires non-empty bounded content", async () => {
    const dto = plainToInstance(CreateCalmLetterDto, {
      purpose: "BE_HEARD",
      content: "   ",
    });

    const errors = await validate(dto);

    expect(errors.some(({ property }) => property === "content")).toBe(true);
  });

  it("rejects an unlock instant without an explicit offset", async () => {
    const dto = plainToInstance(CreateCalmLetterDto, {
      purpose: "DISCUSS_LATER",
      content: "等我们都平静一些再聊。",
      unlockAt: "2026-07-17T10:00:00",
    });

    const errors = await validate(dto);

    expect(errors.some(({ property }) => property === "unlockAt")).toBe(true);
  });

  it("accepts null or offset-aware unlock rules", async () => {
    for (const unlockAt of [null, "2026-07-17T18:00:00+08:00"]) {
      const dto = plainToInstance(CreateCalmLetterDto, {
        purpose: "SOLVE_TOGETHER",
        content: "我希望我们一起解决。",
        unlockAt,
      });

      expect(await validate(dto)).toEqual([]);
    }
  });
});
