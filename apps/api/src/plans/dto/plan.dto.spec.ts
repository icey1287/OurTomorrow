import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { CreatePlanDto } from "./plan.dto";

describe("plan DTOs", () => {
  it("requires explicit offsets for plan instants", async () => {
    const dto = plainToInstance(CreatePlanDto, {
      title: "去看海",
      startsAt: "2026-01-01T10:00:00",
    });

    const errors = await validate(dto);

    expect(errors.some(({ property }) => property === "startsAt")).toBe(true);
  });

  it("trims lightweight checklist fields", async () => {
    const dto = plainToInstance(CreatePlanDto, {
      title: "  去看海  ",
      startsAt: "2026-01-01T10:00:00+08:00",
      preparations: ["  带相机  "],
      participants: ["  我们  "],
    });

    expect(await validate(dto)).toEqual([]);
    expect(dto).toMatchObject({
      title: "去看海",
      preparations: ["带相机"],
      participants: ["我们"],
    });
  });
});
