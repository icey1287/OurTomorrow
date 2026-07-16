import { Controller, Get, HttpCode, HttpStatus, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ApiProperty,
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { Clock } from "../common/clock/clock";
import type { Environment } from "../config/env.schema";
import { PrismaService } from "../database/prisma.service";

class LiveHealthResponseDto {
  @ApiProperty({ enum: ["ok"] })
  status!: "ok";

  @ApiProperty({ example: "0.1.0" })
  version!: string;

  @ApiProperty({ format: "date-time" })
  timestamp!: string;
}

class ReadyHealthResponseDto {
  @ApiProperty({ enum: ["ok", "error"] })
  status!: "ok" | "error";

  @ApiProperty({ example: "0.1.0" })
  version!: string;

  @ApiProperty({ format: "date-time" })
  timestamp!: string;

  @ApiProperty({ enum: ["up", "down"] })
  database!: "up" | "down";
}

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly clock: Clock,
    private readonly prisma: PrismaService,
  ) {}

  @Get("live")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: "The API process is alive.",
    type: LiveHealthResponseDto,
  })
  live(): LiveHealthResponseDto {
    return {
      status: "ok",
      version: this.config.get("APP_VERSION", { infer: true }),
      timestamp: this.clock.now().toISOString(),
    };
  }

  @Get("ready")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: "The API and PostgreSQL are ready.",
    type: ReadyHealthResponseDto,
  })
  @ApiServiceUnavailableResponse({
    description: "PostgreSQL is not reachable.",
    type: ReadyHealthResponseDto,
  })
  async ready(
    @Res({ passthrough: true }) response: Response,
  ): Promise<ReadyHealthResponseDto> {
    const databaseReady = await this.prisma.isReady();
    if (!databaseReady) {
      response.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        status: "error",
        version: this.config.get("APP_VERSION", { infer: true }),
        timestamp: this.clock.now().toISOString(),
        database: "down",
      };
    }
    response.status(HttpStatus.OK);
    return {
      status: "ok",
      version: this.config.get("APP_VERSION", { infer: true }),
      timestamp: this.clock.now().toISOString(),
      database: "up",
    };
  }
}
