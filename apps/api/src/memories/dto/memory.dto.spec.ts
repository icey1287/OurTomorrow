import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it } from "vitest";
import { CreatePlaceDto } from "../../places/dto/place.dto";
import { CreateMemoryDto } from "./memory.dto";

describe("stage 2 instant DTOs", () => {
  it.each(["2025-01-01", "2025-01-01T12:00:00"])(
    "rejects a memory instant without an explicit offset: %s",
    async (happenedAt) => {
      const dto = plainToInstance(CreateMemoryDto, {
        title: "有时区的回忆",
        happenedAt,
      });

      const errors = await validate(dto);

      expect(errors.some(({ property }) => property === "happenedAt")).toBe(
        true,
      );
    },
  );

  it.each(["2025-01-01T12:00:00.000Z", "2025-01-01T20:00:00+08:00"])(
    "accepts a memory instant with an explicit offset: %s",
    async (happenedAt) => {
      const dto = plainToInstance(CreateMemoryDto, {
        title: "有时区的回忆",
        happenedAt,
      });

      expect(await validate(dto)).toEqual([]);
    },
  );

  it("rejects a place visit instant without a timezone offset", async () => {
    const dto = plainToInstance(CreatePlaceDto, {
      name: "海边",
      firstVisitedAt: "2025-01-01T12:00:00",
    });

    const errors = await validate(dto);

    expect(errors.some(({ property }) => property === "firstVisitedAt")).toBe(
      true,
    );
  });
});
