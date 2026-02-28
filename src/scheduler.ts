import cron from "node-cron";
import type { Config } from "./config.js";
import { askAgent } from "./agent.js";

const tasks: cron.ScheduledTask[] = [];

export function startScheduler(config: Config) {
  const sched = config.scheduler;
  if (!sched?.enabled || !sched.jobs.length) return;

  for (const job of sched.jobs) {
    if (!cron.validate(job.cron)) {
      console.error(`[scheduler] Invalid cron: "${job.cron}" for job "${job.name}"`);
      continue;
    }
    const task = cron.schedule(job.cron, async () => {
      console.log(`[scheduler] Running "${job.name}" → agent "${job.agent}"`);
      try {
        const reply = await askAgent(config, job.agent, job.message);
        console.log(`[scheduler] "${job.name}" result: ${reply.slice(0, 200)}`);
      } catch (err: any) {
        console.error(`[scheduler] "${job.name}" error: ${err.message}`);
      }
    });
    tasks.push(task);
    console.log(`[scheduler] Registered "${job.name}" [${job.cron}] → ${job.agent}`);
  }
}

export function stopScheduler() {
  for (const t of tasks) t.stop();
  tasks.length = 0;
}
