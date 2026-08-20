"""Temporal workflow — the locked intelligence mission as durable execution.
Deterministic orchestration only; failed stages surface honestly as INCOMPLETE
missions (§12: never fabricate)."""
from __future__ import annotations

from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy
from temporalio.exceptions import ActivityError

_RETRY = RetryPolicy(initial_interval=timedelta(seconds=3), maximum_attempts=3)
# A stage that never even starts has to say so. With only start_to_close set, an
# activity task handed to a worker that then died was simply lost: the task never
# reached ACTIVITY_TASK_STARTED, so no start_to_close clock ever ran, and the
# mission sat at PLANNED with an empty timeline and no error while a healthy
# worker polled the same queue beside it. That is the one outcome §12 rules out —
# not a failure, but a mission that looks like it is thinking and never is.
#
# Restarting the worker is routine here (it does not reload; see ops/dev.sh), so
# this is a normal event and not an exotic one. Ten minutes is far longer than any
# restart and shorter than a demo, and a schedule-to-start timeout is deliberately
# not retried — re-queuing a task nothing collected would just wait again. The
# workflow's ActivityError handler turns it into an INCOMPLETE mission carrying
# the reason, which is a thing the Studio Head can see and re-ask.
_OPTS = {
    "start_to_close_timeout": timedelta(minutes=6),
    "schedule_to_start_timeout": timedelta(minutes=10),
    "retry_policy": _RETRY,
}


@workflow.defn(name="MissionWorkflow")
class MissionWorkflow:
    @workflow.run
    async def run(self, mission_id: str) -> str:
        try:
            await workflow.execute_activity("signal.plan", mission_id, **_OPTS)
            await workflow.execute_activity("signal.research", mission_id, **_OPTS)
            await workflow.execute_activity("signal.verify", mission_id, **_OPTS)
            await workflow.execute_activity("signal.knowledge", mission_id, **_OPTS)
            await workflow.execute_activity("signal.synthesize", mission_id, **_OPTS)
            await workflow.execute_activity("signal.deepen", mission_id, **_OPTS)
            return await workflow.execute_activity("signal.complete", mission_id, **_OPTS)
        except ActivityError as err:
            return await workflow.execute_activity(
                "signal.incomplete",
                args=[mission_id, f"Durable stage failed after retries: {err.__cause__ or err}"],
                **_OPTS,
            )
