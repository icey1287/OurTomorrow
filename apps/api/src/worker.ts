import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { SchedulerWorkerService } from "./scheduler/scheduler-worker.service";
import { WorkerModule } from "./worker.module";

async function bootstrapWorker(): Promise<void> {
  const context = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: true,
  });
  context.useLogger(new Logger("Worker"));
  context.enableShutdownHooks();
  context.get(SchedulerWorkerService).start();
}

void bootstrapWorker().catch((error: unknown) => {
  new Logger("Worker").error(
    "Worker failed to start",
    error instanceof Error ? error.stack : String(error),
  );
  process.exitCode = 1;
});
